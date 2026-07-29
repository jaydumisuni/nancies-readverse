import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.NOTVERSE_TEST_URL || "http://127.0.0.1:4173";
const output = "engineering-evidence/notverse";
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

async function swipeDown(page, selector = ".notverse-setup") {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Cannot swipe missing selector: ${selector}`);
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height * 0.22);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height * 0.78, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(570);
}

async function verifyNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  assert(metrics.scroll <= metrics.inner + 2, `${label} has horizontal overflow: ${metrics.scroll} > ${metrics.inner}`);
}

const browser = await chromium.launch({ headless: true });
const report = { ok: false, screenshots: [], checks: [], errors: [] };

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  page.on("console", (message) => { if (message.type() === "error") report.errors.push(`desktop console: ${message.text()}`); });
  page.on("pageerror", (error) => report.errors.push(`desktop page: ${error.message}`));
  await page.goto(baseURL, { waitUntil: "networkidle" });

  await page.locator(".notverse-setup").waitFor({ state: "visible" });
  assert(await page.locator(".setup-cover-page h2").filter({ hasText: "Created for Nancy. Shared with the world." }).isVisible(), "complete origin line is not visible on setup cover");
  await page.screenshot({ path: `${output}/setup-cover-desktop.png`, fullPage: true });
  report.screenshots.push("setup-cover-desktop.png");

  await swipeUp(page);
  await page.locator(".setup-sheet-2").waitFor();
  await page.locator('.setup-sheet-2 input:not([type="file"])').first().fill("Nancy");
  await page.screenshot({ path: `${output}/setup-profile-desktop.png`, fullPage: true });
  report.screenshots.push("setup-profile-desktop.png");

  await swipeUp(page);
  await page.locator(".setup-sheet-3").waitFor();
  await page.screenshot({ path: `${output}/setup-interests-desktop.png`, fullPage: true });
  report.screenshots.push("setup-interests-desktop.png");

  await swipeDown(page);
  await page.locator(".setup-sheet-2").waitFor();
  report.checks.push("setup swipe back");
  await swipeUp(page);
  for (let step = 0; step < 4; step += 1) await swipeUp(page);
  await page.locator(".setup-sheet-7").waitFor();
  const rosterNames = await page.locator(".setup-companion-grid strong").allTextContents();
  assert(rosterNames.length === 12, `expected 12 companions, found ${rosterNames.length}`);
  for (const placeholder of ["Luna", "Kai", "Ari", "Milo", "Zara", "Neo"]) assert(!rosterNames.includes(placeholder), `placeholder companion leaked into setup: ${placeholder}`);
  await page.screenshot({ path: `${output}/setup-companions-desktop.png`, fullPage: true });
  report.screenshots.push("setup-companions-desktop.png");
  report.checks.push("approved twelve companions");

  await swipeUp(page);
  await swipeUp(page);
  await swipeUp(page);
  await page.locator(".setup-sheet-10").waitFor();
  await page.screenshot({ path: `${output}/setup-complete-desktop.png`, fullPage: true });
  report.screenshots.push("setup-complete-desktop.png");
  await swipeUp(page);
  await page.locator(".notverse-setup").waitFor({ state: "detached", timeout: 10000 });

  await page.locator(".notverse-home").waitFor();
  await verifyNoOverflow(page, "desktop home");
  await page.screenshot({ path: `${output}/home-desktop.png`, fullPage: true });
  report.screenshots.push("home-desktop.png");
  assert(await page.getByText("Reading Now").isVisible(), "Reading Now is missing from Home");
  assert(await page.getByText("Your Notebooks").isVisible(), "Notebooks are missing from Home");
  report.checks.push("desktop Home");

  await page.locator(".side-nav button").filter({ hasText: "Search" }).click();
  await page.locator(".search-view").waitFor();
  for (const action of ["Scan Cover", "Scan Page", "Paste Link", "Describe It", "Voice Description", "Upload a file"]) assert(await page.getByText(action, { exact: true }).isVisible(), `${action} is missing from Search`);
  await page.screenshot({ path: `${output}/search-desktop.png`, fullPage: true });
  report.screenshots.push("search-desktop.png");
  report.checks.push("search discovery tools");

  await page.locator(".side-nav button").filter({ hasText: "Notes" }).click();
  await page.locator(".notes-experience").waitFor();
  await page.screenshot({ path: `${output}/notes-desktop.png`, fullPage: true });
  report.screenshots.push("notes-desktop.png");
  const before = await page.locator(".note-position strong").textContent();
  await swipeUp(page, ".notes-experience");
  const after = await page.locator(".note-position strong").textContent();
  assert(before !== after, "swiping up did not flip to the next Note");
  await page.screenshot({ path: `${output}/notes-flipped-desktop.png`, fullPage: true });
  report.screenshots.push("notes-flipped-desktop.png");
  report.checks.push("Notes physical flip");

  await page.getByRole("button", { name: "New Note" }).click();
  await page.locator(".note-composer").waitFor();
  await page.locator(".composer-paper textarea").fill("A useful Note should feel like it belongs in the margin, not in a generic social feed.");
  await page.screenshot({ path: `${output}/note-composer-desktop.png`, fullPage: true });
  report.screenshots.push("note-composer-desktop.png");
  await page.locator(".note-composer>header button").last().click();
  await page.locator(".note-composer").waitFor({ state: "detached" });
  assert((await page.locator(".note-paper").textContent())?.includes("A useful Note"), "published Note did not appear");
  report.checks.push("Note composer persistence");

  await page.locator(".side-nav button").filter({ hasText: "Inbox" }).click();
  await page.locator(".inbox-view").waitFor();
  await page.screenshot({ path: `${output}/inbox-desktop.png`, fullPage: true });
  report.screenshots.push("inbox-desktop.png");
  report.checks.push("Inbox layout");

  await page.getByRole("button", { name: "Me", exact: true }).click();
  await page.locator(".profile-notebook").waitFor();
  await page.screenshot({ path: `${output}/profile-desktop.png`, fullPage: true });
  report.screenshots.push("profile-desktop.png");
  report.checks.push("My Notebook profile");
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  mobilePage.on("console", (message) => { if (message.type() === "error") report.errors.push(`mobile console: ${message.text()}`); });
  mobilePage.on("pageerror", (error) => report.errors.push(`mobile page: ${error.message}`));
  await mobilePage.addInitScript(() => {
    localStorage.setItem("notverse.preferences", JSON.stringify({ setupComplete: true, interests: ["Manga","Novels","PDFs"], discovery: ["Title, author, series or ISBN","Describe something from memory","Scan a cover","Scan a page","Paste a source link","Voice description"], accentIntensity: 74, readerFont: "serif", noteFont: "handwritten", reducedMotion: false, paperTexture: 72, readingVisibility: "approximate", spoilerPreference: "progress", community: { seePublicNotes: true, seeLibraryNotes: true, allowFollowers: true, messageRequests: true, appearInNotebooks: true, privateByDefault: true } }));
  });
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await mobilePage.locator(".notverse-home").waitFor();
  await verifyNoOverflow(mobilePage, "mobile home");
  const mobileLabels = await mobilePage.locator(".notverse-mobile-nav span").allTextContents();
  assert(JSON.stringify(mobileLabels) === JSON.stringify(["Home","Search","Notes","Library","Inbox","Me"]), `mobile navigation is incorrect: ${mobileLabels.join(", ")}`);
  await mobilePage.screenshot({ path: `${output}/home-mobile.png`, fullPage: true });
  report.screenshots.push("home-mobile.png");

  await mobilePage.locator(".notverse-mobile-nav button").filter({ hasText: "Notes" }).click();
  await mobilePage.locator(".notes-experience").waitFor();
  await verifyNoOverflow(mobilePage, "mobile Notes");
  await mobilePage.screenshot({ path: `${output}/notes-mobile.png`, fullPage: true });
  report.screenshots.push("notes-mobile.png");

  await mobilePage.getByRole("button", { name: "New Note" }).click();
  await mobilePage.locator(".note-composer").waitFor();
  await mobilePage.screenshot({ path: `${output}/note-composer-mobile.png`, fullPage: true });
  report.screenshots.push("note-composer-mobile.png");
  report.checks.push("mobile Home, navigation and Notes");
  await mobile.close();

  assert(report.errors.length === 0, `browser errors: ${report.errors.join(" | ")}`);
  report.ok = true;
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.stack : String(error);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
