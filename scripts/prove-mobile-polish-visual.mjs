import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/mobile-notes-chat";
await mkdir(out, { recursive: true });

const report = { ok: true, baseUrl, cases: [], errors: [] };
const viewports = [
  { name: "short-phone", width: 360, height: 640 },
  { name: "iphone", width: 390, height: 844 },
  { name: "large-phone", width: 430, height: 932 },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function prepare(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("notverse.preferences", JSON.stringify({
      setupComplete: true,
      noteFont: "handwritten",
      readingInterests: ["Manga", "Novels", "PDFs"],
      discoveryMethods: ["title", "memory", "link"],
    }));
    localStorage.removeItem("readverse.chat");
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function getRect(page, selector) {
  return page.locator(selector).first().evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  });
}

async function getViewport(page) {
  return page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scale: visualViewport?.scale || 1,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
  }));
}

async function assertNewestVisible(page, threadSelector, itemSelector, label) {
  const state = await page.evaluate(({ threadSelector, itemSelector }) => {
    const thread = document.querySelector(threadSelector);
    if (!(thread instanceof HTMLElement)) return null;
    const candidates = itemSelector
      ? [...thread.querySelectorAll(itemSelector)]
      : [...thread.children];
    const visible = candidates.filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.height > 0;
    });
    const last = visible.at(-1);
    if (!(last instanceof HTMLElement)) return null;
    const t = thread.getBoundingClientRect();
    const l = last.getBoundingClientRect();
    return {
      thread: { top: t.top, bottom: t.bottom },
      last: { top: l.top, bottom: l.bottom },
      scrollTop: thread.scrollTop,
      clientHeight: thread.clientHeight,
      scrollHeight: thread.scrollHeight,
    };
  }, { threadSelector, itemSelector });

  assert(state, `${label}: missing thread or newest visible item`);
  assert(state.last.bottom <= state.thread.bottom + 1, `${label}: newest item is clipped below the scroll region ${JSON.stringify(state)}`);
  assert(state.last.top >= state.thread.top - 1, `${label}: newest item is clipped above the scroll region ${JSON.stringify(state)}`);
  return state;
}

async function testChat(page, browserName, viewport) {
  const prefix = `${browserName}-${viewport.name}`;
  await page.getByRole("button", { name: "Chat now", exact: true }).click();
  const panel = page.locator(".companion-panel.open");
  const editor = panel.locator("textarea.chat-composer-editor");
  const bridge = panel.locator("input.chat-input-state-bridge");
  await editor.waitFor();

  const initialEditorBox = await getRect(page, ".companion-panel.open .chat-composer-editor");
  const initialComposerBox = await getRect(page, ".companion-panel.open .chat-input");
  const draft = "I want a book about gambling psychology and probability, but I also want to edit this sentence before I send it so I can catch wording mistakes without the beginning disappearing off the side.";
  await editor.fill(draft);
  await page.waitForTimeout(150);

  const viewportState = await getViewport(page);
  const panelBox = await getRect(page, ".companion-panel.open");
  const historyBox = await getRect(page, ".companion-panel.open .chat-body");
  const composerBox = await getRect(page, ".companion-panel.open .chat-input");
  const editorBox = await getRect(page, ".companion-panel.open .chat-composer-editor");
  const draftScrollState = await editor.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: style.overflowY,
    };
  });
  const fontSize = Number.parseFloat(await editor.evaluate((node) => getComputedStyle(node).fontSize));
  const navState = await page.locator(".notverse-mobile-nav").evaluate((node) => {
    const style = getComputedStyle(node);
    return { opacity: style.opacity, pointerEvents: style.pointerEvents };
  });

  assert(fontSize >= 16, `${prefix}: ${fontSize}px composer can trigger iOS zoom`);
  assert(Math.abs(viewportState.scale - 1) < 0.01, `${prefix}: composer focus zoomed to ${viewportState.scale}`);
  assert(Math.abs(editorBox.height - initialEditorBox.height) <= 1, `${prefix}: long draft moved editor height ${initialEditorBox.height} -> ${editorBox.height}`);
  assert(Math.abs(composerBox.height - initialComposerBox.height) <= 1, `${prefix}: long draft moved composer height ${initialComposerBox.height} -> ${composerBox.height}`);
  assert(draftScrollState.scrollHeight > draftScrollState.clientHeight, `${prefix}: long draft is not internally scrollable ${JSON.stringify(draftScrollState)}`);
  assert(draftScrollState.overflowY === "auto" || draftScrollState.overflowY === "scroll", `${prefix}: long draft does not keep scrolling inside the fixed editor ${JSON.stringify(draftScrollState)}`);
  assert(editorBox.left >= -1 && editorBox.right <= viewportState.width + 1, `${prefix}: editor leaves viewport horizontally`);
  assert(panelBox.top >= -1 && panelBox.bottom <= viewportState.height + 1, `${prefix}: panel leaves viewport`);
  assert(historyBox.bottom <= composerBox.top + 1, `${prefix}: chat history sits underneath composer`);
  assert(navState.opacity === "0" && navState.pointerEvents === "none", `${prefix}: mobile navigation remains active behind chat`);
  assert((await editor.inputValue()) === draft, `${prefix}: visible editor lost part of the draft`);
  assert((await bridge.inputValue()) === draft, `${prefix}: editor and React state bridge disagree`);
  await page.screenshot({ path: `${out}/${prefix}-chat-draft.png`, fullPage: false });

  await editor.press("Shift+Enter");
  await editor.type("Second line for editing before send.");
  const multiline = await editor.inputValue();
  assert(multiline.includes("\nSecond line"), `${prefix}: Shift+Enter did not preserve an editable newline`);
  await page.screenshot({ path: `${out}/${prefix}-chat-editing.png`, fullPage: false });

  const before = await page.locator(".message-row.user").count();
  await editor.press("Enter");
  await page.waitForFunction((count) => document.querySelectorAll(".message-row.user").length > count, before, { timeout: 4000 });
  await page.waitForTimeout(500);
  assert((await editor.inputValue()) === "", `${prefix}: composer did not clear after send`);
  await assertNewestVisible(page, ".companion-panel.open .chat-body", ".message-row", `${prefix}/chat`);
  const sentHistory = await getRect(page, ".companion-panel.open .chat-body");
  const sentComposer = await getRect(page, ".companion-panel.open .chat-input");
  assert(sentHistory.bottom <= sentComposer.top + 1, `${prefix}: sent conversation extends under composer`);
  await page.screenshot({ path: `${out}/${prefix}-chat-sent.png`, fullPage: false });

  await editor.fill("Keyboard-open proof with a wrapping draft that must remain visible and editable above the software keyboard area.");
  await editor.focus();
  const keyboardHeight = viewport.height <= 700 ? 420 : 524;
  await page.setViewportSize({ width: viewport.width, height: keyboardHeight });
  await page.waitForFunction(() => {
    const panel = document.querySelector(".companion-panel.open");
    if (!(panel instanceof HTMLElement)) return false;
    return panel.getBoundingClientRect().bottom <= innerHeight + 1;
  }, null, { timeout: 2500 });
  await page.waitForTimeout(80);
  const keyboardViewport = await getViewport(page);
  const keyboardPanel = await getRect(page, ".companion-panel.open");
  const keyboardComposer = await getRect(page, ".companion-panel.open .chat-input");
  const keyboardEditor = await getRect(page, ".companion-panel.open .chat-composer-editor");
  assert(keyboardPanel.bottom <= keyboardViewport.height + 1, `${prefix}: panel exceeds keyboard-sized viewport`);
  assert(keyboardComposer.bottom <= keyboardViewport.height + 1, `${prefix}: composer hides below keyboard-sized viewport`);
  assert(keyboardEditor.bottom <= keyboardViewport.height + 1, `${prefix}: visible draft hides below keyboard-sized viewport`);
  assert(Math.abs(keyboardViewport.scale - 1) < 0.01, `${prefix}: keyboard focus zoomed to ${keyboardViewport.scale}`);
  await page.screenshot({ path: `${out}/${prefix}-chat-keyboard.png`, fullPage: false });

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Close chat" }).click();
}

async function testInbox(page, browserName, viewport) {
  const prefix = `${browserName}-${viewport.name}`;
  await page.getByRole("button", { name: "Inbox", exact: true }).last().click();
  const input = page.locator(".inbox-layout main > form input");
  await input.waitFor();
  const message = `Mobile clearance ${browserName} ${viewport.name}: the whole outgoing bubble must stay above the composer and navigation.`;
  await input.fill(message);
  await input.press("Enter");
  await page.waitForFunction((expected) => {
    const last = document.querySelector(".inbox-layout .message-thread")?.lastElementChild;
    return last?.firstChild?.textContent?.trim() === expected;
  }, message);
  await page.waitForTimeout(250);

  const viewportState = await getViewport(page);
  const thread = await getRect(page, ".inbox-layout .message-thread");
  const composer = await getRect(page, ".inbox-layout main > form");
  const focusedState = await page.evaluate(() => {
    const nav = document.querySelector(".notverse-mobile-nav");
    const style = nav ? getComputedStyle(nav) : null;
    return {
      focusedMode: document.body.classList.contains("notverse-inbox-keyboard"),
      navDisplay: style?.display || "",
      navVisibility: style?.visibility || "",
      navOpacity: style?.opacity || "",
      navPointerEvents: style?.pointerEvents || "",
    };
  });
  assert(focusedState.focusedMode, `${prefix}: Inbox did not enter focused keyboard mode`);
  assert(
    focusedState.navDisplay === "none" || focusedState.navVisibility === "hidden" || focusedState.navOpacity === "0" || focusedState.navPointerEvents === "none",
    `${prefix}: mobile navigation remains active during focused Inbox composition ${JSON.stringify(focusedState)}`,
  );
  assert(thread.bottom <= composer.top + 1, `${prefix}: Inbox thread extends underneath composer`);
  assert(composer.top >= -1 && composer.bottom <= viewportState.height + 1, `${prefix}: Inbox composer leaves viewport`);
  await assertNewestVisible(page, ".inbox-layout .message-thread", null, `${prefix}/inbox`);
  await page.screenshot({ path: `${out}/${prefix}-inbox-sent.png`, fullPage: false });

  await input.blur();
  await page.waitForFunction(() => !document.body.classList.contains("notverse-inbox-keyboard"));
}

async function testSearch(page, browserName, viewport) {
  const prefix = `${browserName}-${viewport.name}`;
  await page.getByRole("button", { name: "Search", exact: true }).last().click();
  await page.locator(".search-action-grid").waitFor();
  const state = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".search-action-grid > button")];
    const rects = cards.map((card) => {
      const box = card.getBoundingClientRect();
      return { top: box.top, left: box.left, right: box.right, bottom: box.bottom };
    });
    const descriptions = cards.map((card) => {
      const node = card.querySelector("small");
      if (!(node instanceof HTMLElement)) return null;
      const style = getComputedStyle(node);
      return { whiteSpace: style.whiteSpace, text: node.textContent };
    }).filter(Boolean);
    return { width: document.documentElement.scrollWidth, viewport: innerWidth, rects, descriptions };
  });
  assert(state.width <= state.viewport + 2, `${prefix}: Search creates horizontal overflow ${state.width} > ${state.viewport}`);
  if (viewport.height <= 700 && state.rects.length >= 3) {
    assert(Math.abs(state.rects[0].top - state.rects[1].top) <= 2, `${prefix}: first two Search actions do not share a row`);
    assert(state.rects[2].top > state.rects[0].top + 2, `${prefix}: short-phone Search still squeezes three cards into a row`);
    assert(state.descriptions.every((item) => item.whiteSpace !== "nowrap"), `${prefix}: Search descriptions are still single-line clipped`);
  }
  await page.screenshot({ path: `${out}/${prefix}-search.png`, fullPage: false });
}

async function runCase(browserType, browserName, viewport) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await prepare(page);
    await testChat(page, browserName, viewport);
    await testInbox(page, browserName, viewport);
    await testSearch(page, browserName, viewport);
    report.cases.push({ browser: browserName, viewport });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const viewport of viewports) {
    try {
      await runCase(browserType, browserName, viewport);
    } catch (error) {
      report.ok = false;
      report.errors.push(`${browserName}/${viewport.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

await writeFile(`${out}/mobile-polish-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Mobile polish visual proof passed (${report.cases.length} browser/viewport cases).`);
