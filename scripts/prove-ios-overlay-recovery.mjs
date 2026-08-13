import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/ios-overlay-recovery";
await mkdir(out, { recursive: true });

const report = { ok: true, cases: [], errors: [] };
const assert = (value, message) => { if (!value) throw new Error(message); };

function rect(page, selector) {
  return page.locator(selector).first().evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      width: box.width,
      height: box.height,
    };
  });
}

async function prepare(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem(
      "notverse.preferences",
      JSON.stringify({
        setupComplete: true,
        noteFont: "handwritten",
        readingInterests: ["Manga", "Novels", "PDFs"],
        discoveryMethods: ["title", "memory", "link"],
      }),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function injectVisualViewport(page, { offsetTop, width, height }) {
  return page.evaluate(
    ({ offsetTop, width, height }) => {
      const viewport = visualViewport;
      if (!viewport) return false;
      try {
        Object.defineProperties(viewport, {
          offsetTop: { configurable: true, value: offsetTop },
          offsetLeft: { configurable: true, value: 0 },
          width: { configurable: true, value: width },
          height: { configurable: true, value: height },
        });
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("resize"));
        return true;
      } catch {
        return false;
      }
    },
    { offsetTop, width, height },
  );
}

async function visualBottom(page) {
  return page.evaluate(() => {
    const viewport = visualViewport;
    const top = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
    const height = Math.max(1, Math.round(viewport?.height ?? innerHeight));
    return Math.min(innerHeight, top + height);
  });
}

async function navHidden(page) {
  return page.locator(".mobile-nav.notverse-mobile-nav").evaluate((node) => {
    const style = getComputedStyle(node);
    return style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0;
  });
}

function flushToBottom(box, bottom, label, tolerance = 4) {
  const gap = Math.abs(bottom - box.bottom);
  assert(gap <= tolerance, `${label} leaves ${gap.toFixed(2)}px between composer and keyboard edge (bottom ${bottom}, rect ${box.bottom})`);
}

async function openChat(page) {
  await page.getByRole("button", { name: "Chat now", exact: true }).click();
  const editor = page.locator(".companion-panel.open textarea.chat-composer-editor");
  await editor.waitFor();
  return editor;
}

async function openReplies(page) {
  await page.getByRole("button", { name: "Notes", exact: true }).last().click();
  await page.locator(".note-paper > footer button").nth(1).click();
  const input = page.locator(".replies-drawer input");
  await input.waitFor();
  return input;
}

async function openInbox(page) {
  await page.locator(".notverse-mobile-nav button").filter({ hasText: "Inbox" }).click();
  await page.locator(".inbox-view").waitFor();
  const input = page.getByRole("textbox", { name: "Private message" });
  await input.waitFor();
  return input;
}

async function proveChat(browserType, browserName, width, height, keyboardBottom) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    const editor = await openChat(page);
    await editor.fill("Short draft");
    await editor.focus();

    assert(await injectVisualViewport(page, { offsetTop: 0, width, height: keyboardBottom }), `${browserName}: cannot inject chat keyboard viewport`);
    await page.waitForTimeout(950);
    const bottom = await visualBottom(page);
    let panel = await rect(page, ".companion-panel.open");
    let header = await rect(page, ".companion-panel.open .companion-header");
    let body = await rect(page, ".companion-panel.open .chat-body");
    let composer = await rect(page, ".companion-panel.open .chat-input");
    let editorBox = await rect(page, ".companion-panel.open .chat-composer-editor");
    let send = await rect(page, ".companion-panel.open .chat-input button[type=submit]");
    let bubble = await rect(page, ".companion-panel.open .message-row .message-bubble");

    assert(Math.abs(panel.top) <= 1, `${browserName}: chat double-followed viewport ${panel.top}`);
    flushToBottom(panel, bottom, `${browserName}: chat panel`);
    flushToBottom(composer, bottom, `${browserName}: chat composer`);
    assert(header.height >= 44, `${browserName}: chat header collapsed`);
    assert(editorBox.height <= 70, `${browserName}: short draft inflated ${editorBox.height}`);
    assert(body.height >= bottom * .28, `${browserName}: conversation area erased ${body.height}`);
    assert(body.bottom <= composer.top + 1, `${browserName}: body overlaps composer`);
    assert(send.bottom <= bottom + 1, `${browserName}: send hidden`);
    assert(await navHidden(page), `${browserName}: nav visible behind chat`);
    const visibleBubble = Math.max(0, Math.min(bubble.bottom, body.bottom) - Math.max(bubble.top, body.top));
    assert(visibleBubble >= Math.min(44, bubble.height * .55), `${browserName}: conversation not meaningfully visible`);

    await page.screenshot({ path: `${out}/${browserName}-${width}x${height}-chat-keyboard.png`, fullPage: false });

    await editor.fill("This deliberately long companion draft wraps across several lines so the editor grows with content but never consumes the visible conversation while the software keyboard remains open. It must stay editable and keep the send control visible.");
    await page.waitForTimeout(180);
    const longBottom = await visualBottom(page);
    body = await rect(page, ".companion-panel.open .chat-body");
    composer = await rect(page, ".companion-panel.open .chat-input");
    editorBox = await rect(page, ".companion-panel.open .chat-composer-editor");
    send = await rect(page, ".companion-panel.open .chat-input button[type=submit]");
    flushToBottom(composer, longBottom, `${browserName}: long chat composer`);
    assert(editorBox.height <= Math.min(125, keyboardBottom * .30) + 1, `${browserName}: long editor unbounded ${editorBox.height}`);
    assert(body.height >= keyboardBottom * .24, `${browserName}: long draft erased history ${body.height}`);
    assert(body.bottom <= composer.top + 1 && send.bottom <= longBottom + 1, `${browserName}: long composer geometry failed`);
    await page.screenshot({ path: `${out}/${browserName}-${width}x${height}-chat-keyboard-long.png`, fullPage: false });

    const panOffset = 72;
    assert(await injectVisualViewport(page, { offsetTop: panOffset, width, height: Math.max(160, keyboardBottom - panOffset) }), `${browserName}: cannot inject chat panned viewport`);
    await page.waitForTimeout(950);
    const pannedBottom = await visualBottom(page);
    panel = await rect(page, ".companion-panel.open");
    composer = await rect(page, ".companion-panel.open .chat-input");
    const topVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--notverse-vv-top").trim());
    assert(Math.abs(panel.top) <= 1, `${browserName}: chat double-followed offset ${panel.top}`);
    assert(topVar === "0px", `${browserName}: exported non-zero chat top ${topVar}`);
    flushToBottom(panel, pannedBottom, `${browserName}: panned chat panel`);
    flushToBottom(composer, pannedBottom, `${browserName}: panned chat composer`);
    await page.screenshot({ path: `${out}/${browserName}-${width}x${height}-chat-keyboard-panned.png`, fullPage: false });

    report.cases.push({ kind: "chat", browserName, width, height, keyboardBottom });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveReplies(browserType, browserName, width, height, keyboardBottom) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    const input = await openReplies(page);
    await input.fill("Keyboard-safe reply");
    await input.focus();
    assert(await injectVisualViewport(page, { offsetTop: 0, width, height: keyboardBottom }), `${browserName}: cannot inject Replies keyboard viewport`);
    await page.waitForTimeout(950);
    let bottom = await visualBottom(page);
    const bodyPosition = await page.locator("body").evaluate((node) => getComputedStyle(node).position);
    let backdrop = await rect(page, ".replies-backdrop");
    let drawer = await rect(page, ".replies-drawer");
    let header = await rect(page, ".replies-drawer > header");
    let form = await rect(page, ".replies-drawer > form");
    let field = await rect(page, ".replies-drawer input");
    let send = await rect(page, ".replies-drawer > form button");
    const articles = await page.locator(".replies-drawer > article").evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    }));
    assert(await input.evaluate(node => document.activeElement === node), `${browserName}: reply focus lost`);
    assert(bodyPosition !== "fixed", `${browserName}: fixed Notes body owns Replies modal`);
    flushToBottom(backdrop, bottom, `${browserName}: Replies backdrop`, 6);
    flushToBottom(form, bottom, `${browserName}: Replies composer`, 6);
    assert(drawer.height >= Math.min(300, bottom - 10), `${browserName}: drawer collapsed ${drawer.height}`);
    assert(header.height >= 35, `${browserName}: replies header hidden`);
    assert(articles.length >= 2 && articles.every((x) => x.height >= 40), `${browserName}: reply content disappeared`);
    assert(field.height >= 40 && send.bottom <= bottom + 1, `${browserName}: reply composer hidden`);
    assert(await navHidden(page), `${browserName}: nav visible with reply keyboard`);
    await page.screenshot({ path: `${out}/${browserName}-${width}x${height}-replies-keyboard.png`, fullPage: false });

    const panOffset = 72;
    assert(await injectVisualViewport(page, { offsetTop: panOffset, width, height: Math.max(160, keyboardBottom - panOffset) }), `${browserName}: cannot inject Replies panned viewport`);
    await page.waitForTimeout(950);
    bottom = await visualBottom(page);
    backdrop = await rect(page, ".replies-backdrop");
    form = await rect(page, ".replies-drawer > form");
    const topVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--notverse-vv-top").trim());
    assert(Math.abs(backdrop.top) <= 1, `${browserName}: Replies double-followed offset ${backdrop.top}`);
    assert(topVar === "0px", `${browserName}: Replies exported non-zero top ${topVar}`);
    flushToBottom(backdrop, bottom, `${browserName}: panned Replies backdrop`, 6);
    flushToBottom(form, bottom, `${browserName}: panned Replies composer`, 6);
    await page.screenshot({ path: `${out}/${browserName}-${width}x${height}-replies-keyboard-panned.png`, fullPage: false });

    report.cases.push({ kind: "replies", browserName, width, height, keyboardBottom });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveInbox(browserType, browserName, width, height, keyboardBottom) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    const input = await openInbox(page);
    await input.fill("Test inbox typing stays visible");
    await input.focus();
    assert(await injectVisualViewport(page, { offsetTop: 0, width, height: keyboardBottom }), `${browserName}: cannot inject Inbox keyboard viewport`);
    await page.waitForTimeout(950);

    let bottom = await visualBottom(page);
    let inbox = await rect(page, ".inbox-view");
    let layout = await rect(page, ".inbox-layout");
    let header = await rect(page, ".inbox-layout > main > header");
    let thread = await rect(page, ".inbox-layout .message-thread");
    let form = await rect(page, ".inbox-layout main > form");
    let field = await rect(page, ".inbox-layout main > form input");
    let send = await rect(page, ".inbox-layout main > form button");
    const asideDisplay = await page.locator(".inbox-layout > aside").evaluate((node) => getComputedStyle(node).display);
    const value = await input.inputValue();

    assert(await page.locator("body.notverse-inbox-keyboard").count() === 1, `${browserName}: Inbox keyboard mode not entered`);
    flushToBottom(inbox, bottom, `${browserName}: Inbox surface`, 6);
    flushToBottom(form, bottom, `${browserName}: Inbox composer`, 6);
    assert(asideDisplay === "none", `${browserName}: Inbox thread picker still consumes keyboard viewport`);
    assert(header.height >= 44, `${browserName}: Inbox conversation header hidden`);
    assert(thread.height >= 100, `${browserName}: Inbox message history collapsed ${thread.height}`);
    assert(field.height >= 40 && field.bottom <= bottom + 1, `${browserName}: Inbox field hidden`);
    assert(send.bottom <= bottom + 1, `${browserName}: Inbox send hidden`);
    assert(value === "Test inbox typing stays visible", `${browserName}: Inbox draft lost during keyboard resize`);
    assert(await navHidden(page), `${browserName}: nav visible with Inbox keyboard`);
    await page.screenshot({ path: `${out}/${browserName}-${width}x${height}-inbox-keyboard.png`, fullPage: false });

    const panOffset = 72;
    assert(await injectVisualViewport(page, { offsetTop: panOffset, width, height: Math.max(160, keyboardBottom - panOffset) }), `${browserName}: cannot inject Inbox panned viewport`);
    await page.waitForTimeout(950);
    bottom = await visualBottom(page);
    inbox = await rect(page, ".inbox-view");
    form = await rect(page, ".inbox-layout main > form");
    flushToBottom(inbox, bottom, `${browserName}: panned Inbox surface`, 6);
    flushToBottom(form, bottom, `${browserName}: panned Inbox composer`, 6);
    await page.screenshot(s path: `${out}/${browserName}-${width}x${height}-inbox-keyboard-panned.png`, fullPage: false });

    report.cases.push({ kind: "inbox", browserName, width, height, keyboardBottom });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveDesktopCleanup(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await prepare(page);
    await openChat(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(950);
    const values = await page.locator(".companion-panel.open").evaluate((node) => ["position","top","left","width","height"].map((key) => node.style.getPropertyValue(key)));
    assert(values.every((value) => value === ""), `${browserName}: mobile inline geometry survived desktop ${JSON.stringify(values)}`);
    report.cases.push({ kind: "desktop", browserName });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const [width, height, keyboardBottom] of [[360,640,420], [390,844,524], [430,932,524]]) {
    try {
      await proveChat(browserType, browserName, width, height, keyboardBottom);
      await proveReplies(browserType, browserName, width, height, keyboardBottom);
      await proveInbox(browserType, browserName, width, height, keyboardBottom);
    } catch (error) {
      report.ok = false;
      report.errors.push(`${browserName}/${width}x${height}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    await proveDesktopCleanup(browserType, browserName);
  } catch (error) {
    report.ok = false;
    report.errors.push(`${browserName}/desktop: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await writeFile(`${out}/ios-overlay-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(
  `MOBILE keyboard edge regression proof passed (${report.cases.length} cases).`,
);
