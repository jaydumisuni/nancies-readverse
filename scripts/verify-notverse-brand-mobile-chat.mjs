import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.NOTVERSE_TEST_URL || "http://127.0.0.1:4173";
const output = "engineering-evidence/notverse-brand-mobile";
await mkdir(output, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const setupState = {
  setupComplete: true,
  interests: ["Manga", "Novels", "PDFs"],
  discovery: [
    "Title, author, series or ISBN",
    "Describe something from memory",
    "Scan a cover",
    "Scan a page",
    "Paste a source link",
    "Voice description",
  ],
  accentIntensity: 74,
  readerFont: "serif",
  noteFont: "handwritten",
  reducedMotion: false,
  paperTexture: 72,
  readingVisibility: "approximate",
  spoilerPreference: "progress",
  community: {
    seePublicNotes: true,
    seeLibraryNotes: true,
    allowFollowers: true,
    messageRequests: true,
    appearInNotebooks: true,
    privateByDefault: true,
  },
};

const browser = await chromium.launch({ headless: true });
const report = { ok: false, checks: [], screenshots: [], errors: [], mobile: null };

try {
  const setupContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const setup = await setupContext.newPage();
  setup.on("console", (message) => { if (message.type() === "error") report.errors.push(`setup: ${message.text()}`); });
  setup.on("pageerror", (error) => report.errors.push(`setup: ${error.message}`));
  await setup.goto(baseURL, { waitUntil: "networkidle" });
  await setup.locator(".notverse-setup").waitFor();

  const favicon = await setup.locator('link[rel="icon"]').getAttribute("href");
  assert(favicon?.startsWith("data:image/jpeg;base64,"), "browser favicon does not use the supplied NoTVerse artwork");
  const faviconLoaded = await setup.evaluate((source) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => resolve(false);
    image.src = source;
  }), favicon);
  assert(faviconLoaded, "browser favicon artwork could not be decoded");

  const setupVisual = await setup.evaluate(() => {
    const mark = document.querySelector(".setup-brand .notverse-mark");
    const cover = document.querySelector(".cover-notebook");
    const origin = document.querySelector(".setup-cover-page h2");
    if (!mark || !cover || !origin) return null;
    return {
      markImage: getComputedStyle(mark).backgroundImage,
      coverImage: getComputedStyle(cover).backgroundImage,
      originText: origin.textContent?.trim(),
      originFont: getComputedStyle(origin).fontFamily,
      originStyle: getComputedStyle(origin).fontStyle,
    };
  });
  assert(setupVisual, "setup visual identity elements are missing");
  assert(setupVisual.markImage.includes("data:image/jpeg;base64"), "setup header icon is not rendered from the supplied artwork");
  assert(setupVisual.coverImage.includes("data:image/jpeg;base64"), "welcome icon is not rendered from the supplied artwork");
  assert(setupVisual.originText === "Created for Nancy. Shared with the world.", "origin line changed");
  assert(setupVisual.originFont.includes("Georgia"), "origin line does not use the polished book font");
  assert(setupVisual.originStyle === "normal", "origin line still uses the old italic treatment");
  await setup.screenshot({ path: `${output}/setup-brand-desktop.png`, fullPage: true });
  report.screenshots.push("setup-brand-desktop.png");
  report.checks.push("browser favicon and setup icons decode the supplied NoTVerse artwork");
  report.checks.push("setup origin line is exact and uses the polished typography");
  await setupContext.close();

  const homeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const home = await homeContext.newPage();
  await home.addInitScript((preferences) => {
    localStorage.setItem("notverse.preferences", JSON.stringify(preferences));
  }, setupState);
  home.on("console", (message) => { if (message.type() === "error") report.errors.push(`home: ${message.text()}`); });
  home.on("pageerror", (error) => report.errors.push(`home: ${error.message}`));
  await home.goto(baseURL, { waitUntil: "networkidle" });
  await home.locator(".notverse-home").waitFor();
  const homeVisual = await home.evaluate(() => {
    const brand = document.querySelector(".brand");
    const origin = document.querySelector(".brand small");
    const hero = document.querySelector(".notverse-hero");
    if (!brand || !origin || !hero) return null;
    return {
      brandImage: getComputedStyle(brand, "::before").backgroundImage,
      heroImage: getComputedStyle(hero, "::after").backgroundImage,
      originText: origin.textContent?.replace(/\s+/g, " ").trim(),
      originFont: getComputedStyle(origin).fontFamily,
    };
  });
  assert(homeVisual, "post-setup NoTVerse brand elements are missing");
  assert(homeVisual.brandImage.includes("data:image/jpeg;base64"), "sidebar logo is not rendered from the supplied artwork");
  assert(homeVisual.heroImage.includes("data:image/jpeg;base64"), "post-setup welcome icon is not rendered from the supplied artwork");
  assert(homeVisual.originText?.includes("Created for Nancy") && homeVisual.originText?.includes("Shared with the world"), "post-setup origin line is missing");
  assert(homeVisual.originFont.includes("Georgia"), "post-setup origin line still uses the plain UI font");
  await home.screenshot({ path: `${output}/home-brand-desktop.png`, fullPage: true });
  report.screenshots.push("home-brand-desktop.png");
  report.checks.push("post-setup sidebar and welcome area use the supplied NoTVerse artwork");
  report.checks.push("post-setup origin line uses the polished book typography");
  await homeContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
  const mobile = await mobileContext.newPage();
  await mobile.addInitScript((preferences) => {
    localStorage.setItem("notverse.preferences", JSON.stringify(preferences));
  }, setupState);
  mobile.on("console", (message) => { if (message.type() === "error") report.errors.push(`mobile: ${message.text()}`); });
  mobile.on("pageerror", (error) => report.errors.push(`mobile: ${error.message}`));
  await mobile.goto(baseURL, { waitUntil: "networkidle" });
  await mobile.locator(".notverse-home").waitFor();
  await mobile.getByRole("button", { name: "Chat now", exact: true }).click();
  const panel = mobile.locator(".companion-panel.open");
  await panel.waitFor();
  await mobile.waitForFunction(() => {
    const element = document.querySelector(".companion-panel.open");
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.opacity === "1" && (style.transform === "none" || style.transform === "matrix(1, 0, 0, 1, 0, 0)");
  });
  const input = panel.locator(".chat-input input");
  await input.waitFor();
  await input.fill("The mobile chat box remains usable.");

  const mobileVisual = await mobile.evaluate(() => {
    const panelElement = document.querySelector(".companion-panel.open");
    const nav = document.querySelector(".mobile-nav");
    const inputElement = document.querySelector(".companion-panel.open .chat-input input");
    if (!panelElement || !nav || !inputElement) return null;
    const panelStyle = getComputedStyle(panelElement);
    const navStyle = getComputedStyle(nav);
    const box = inputElement.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visualViewport: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height } : null,
      input: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
      panelZ: Number(panelStyle.zIndex || 0),
      panelOpacity: Number(panelStyle.opacity || 0),
      panelTransform: panelStyle.transform,
      navZ: Number(navStyle.zIndex || 0),
      navOpacity: Number(navStyle.opacity || 1),
      navPointerEvents: navStyle.pointerEvents,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  report.mobile = mobileVisual;
  await mobile.screenshot({ path: `${output}/chat-input-mobile.png`, fullPage: false });
  report.screenshots.push("chat-input-mobile.png");
  assert(mobileVisual, "mobile chat layout elements are missing");
  assert(mobileVisual.panelOpacity === 1 && (mobileVisual.panelTransform === "none" || mobileVisual.panelTransform === "matrix(1, 0, 0, 1, 0, 0)"), "mobile chat transition did not finish");
  assert(mobileVisual.panelZ > mobileVisual.navZ, "mobile navigation still layers above the chat panel");
  assert(mobileVisual.navOpacity === 0, "mobile navigation remains visible behind the open chat");
  assert(mobileVisual.navPointerEvents === "none", "hidden mobile navigation can still intercept chat taps");
  assert(mobileVisual.input.left >= 0 && mobileVisual.input.right <= mobileVisual.viewport.width, "chat input exceeds the mobile viewport horizontally");
  assert(mobileVisual.input.top >= 0 && mobileVisual.input.bottom <= mobileVisual.viewport.height, "chat input is hidden below the mobile viewport");
  assert(mobileVisual.input.width > 120 && mobileVisual.input.height >= 36, "chat input is too small to use");
  assert(mobileVisual.scrollWidth <= mobileVisual.viewport.width + 2, "mobile chat causes horizontal overflow");
  report.checks.push("open mobile chat owns the top layer and hides the bottom navigation");
  report.checks.push("mobile chat input remains fully visible, tappable and editable");
  await mobileContext.close();

  assert(report.errors.length === 0, `browser errors: ${report.errors.join(" | ")}`);
  report.ok = true;
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
