import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.NOTVERSE_TEST_URL || "http://127.0.0.1:4173";
const output = "engineering-evidence/notverse-polish";
await mkdir(output, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function swipeUp(page, selector = ".notverse-setup") {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Cannot swipe missing selector: ${selector}`);
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height * 0.78);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height * 0.22, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(570);
}

async function advanceSetup(page, targetPage) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = Number(await page.locator(".notverse-setup").getAttribute("data-page") || 0);
    if (current === targetPage) return;
    await swipeUp(page);
    try {
      await page.waitForFunction((target) => Number(document.querySelector(".notverse-setup")?.getAttribute("data-page") || 0) === target, targetPage, { timeout: 2500 });
      return;
    } catch {
      // Retry the physical gesture if the browser dropped one pointer sequence.
    }
  }
  throw new Error(`setup did not advance to page ${targetPage}`);
}

async function noHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert(metrics.scroll <= metrics.inner + 2, `${label} overflowed horizontally: ${metrics.scroll} > ${metrics.inner}`);
}

const browser = await chromium.launch({ headless: true });
const report = { ok: false, screenshots: [], checks: [], errors: [] };

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const desktopPage = await desktop.newPage();
  desktopPage.on("console", (message) => { if (message.type() === "error") report.errors.push(`desktop console: ${message.text()}`); });
  desktopPage.on("pageerror", (error) => report.errors.push(`desktop page: ${error.message}`));
  await desktopPage.goto(baseURL, { waitUntil: "networkidle" });
  await desktopPage.locator(".notverse-setup").waitFor();
  await noHorizontalOverflow(desktopPage, "desktop setup");
  const desktopSetup = await desktopPage.locator(".setup-paper-stack").boundingBox();
  assert(desktopSetup && desktopSetup.y >= 0 && desktopSetup.y + desktopSetup.height <= 1000, "desktop setup paper is clipped outside the viewport");
  await desktopPage.screenshot({ path: `${output}/setup-cover-desktop-viewport.png` });
  report.screenshots.push("setup-cover-desktop-viewport.png");
  report.checks.push("desktop setup contained in viewport");
  await desktop.close();

  const mobileSetup = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const setupPage = await mobileSetup.newPage();
  setupPage.on("console", (message) => { if (message.type() === "error") report.errors.push(`mobile setup console: ${message.text()}`); });
  setupPage.on("pageerror", (error) => report.errors.push(`mobile setup page: ${error.message}`));
  await setupPage.goto(baseURL, { waitUntil: "networkidle" });
  await setupPage.locator(".notverse-setup").waitFor();
  await noHorizontalOverflow(setupPage, "mobile setup");
  const setupBox = await setupPage.locator(".setup-paper-stack").boundingBox();
  assert(setupBox && setupBox.x >= 0 && setupBox.x + setupBox.width <= 390 && setupBox.y >= 0 && setupBox.y + setupBox.height <= 844, "mobile setup paper is clipped outside the viewport");
  await setupPage.screenshot({ path: `${output}/setup-cover-mobile.png` });
  report.screenshots.push("setup-cover-mobile.png");

  await advanceSetup(setupPage, 2);
  await setupPage.locator(".setup-sheet-2").waitFor();
  await setupPage.screenshot({ path: `${output}/setup-profile-mobile.png` });
  report.screenshots.push("setup-profile-mobile.png");

  for (let target = 3; target <= 7; target += 1) await advanceSetup(setupPage, target);
  await setupPage.locator(".setup-sheet-7").waitFor();
  const mobileRoster = await setupPage.locator(".setup-companion-grid strong").allTextContents();
  assert(mobileRoster.length === 12, `mobile setup expected 12 companions, found ${mobileRoster.length}`);
  await setupPage.screenshot({ path: `${output}/setup-companions-mobile.png` });
  report.screenshots.push("setup-companions-mobile.png");
  report.checks.push("mobile swipe setup and approved companion roster");
  await mobileSetup.close();

  const desktopApp = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const appPage = await desktopApp.newPage();
  await appPage.addInitScript(() => {
    localStorage.setItem("notverse.preferences", JSON.stringify({ setupComplete: true, interests: ["Manga","Novels","PDFs"], discovery: ["Title, author, series or ISBN","Describe something from memory","Scan a cover","Scan a page","Paste a source link","Voice description"], accentIntensity: 74, readerFont: "serif", noteFont: "handwritten", reducedMotion: false, paperTexture: 72, readingVisibility: "approximate", spoilerPreference: "progress", community: { seePublicNotes: true, seeLibraryNotes: true, allowFollowers: true, messageRequests: true, appearInNotebooks: true, privateByDefault: true } }));
  });
  await appPage.goto(baseURL, { waitUntil: "networkidle" });
  await appPage.getByRole("button", { name: "Notes", exact: true }).first().click();
  await appPage.locator(".notes-experience").waitFor();
  const desktopPaper = await appPage.locator(".note-flip-stage").boundingBox();
  assert(desktopPaper && desktopPaper.width >= 560, `desktop Note paper is too small: ${desktopPaper?.width ?? 0}px`);
  assert(!(await appPage.locator(".floating-companion").isVisible()), "floating companion covers the desktop Notes workspace");
  await appPage.screenshot({ path: `${output}/notes-desktop-focused.png` });
  report.screenshots.push("notes-desktop-focused.png");
  report.checks.push("desktop Notes is focused and paper-sized");
  await desktopApp.close();

  const mobileApp = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobileApp.newPage();
  mobilePage.on("console", (message) => { if (message.type() === "error") report.errors.push(`mobile console: ${message.text()}`); });
  mobilePage.on("pageerror", (error) => report.errors.push(`mobile page: ${error.message}`));
  await mobilePage.addInitScript(() => {
    localStorage.setItem("notverse.preferences", JSON.stringify({ setupComplete: true, interests: ["Manga","Novels","PDFs"], discovery: ["Title, author, series or ISBN","Describe something from memory","Scan a cover","Scan a page","Paste a source link","Voice description"], accentIntensity: 74, readerFont: "serif", noteFont: "handwritten", reducedMotion: false, paperTexture: 72, readingVisibility: "approximate", spoilerPreference: "progress", community: { seePublicNotes: true, seeLibraryNotes: true, allowFollowers: true, messageRequests: true, appearInNotebooks: true, privateByDefault: true } }));
  });
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await mobilePage.locator(".notverse-mobile-nav button").filter({ hasText: "Notes" }).click();
  await mobilePage.locator(".notes-experience").waitFor();
  await noHorizontalOverflow(mobilePage, "mobile Notes polish");
  assert(!(await mobilePage.locator(".floating-companion").isVisible()), "floating companion covers the mobile Notes paper");
  await mobilePage.screenshot({ path: `${output}/notes-mobile-focused.png` });
  report.screenshots.push("notes-mobile-focused.png");

  await mobilePage.getByRole("button", { name: "New Note" }).click();
  await mobilePage.locator(".note-composer").waitFor();
  assert(!(await mobilePage.locator(".notverse-mobile-nav").isVisible()), "mobile navigation covers the Note composer");
  const composer = await mobilePage.locator(".note-composer").boundingBox();
  assert(composer && composer.x >= 0 && composer.x + composer.width <= 390, "mobile Note composer is clipped horizontally");
  await mobilePage.screenshot({ path: `${output}/note-composer-mobile-focused.png` });
  report.screenshots.push("note-composer-mobile-focused.png");
  report.checks.push("mobile Notes and composer stay unobstructed");
  await mobileApp.close();

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
