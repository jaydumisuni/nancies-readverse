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

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const body = document.querySelector(".companion-panel.open .chat-body");
    const thread = document.querySelector(".inbox-layout .message-thread");
    return {
      viewport: { width: innerWidth, height: innerHeight, scale: visualViewport?.scale || 1 },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      panel: rect(".companion-panel.open"),
      chatBody: rect(".companion-panel.open .chat-body"),
      chatComposer: rect(".companion-panel.open .chat-input"),
      editor: rect(".companion-panel.open .chat-composer-editor"),
      mobileNav: rect(".notverse-mobile-nav"),
      inboxThread: rect(".inbox-layout .message-thread"),
      inboxComposer: rect(".inbox-layout main > form"),
      chatScroll: body instanceof HTMLElement ? { top: body.scrollTop, height: body.clientHeight, scrollHeight: body.scrollHeight } : null,
      inboxScroll: thread instanceof HTMLElement ? { top: thread.scrollTop, height: thread.clientHeight, scrollHeight: thread.scrollHeight } : null,
      navStyle: (() => {
        const nav = document.querySelector(".notverse-mobile-nav");
        if (!(nav instanceof HTMLElement)) return null;
        const style = getComputedStyle(nav);
        return { opacity: style.opacity, pointerEvents: style.pointerEvents, visibility: style.visibility };
      })(),
    };
  });
}

async function assertLatestInside(page, threadSelector, label) {
  const state = await page.evaluate((selector) => {
    const thread = document.querySelector(selector);
    if (!(thread instanceof HTMLElement)) return null;
    const children = [...thread.children].filter((node) => node instanceof HTMLElement);
    const last = children.at(-1);
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
  }, threadSelector);
  assert(state, `${label}: missing thread or newest message`);
  assert(state.last.bottom <= state.thread.bottom + 1, `${label}: newest content is clipped below its scrolling area ${JSON.stringify(state)}`);
  assert(state.last.top >= state.thread.top - 1 || state.scrollHeight > state.clientHeight, `${label}: newest content is outside its scrolling area ${JSON.stringify(state)}`);
  assert(state.scrollTop + state.clientHeight >= state.scrollHeight - 2, `${label}: thread is not anchored to newest content ${JSON.stringify(state)}`);
  return state;
}

async function runPhone(browserType, browserName, viewport) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const prefix = `${browserName}-${viewport.name}`;

  try {
    await prepare(page);

    await page.getByRole("button", { name: "Chat now", exact: true }).click();
    const editor = page.locator(".companion-panel.open textarea.chat-composer-editor");
    await editor.waitFor();
    const longDraft = "I want a book about gambling psychology and probability, but I also want to edit this sentence before I send it so I can catch wording mistakes without the beginning disappearing off the side.";
    await editor.fill(longDraft);
    await page.waitForTimeout(120);

    const fontSize = Number.parseFloat(await editor.evaluate((node) => getComputedStyle(node).fontSize));
    const initial = await geometry(page);
    assert(fontSize >= 16, `${prefix}: composer font ${fontSize}px can trigger iOS zoom`);
    assert(initial.viewport.scale === 1, `${prefix}: composer focus zoomed viewport to ${initial.viewport.scale}`);
    assert(initial.editor && initial.editor.height > 44, `${prefix}: long draft did not expand vertically`);
    assert(initial.editor.right <= initial.viewport.width + 1 && initial.editor.left >= -1, `${prefix}: editor leaves viewport horizontally`);
    assert(initial.panel && initial.panel.top >= -1 && initial.panel.bottom <= initial.viewport.height + 1, `${prefix}: chat panel leaves viewport`);
    assert(initial.chatBody && initial.chatComposer && initial.chatBody.bottom <= initial.chatComposer.top + 1, `${prefix}: chat history extends under composer`);
    assert(initial.navStyle?.opacity === "0" && initial.navStyle?.pointerEvents === "none", `${prefix}: mobile navigation remains active behind chat`);
    assert((await editor.inputValue()) === longDraft, `${prefix}: visible draft is not fully retained`);
    await page.screenshot({ path: `${out}/${prefix}-chat-draft.png`, fullPage: false });

    await editor.press("Shift+Enter");
    await editor.type("Second line for editing before send.");
    assert((await editor.inputValue()).includes("\nSecond line"), `${prefix}: Shift+Enter did not create an editable line`);
    await page.screenshot({ path: `${out}/${prefix}-chat-editing.png`, fullPage: false });

    const before = await page.locator(".message-row.user").count();
    await editor.press("Enter");
    await page.waitForFunction((count) => document.querySelectorAll(".message-row.user").length > count, before, { timeout: 4000 });
    await page.waitForTimeout(350);
    assert((await editor.inputValue()) === "", `${prefix}: draft did not clear after send`);
    const sent = await geometry(page);
    assert(sent.chatBody && sent.chatComposer && sent.chatBody.bottom <= sent.chatComposer.top + 1, `${prefix}: sent chat history extends under composer`);
    const chatLatest = await assertLatestInside(page, ".companion-panel.open .chat-body", `${prefix}/chat`);
    await page.screenshot({ path: `${out}/${prefix}-chat-sent.png`, fullPage: false });

    await editor.fill("Keyboard-open proof with a wrapping draft that must remain visible and editable above the software keyboard area.");
    await editor.focus();
    const keyboardHeight = viewport.height <= 700 ? 420 : 524;
    await page.setViewportSize({ width: viewport.width, height: keyboardHeight });
    await page.waitForTimeout(320);
    const keyboard = await geometry(page);
    assert(keyboard.panel && keyboard.panel.bottom <= keyboard.viewport.height + 1, `${prefix}: chat panel exceeds keyboard-sized viewport`);
    assert(keyboard.chatComposer && keyboard.chatComposer.bottom <= keyboard.viewport.height + 1, `${prefix}: composer hides below keyboard-sized viewport`);
    assert(keyboard.editor && keyboard.editor.bottom <= keyboard.viewport.height + 1, `${prefix}: visible editor hides below keyboard-sized viewport`);
    assert(keyboard.viewport.scale === 1, `${prefix}: keyboard focus zoomed viewport to ${keyboard.viewport.scale}`);
    await page.screenshot({ path: `${out}/${prefix}-chat-keyboard.png`, fullPage: false });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(180);
    await page.getByRole("button", { name: "Close chat" }).click();

    await page.getByRole("button", { name: "Inbox", exact: true }).last().click();
    const inboxInput = page.locator(".inbox-layout main > form input");
    await inboxInput.waitFor();
    const inboxText = `Mobile clearance ${browserName} ${viewport.name}: the whole outgoing bubble must stay above the composer and navigation.`;
    await inboxInput.fill(inboxText);
    await inboxInput.press("Enter");
    await page.getByText(inboxText, { exact: true }).waitFor();
    await page.waitForTimeout(200);
    const inbox = await geometry(page);
    assert(inbox.inboxThread && inbox.inboxComposer && inbox.inboxThread.bottom <= inbox.inboxComposer.top + 1, `${prefix}: Inbox thread extends under composer ${JSON.stringify(inbox)}`);
    assert(inbox.inboxComposer && inbox.inboxComposer.top >= -1 && inbox.inboxComposer.bottom <= inbox.viewport.height + 1, `${prefix}: Inbox composer leaves viewport ${JSON.stringify(inbox.inboxComposer)}`);
    assert(inbox.mobileNav && inbox.inboxComposer && inbox.inboxComposer.bottom <= inbox.mobileNav.top + 1, `${prefix}: Inbox composer sits behind mobile navigation ${JSON.stringify({ composer: inbox.inboxComposer, nav: inbox.mobileNav })}`);
    const inboxLatest = await assertLatestInside(page, ".inbox-layout .message-thread", `${prefix}/inbox`);
    await page.screenshot({ path: `${out}/${prefix}-inbox-sent.png`, fullPage: false });

    await page.getByRole("button", { name: "Search", exact: true }).last().click();
    await page.locator(".search-action-grid").waitFor();
    const search = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".search-action-grid > button")];
      const rects = cards.map((card) => {
        const box = card.getBoundingClientRect();
        return { top: box.top, left: box.left, right: box.right, bottom: box.bottom };
      });
      const descriptions = cards.map((card) => {
        const node = card.querySelector("small");
        if (!(node instanceof HTMLElement)) return null;
        const style = getComputedStyle(node);
        return { whiteSpace: style.whiteSpace, overflow: style.overflow, text: node.textContent };
      }).filter(Boolean);
      return { width: document.documentElement.scrollWidth, viewport: innerWidth, rects, descriptions };
    });
    assert(search.width <= search.viewport + 2, `${prefix}: Search creates horizontal overflow ${search.width} > ${search.viewport}`);
    if (viewport.height <= 700 && search.rects.length >= 3) {
      assert(Math.abs(search.rects[0].top - search.rects[1].top) <= 2, `${prefix}: first two Search actions should share a row`);
      assert(search.rects[2].top > search.rects[0].top + 2, `${prefix}: short-phone Search still squeezes three actions into one row`);
      assert(search.descriptions.every((item) => item.whiteSpace !== "nowrap"), `${prefix}: short-phone Search description is still single-line clipped`);
    }
    await page.screenshot({ path: `${out}/${prefix}-search.png`, fullPage: false });

    report.cases.push({ prefix, viewport, initial, sent, keyboard, inbox, chatLatest, inboxLatest, search });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const viewport of viewports) {
    try {
      await runPhone(browserType, browserName, viewport);
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
