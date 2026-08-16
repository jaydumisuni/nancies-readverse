import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/real-device-mobile";
await mkdir(out, { recursive: true });

const report = { ok: true, cases: [], errors: [] };
const assert = (value, message) => { if (!value) throw new Error(message); };

async function prepare(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("notverse.preferences", JSON.stringify({
      setupComplete: true,
      noteFont: "handwritten",
      readingInterests: ["Manga", "Novels", "PDFs"],
      discoveryMethods: ["title", "memory", "link"],
    }));
  });
  await page.reload({ waitUntil: "networkidle" });
}

function rect(page, selector) {
  return page.locator(selector).first().evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
  });
}

async function injectViewport(page, { height, width, offsetTop = 0, offsetLeft = 0 }) {
  return page.evaluate(({ height, width, offsetTop, offsetLeft }) => {
    const viewport = visualViewport;
    if (!viewport) return false;
    try {
      Object.defineProperties(viewport, {
        height: { configurable: true, value: height },
        width: { configurable: true, value: width },
        offsetTop: { configurable: true, value: offsetTop },
        offsetLeft: { configurable: true, value: offsetLeft },
      });
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
      return true;
    } catch {
      return false;
    }
  }, { height, width, offsetTop, offsetLeft });
}

async function simulateRenderedPan(page, x, y) {
  await page.evaluate(({ x, y }) => {
    const app = document.querySelector(".readverse-app");
    if (!(app instanceof HTMLElement)) throw new Error("readverse app missing");
    app.style.setProperty("transform", `translate3d(${-x}px, ${-y}px, 0)`, "important");
  }, { x, y });
}

async function clearRenderedPan(page) {
  await page.evaluate(() => {
    const app = document.querySelector(".readverse-app");
    if (app instanceof HTMLElement) app.style.removeProperty("transform");
  });
}

async function waitAnchored(page, selector, visibleHeight, tolerance = 0.75) {
  await page.waitForFunction(({ selector, visibleHeight, tolerance }) => {
    const node = document.querySelector(selector);
    if (!(node instanceof HTMLElement)) return false;
    const box = node.getBoundingClientRect();
    return Math.abs(box.left) <= tolerance && Math.abs(box.top) <= tolerance && Math.abs(box.bottom - visibleHeight) <= tolerance;
  }, { selector, visibleHeight, tolerance }, { timeout: 2200 });
}

async function bubbleAnchors(page, selector) {
  return page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    const row = node.closest(".message-row");
    return {
      left: box.left,
      right: box.right,
      width: box.width,
      user: Boolean(row?.classList.contains("user")),
    };
  }));
}

function sameHorizontalAnchors(before, after, label, tolerance = 1.25) {
  assert(before.length === after.length, `${label}: bubble count changed`);
  before.forEach((box, index) => {
    const edge = box.user ? "right" : "left";
    assert(
      Math.abs(after[index][edge] - box[edge]) <= tolerance,
      `${label}: bubble ${index} ${edge} edge moved sideways ${box[edge]} -> ${after[index][edge]}`,
    );
  });
}

async function exerciseStaleOffsetTransition(page, { surface, composer, bubbles, width, keyboardHeight, label }) {
  const beforeBubbles = bubbles ? await bubbleAnchors(page, bubbles) : [];

  /* Phase 1: keyboard resize arrives, but WebKit still reports offsetTop=0. */
  assert(await injectViewport(page, { width, height: keyboardHeight, offsetTop: 0, offsetLeft: 0 }), `${label}: cannot inject keyboard viewport`);

  /* Phase 2: WebKit visually pans the rendered document before offsetTop catches up. */
  await simulateRenderedPan(page, 22, 84);
  await page.waitForTimeout(120);
  await waitAnchored(page, surface, keyboardHeight);

  const staleSurface = await rect(page, surface);
  const staleComposer = await rect(page, composer);
  assert(Math.abs(staleSurface.width - width) <= 1, `${label}: conversation width changed during rendered pan (${staleSurface.width} vs ${width})`);
  assert(Math.abs(staleComposer.bottom - keyboardHeight) <= 1.25, `${label}: composer floats during stale-offset pan (${staleComposer.bottom} vs ${keyboardHeight})`);
  assert(Math.abs(staleSurface.left) <= .75 && Math.abs(staleSurface.top) <= .75, `${label}: surface moved during stale-offset pan`);
  if (bubbles) sameHorizontalAnchors(beforeBubbles, await bubbleAnchors(page, bubbles), `${label} stale-offset`);

  /* Phase 3: offsetTop/offsetLeft finally report the pan. Reported offsets must
     not translate the already anchored conversation or keyboard edge. */
  assert(await injectViewport(page, { width: Math.max(240, width - 36), height: keyboardHeight, offsetTop: 84, offsetLeft: 22 }), `${label}: cannot inject delayed viewport offsets`);
  await page.waitForTimeout(160);
  await waitAnchored(page, surface, keyboardHeight);

  const settledSurface = await rect(page, surface);
  const settledComposer = await rect(page, composer);
  assert(Math.abs(settledSurface.width - width) <= 1, `${label}: reported viewport width resized the conversation (${settledSurface.width} vs ${width})`);
  assert(Math.abs(settledComposer.bottom - staleComposer.bottom) <= 1.25, `${label}: composer jumped after delayed offset (${staleComposer.bottom} -> ${settledComposer.bottom})`);
  assert(Math.abs(settledComposer.bottom - keyboardHeight) <= 1.25, `${label}: composer not flush after delayed offset`);
  assert(Math.abs(settledSurface.left) <= .75 && Math.abs(settledSurface.top) <= .75, `${label}: surface drifted after delayed offset`);
  if (bubbles) sameHorizontalAnchors(beforeBubbles, await bubbleAnchors(page, bubbles), `${label} settled`);

  await clearRenderedPan(page);
  return { staleSurface, staleComposer, settledSurface, settledComposer };
}

async function proveChat(browserType, browserName, width, height, keyboardHeight) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.getByRole("button", { name: "Chat now", exact: true }).click();
    const editor = page.locator(".companion-panel.open textarea.chat-composer-editor");
    await editor.waitFor();
    await editor.fill("A long mobile draft must stay visible without moving the composer or the conversation sideways while Safari opens the keyboard.");
    await editor.focus();
    const editorBefore = await rect(page, ".companion-panel.open .chat-composer-editor");
    const result = await exerciseStaleOffsetTransition(page, {
      surface: ".companion-panel.open",
      composer: ".companion-panel.open .chat-input",
      bubbles: ".companion-panel.open .message-row .message-bubble",
      width,
      keyboardHeight,
      label: `${browserName}/${width} chat`,
    });
    const editorAfter = await rect(page, ".companion-panel.open .chat-composer-editor");
    assert(Math.abs(editorAfter.height - editorBefore.height) <= 1, `${browserName}/${width}: chat editor resized during keyboard transition`);
    await page.screenshot({ path: `${out}/${browserName}-${width}-chat-transition.png`, fullPage: false });
    report.cases.push({ kind: "chat-transition", browserName, width, height, keyboardHeight, ...result });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveReplies(browserType, browserName, width, height, keyboardHeight) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.getByRole("button", { name: "Notes", exact: true }).last().click();
    await page.locator(".note-social-actions > button").nth(1).click();
    const input = page.locator(".replies-drawer input");
    await input.waitFor();
    const openInput = await rect(page, ".replies-drawer input");
    const openForm = await rect(page, ".replies-drawer > form");
    assert(openInput.height >= 46, `${browserName}/${width}: reply field is visually too small`);
    assert(openForm.bottom <= height + 2, `${browserName}/${width}: reply field is not visible before focus`);
    await input.fill("This comment must stay attached to the keyboard.");
    await input.focus();
    const result = await exerciseStaleOffsetTransition(page, {
      surface: ".replies-backdrop",
      composer: ".replies-drawer > form",
      bubbles: null,
      width,
      keyboardHeight,
      label: `${browserName}/${width} replies`,
    });
    await page.screenshot({ path: `${out}/${browserName}-${width}-replies-transition.png`, fullPage: false });
    report.cases.push({ kind: "replies-transition", browserName, width, height, keyboardHeight, openInput, ...result });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveInbox(browserType, browserName, width, height, keyboardHeight) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.locator(".notverse-mobile-nav button").filter({ hasText: "Inbox" }).click();
    const firstThread = page.locator(".inbox-layout > aside button").first();
    await firstThread.waitFor({ state: "visible" });
    await firstThread.click();
    await page.locator("body.notverse-inbox-thread-open").waitFor({ state: "attached" });
    const input = page.getByRole("textbox", { name: "Private message" });
    await input.waitFor({ state: "visible" });
    await input.fill("Inbox text stays visible and the thread never shifts sideways.");
    await input.focus();
    const result = await exerciseStaleOffsetTransition(page, {
      surface: ".main-shell.notverse-shell",
      composer: ".inbox-layout main > form",
      bubbles: ".inbox-layout .message-thread > p",
      width,
      keyboardHeight,
      label: `${browserName}/${width} inbox`,
    });
    await page.screenshot({ path: `${out}/${browserName}-${width}-inbox-transition.png`, fullPage: false });
    report.cases.push({ kind: "inbox-transition", browserName, width, height, keyboardHeight, ...result });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveNoteActions(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.getByRole("button", { name: "Notes", exact: true }).last().click();
    const buttons = page.locator(".note-social-actions > button");
    await buttons.first().waitFor();
    const metrics = await buttons.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const icon = node.querySelector("b");
      const label = node.querySelector("span");
      return {
        width: box.width,
        height: box.height,
        iconSize: icon ? parseFloat(getComputedStyle(icon).fontSize) : 0,
        labelSize: label ? parseFloat(getComputedStyle(label, "::after").fontSize || getComputedStyle(label).fontSize) : 0,
      };
    }));
    assert(metrics.length === 4, `${browserName}: expected four Note actions`);
    metrics.forEach((metric, index) => {
      assert(metric.height >= 54, `${browserName}: Note action ${index} visually too short (${metric.height})`);
      assert(metric.iconSize >= 19, `${browserName}: Note action ${index} icon too small (${metric.iconSize})`);
    });
    const commentLabel = await page.locator(".note-social-actions > button").nth(1).locator("span").evaluate((node) => getComputedStyle(node, "::after").content);
    assert(commentLabel.includes("Comment"), `${browserName}: Comment action is not explicit`);
    const activity = page.locator(".notes-activity-button");
    const activityBox = await activity.evaluate((node) => node.getBoundingClientRect().toJSON());
    const activityLabel = await activity.evaluate((node) => getComputedStyle(node, "::after").content);
    assert(activityBox.width >= 74, `${browserName}: Activity control too small (${activityBox.width})`);
    assert(activityLabel.includes("Activity"), `${browserName}: Activity control is not discoverable`);
    await page.screenshot({ path: `${out}/${browserName}-360-note-actions.png`, fullPage: false });
    report.cases.push({ kind: "note-actions", browserName, metrics, activityWidth: activityBox.width });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const [width, height, keyboardHeight] of [[360, 640, 420], [390, 844, 524]]) {
    for (const proof of [proveChat, proveReplies, proveInbox]) {
      try {
        await proof(browserType, browserName, width, height, keyboardHeight);
      } catch (error) {
        report.ok = false;
        report.errors.push(`${browserName}/${width}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  try {
    await proveNoteActions(browserType, browserName);
  } catch (error) {
    report.ok = false;
    report.errors.push(`${browserName}/note-actions: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await writeFile(`${out}/real-device-mobile-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Real-device mobile transition proof passed (${report.cases.length} cases).`);