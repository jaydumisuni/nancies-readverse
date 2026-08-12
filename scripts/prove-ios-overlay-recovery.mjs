import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/ios-overlay-recovery";
await mkdir(out, { recursive: true });

const report = { ok: true, cases: [], errors: [] };

function assert(value, message) {
  if (!value) throw new Error(message);
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
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function rect(page, selector) {
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

async function proveChat(browserType, browserName, width, height, keyboardHeight) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await prepare(page);
    await page.getByRole("button", { name: "Chat now", exact: true }).click();
    const editor = page.locator(".companion-panel.open textarea.chat-composer-editor");
    await editor.waitFor();
    await editor.fill("This is a real mobile draft that must remain visible while the software keyboard changes the Safari visual viewport.");
    await editor.focus();

    await page.setViewportSize({ width, height: keyboardHeight });
    await page.waitForTimeout(950);

    const panel = await rect(page, ".companion-panel.open");
    const composer = await rect(page, ".companion-panel.open .chat-input");
    const chatBody = await rect(page, ".companion-panel.open .chat-body");
    const nav = await page.locator(".mobile-nav.notverse-mobile-nav").evaluate((node) => {
      const style = getComputedStyle(node);
      return { display: style.display, opacity: style.opacity, visibility: style.visibility };
    });
    const focused = await editor.evaluate((node) => document.activeElement === node);
    const scale = await page.evaluate(() => visualViewport?.scale || 1);

    assert(focused, `${browserName}: chat editor lost focus`);
    assert(Math.abs(scale - 1) < .01, `${browserName}: focus zoomed page to ${scale}`);
    assert(panel.top >= -1 && panel.bottom <= keyboardHeight + 1, `${browserName}: chat panel exceeds keyboard viewport ${JSON.stringify(panel)}`);
    assert(composer.bottom <= keyboardHeight + 1, `${browserName}: composer is behind keyboard ${JSON.stringify(composer)}`);
    assert(chatBody.bottom <= composer.top + 1, `${browserName}: chat body overlaps composer`);
    assert(nav.display === "none" || nav.visibility === "hidden" || Number(nav.opacity) === 0, `${browserName}: mobile nav remains visible behind chat ${JSON.stringify(nav)}`);

    await page.screenshot({ path: `${out}/${browserName}-${width}x${keyboardHeight}-chat-keyboard.png`, fullPage: false });

    report.cases.push({ kind: "chat-keyboard", browserName, width, height: keyboardHeight, panel, composer, chatBody, nav });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveReplies(browserType, browserName, width, height) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await prepare(page);
    await page.getByRole("button", { name: "Notes", exact: true }).last().click();
    await page.locator(".note-paper > footer button").nth(1).click();
    await page.locator(".replies-drawer").waitFor();
    await page.waitForTimeout(300);

    const drawer = await rect(page, ".replies-drawer");
    const form = await rect(page, ".replies-drawer form");
    const nav = await rect(page, ".mobile-nav.notverse-mobile-nav");
    const backdrop = await rect(page, ".replies-backdrop");

    assert(drawer.bottom <= nav.top + 1, `${browserName}: replies drawer extends under navigation ${JSON.stringify({ drawer, nav })}`);
    assert(form.bottom <= nav.top + 1, `${browserName}: reply composer hides behind navigation ${JSON.stringify({ form, nav })}`);
    assert(backdrop.bottom <= nav.top + 2, `${browserName}: replies backdrop consumes navigation strip ${JSON.stringify({ backdrop, nav })}`);

    await page.screenshot({ path: `${out}/${browserName}-${width}x${height}-replies.png`, fullPage: false });

    const input = page.locator(".replies-drawer input");
    await input.fill("Keyboard-safe reply");
    await input.focus();
    const keyboardHeight = Math.min(height, 524);
    await page.setViewportSize({ width, height: keyboardHeight });
    await page.waitForTimeout(950);

    const keyboardDrawer = await rect(page, ".replies-drawer");
    const keyboardForm = await rect(page, ".replies-drawer form");
    const keyboardNav = await page.locator(".mobile-nav.notverse-mobile-nav").evaluate((node) => {
      const style = getComputedStyle(node);
      return { display: style.display, visibility: style.visibility, opacity: style.opacity };
    });

    assert(keyboardDrawer.bottom <= keyboardHeight + 1, `${browserName}: replies drawer exceeds keyboard viewport`);
    assert(keyboardForm.bottom <= keyboardHeight + 1, `${browserName}: reply field hides behind keyboard`);
    assert(keyboardNav.display === "none" || keyboardNav.visibility === "hidden" || Number(keyboardNav.opacity) === 0, `${browserName}: navigation remains visible while reply keyboard is open`);

    await page.screenshot({ path: `${out}/${browserName}-${width}x${keyboardHeight}-replies-keyboard.png`, fullPage: false });

    report.cases.push({ kind: "replies", browserName, width, height, drawer, form, nav });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const [width, height, keyboardHeight] of [
    [360, 640, 420],
    [390, 844, 524],
    [430, 932, 524],
  ]) {
    try {
      await proveChat(browserType, browserName, width, height, keyboardHeight);
      await proveReplies(browserType, browserName, width, height);
    } catch (error) {
      report.ok = false;
      report.errors.push(`${browserName}/${width}x${height}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

await writeFile(`${out}/ios-overlay-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`iOS overlay recovery proof passed (${report.cases.length} cases).`);
