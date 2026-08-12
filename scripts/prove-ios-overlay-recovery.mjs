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

async function visibleBounds(page) {
  return page.evaluate(() => {
    const viewport = window.visualViewport;
    const top = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
    const left = Math.max(0, Math.round(viewport?.offsetLeft ?? 0));
    const width = Math.max(1, Math.round(viewport?.width ?? window.innerWidth));
    const layoutHeight = Math.max(1, window.innerHeight - top);
    const height = Math.max(1, Math.min(layoutHeight, Math.round(viewport?.height ?? window.innerHeight)));
    return {
      top,
      left,
      width,
      height,
      bottom: top + height,
      innerHeight: window.innerHeight,
      visualHeight: viewport?.height ?? null,
    };
  });
}

async function injectVisualViewport(page, { offsetTop, offsetLeft = 0, width, height }) {
  return page.evaluate(({ offsetTop, offsetLeft, width, height }) => {
    const viewport = window.visualViewport;
    if (!viewport) return false;

    try {
      Object.defineProperties(viewport, {
        offsetTop: { configurable: true, value: offsetTop },
        offsetLeft: { configurable: true, value: offsetLeft },
        width: { configurable: true, value: width },
        height: { configurable: true, value: height },
      });
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("resize"));
      return true;
    } catch {
      return false;
    }
  }, { offsetTop, offsetLeft, width, height });
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

    /* Playwright viewport resizing is only a layout approximation. WebKit can
       legitimately retain a larger visualViewport for some emulated sizes, so
       compare against the browser's observed visible bounds rather than an
       invented keyboard coordinate. The deterministic offset test below then
       covers the Safari visualViewport panning path explicitly. */
    await page.setViewportSize({ width, height: keyboardHeight });
    await page.waitForTimeout(950);

    const visible = await visibleBounds(page);
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
    assert(panel.top >= visible.top - 1 && panel.bottom <= visible.bottom + 1, `${browserName}: chat panel exceeds observed visual viewport ${JSON.stringify({ panel, visible })}`);
    assert(composer.bottom <= visible.bottom + 1, `${browserName}: composer is behind observed keyboard viewport ${JSON.stringify({ composer, visible })}`);
    assert(chatBody.bottom <= composer.top + 1, `${browserName}: chat body overlaps composer`);
    assert(nav.display === "none" || nav.visibility === "hidden" || Number(nav.opacity) === 0, `${browserName}: mobile nav remains visible behind chat ${JSON.stringify(nav)}`);

    await page.screenshot({ path: `${out}/${browserName}-${width}x${keyboardHeight}-chat-keyboard.png`, fullPage: false });
    report.cases.push({ kind: "chat-keyboard", browserName, width, requestedHeight: keyboardHeight, visible, panel, composer, chatBody, nav });

    /* The supplied real iPhone captures exposed the non-zero offset path that
       resize-only emulation missed. Force that exact browser-state shape at
       every supported phone width and prove the production code follows it. */
    const offsetTop = 48;
    const injectedHeight = Math.max(220, keyboardHeight - offsetTop);
    const injected = await injectVisualViewport(page, {
      offsetTop,
      width,
      height: injectedHeight,
    });
    assert(injected, `${browserName}: could not inject non-zero chat visualViewport coverage`);
    await page.waitForTimeout(950);

    const offsetPanel = await rect(page, ".companion-panel.open");
    const offsetComposer = await rect(page, ".companion-panel.open .chat-input");
    const cssTop = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--notverse-vv-top").trim());

    assert(Math.abs(offsetPanel.top - offsetTop) <= 1, `${browserName}: chat panel did not follow visualViewport.offsetTop ${JSON.stringify(offsetPanel)}`);
    assert(offsetPanel.bottom <= offsetTop + injectedHeight + 1, `${browserName}: injected chat panel exceeds visible viewport ${JSON.stringify(offsetPanel)}`);
    assert(offsetComposer.bottom <= offsetTop + injectedHeight + 1, `${browserName}: injected chat composer falls outside visible viewport ${JSON.stringify(offsetComposer)}`);
    assert(cssTop === `${offsetTop}px`, `${browserName}: visual viewport top variable is stale (${cssTop})`);

    await page.screenshot({ path: `${out}/${browserName}-${width}x${keyboardHeight}-chat-offset-top.png`, fullPage: false });
    report.cases.push({ kind: "chat-offset-top", browserName, width, offsetTop, visibleHeight: injectedHeight, panel: offsetPanel, composer: offsetComposer, cssTop });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveBreakpointRecovery(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await prepare(page);
    await page.getByRole("button", { name: "Chat now", exact: true }).click();
    await page.locator(".companion-panel.open").waitFor();
    await page.waitForTimeout(200);

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(950);

    const inline = await page.locator(".companion-panel.open").evaluate((node) => ({
      top: node.style.getPropertyValue("top"),
      left: node.style.getPropertyValue("left"),
      width: node.style.getPropertyValue("width"),
      height: node.style.getPropertyValue("height"),
      position: node.style.getPropertyValue("position"),
    }));
    const nav = await page.locator(".mobile-nav.notverse-mobile-nav").evaluate((node) => ({
      inlineDisplay: node.style.getPropertyValue("display"),
      computedDisplay: getComputedStyle(node).display,
    }));

    assert(Object.values(inline).every((value) => value === ""), `${browserName}: mobile inline chat geometry survived desktop transition ${JSON.stringify(inline)}`);
    assert(nav.inlineDisplay === "", `${browserName}: mobile nav kept an inline display override after desktop transition`);

    report.cases.push({ kind: "breakpoint-recovery", browserName, inline, nav });
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

    assert(drawer.top >= -0.5, `${browserName}: replies drawer clips above the visible viewport ${JSON.stringify(drawer)}`);
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

    const keyboardVisible = await visibleBounds(page);
    const keyboardDrawer = await rect(page, ".replies-drawer");
    const keyboardForm = await rect(page, ".replies-drawer form");
    const keyboardNav = await page.locator(".mobile-nav.notverse-mobile-nav").evaluate((node) => {
      const style = getComputedStyle(node);
      return { display: style.display, visibility: style.visibility, opacity: style.opacity };
    });

    assert(keyboardDrawer.top >= keyboardVisible.top - 0.5, `${browserName}: keyboard replies drawer clips above the observed visual viewport`);
    assert(keyboardDrawer.bottom <= keyboardVisible.bottom + 1, `${browserName}: replies drawer exceeds observed keyboard viewport ${JSON.stringify({ keyboardDrawer, keyboardVisible })}`);
    assert(keyboardForm.bottom <= keyboardVisible.bottom + 1, `${browserName}: reply field hides behind observed keyboard viewport ${JSON.stringify({ keyboardForm, keyboardVisible })}`);
    assert(keyboardNav.display === "none" || keyboardNav.visibility === "hidden" || Number(keyboardNav.opacity) === 0, `${browserName}: navigation remains visible while reply keyboard is open`);

    await page.screenshot({ path: `${out}/${browserName}-${width}x${keyboardHeight}-replies-keyboard.png`, fullPage: false });

    const offsetTop = 48;
    const visibleHeight = Math.max(220, keyboardHeight - offsetTop);
    const offsetInjected = await injectVisualViewport(page, {
      offsetTop,
      width,
      height: visibleHeight,
    });
    assert(offsetInjected, `${browserName}: could not inject Replies visualViewport offset coverage`);
    await page.waitForTimeout(950);

    const offsetBackdrop = await rect(page, ".replies-backdrop");
    const offsetDrawer = await rect(page, ".replies-drawer");
    const offsetForm = await rect(page, ".replies-drawer form");

    assert(Math.abs(offsetBackdrop.top - offsetTop) <= 1, `${browserName}: Replies backdrop did not follow visualViewport.offsetTop ${JSON.stringify(offsetBackdrop)}`);
    assert(offsetDrawer.top >= offsetTop - 1, `${browserName}: offset Replies drawer clips above the visual viewport ${JSON.stringify(offsetDrawer)}`);
    assert(offsetDrawer.bottom <= offsetTop + visibleHeight + 1, `${browserName}: offset Replies drawer exceeds visual viewport ${JSON.stringify(offsetDrawer)}`);
    assert(offsetForm.bottom <= offsetTop + visibleHeight + 1, `${browserName}: offset reply composer falls behind keyboard ${JSON.stringify(offsetForm)}`);

    await page.screenshot({ path: `${out}/${browserName}-${width}x${keyboardHeight}-replies-offset-top.png`, fullPage: false });

    report.cases.push({ kind: "replies", browserName, width, height, drawer, form, nav });
    report.cases.push({ kind: "replies-keyboard", browserName, width, requestedHeight: keyboardHeight, visible: keyboardVisible, drawer: keyboardDrawer, form: keyboardForm, nav: keyboardNav });
    report.cases.push({ kind: "replies-offset-top", browserName, width, keyboardHeight, offsetTop, visibleHeight, offsetBackdrop, offsetDrawer, offsetForm });
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

  try {
    await proveBreakpointRecovery(browserType, browserName);
  } catch (error) {
    report.ok = false;
    report.errors.push(`${browserName}/breakpoint-recovery: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await writeFile(`${out}/ios-overlay-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`iOS overlay recovery proof passed (${report.cases.length} cases).`);
