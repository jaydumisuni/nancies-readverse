import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.NOTVERSE_TEST_URL || "http://127.0.0.1:4173";
const output = "engineering-evidence/notverse";
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

async function prepare(page) {
  await page.addInitScript((preferences) => {
    localStorage.setItem("notverse.preferences", JSON.stringify(preferences));
  }, setupState);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".notverse-home").waitFor();
  return errors;
}

async function openTextFile(page, name) {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload a file", exact: true }).first().click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(
      "NoTVerse proof page one.\n\nThis file proves that a local reading file stays temporary until the reader deliberately saves it.\n\nA second passage exists so Notes and progress have real content to attach to.",
      "utf8",
    ),
  });

  // Uploads are intentionally not opened automatically. The companion first
  // confirms the temporary file and presents the explicit Read now handoff.
  await page.locator(".companion-panel.open").waitFor({ state: "visible", timeout: 10000 });
  const uploadCard = page.locator(".upload-card").filter({ hasText: name }).last();
  await uploadCard.waitFor({ state: "visible", timeout: 10000 });
  await uploadCard.getByRole("button", { name: "Read now" }).click();

  const reader = page.locator(".universal-overlay");
  await reader.waitFor({ state: "visible", timeout: 15000 });
  await reader.locator(".reader-loading").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  return reader;
}

const browser = await chromium.launch({ headless: true });
const report = { ok: false, checks: [], screenshots: [], errors: [] };

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const desktop = await desktopContext.newPage();
  report.errors.push(...(await prepare(desktop)).map((value) => `desktop: ${value}`));
  const desktopReader = await openTextFile(desktop, "NoTVerse Proof.txt");

  assert(await desktopReader.locator(".universal-toolbar strong").filter({ hasText: "NoTVerse Proof.txt" }).isVisible(), "reader title is missing");
  assert(await desktopReader.getByRole("button", { name: "+ Add to Library" }).isVisible(), "Add to Library is missing");
  assert(await desktopReader.getByRole("button", { name: "Save offline" }).isVisible(), "Save offline is missing");
  assert(await desktopReader.getByRole("button", { name: "Save to Drive" }).isVisible(), "Save to Drive is missing");
  assert(await desktopReader.getByText("This file proves that a local reading file stays temporary", { exact: false }).isVisible(), "TXT content did not render");
  await desktop.screenshot({ path: `${output}/reader-txt-desktop.png`, fullPage: true });
  report.screenshots.push("reader-txt-desktop.png");

  await desktopReader.getByRole("button", { name: "+ Add to Library" }).click();
  await desktopReader.getByRole("button", { name: "✓ In Library" }).waitFor();
  report.checks.push("temporary upload required explicit Read now confirmation");
  report.checks.push("temporary file opened and added deliberately");

  await desktopReader.getByRole("button", { name: "Notes", exact: true }).click();
  await desktopReader.locator(".universal-notes textarea").fill("Verified reader Note attached to this temporary title.");
  await desktop.screenshot({ path: `${output}/reader-note-desktop.png`, fullPage: true });
  report.screenshots.push("reader-note-desktop.png");
  report.checks.push("reader Note persisted in the active title");

  await desktopReader.getByRole("button", { name: "Close reader" }).click();
  await desktopReader.waitFor({ state: "detached" });
  await desktop.getByRole("button", { name: "Library", exact: true }).first().click();
  const library = desktop.locator(".library-view");
  await library.waitFor();
  assert(await library.getByText("NoTVerse Proof", { exact: true }).isVisible(), "normalized added title is missing from Library");
  await desktop.screenshot({ path: `${output}/reader-library-desktop.png`, fullPage: true });
  report.screenshots.push("reader-library-desktop.png");
  report.checks.push("added title appears in Library");
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobile = await mobileContext.newPage();
  report.errors.push(...(await prepare(mobile)).map((value) => `mobile: ${value}`));
  await openTextFile(mobile, "Mobile Proof.txt");
  const metrics = await mobile.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  assert(metrics.scroll <= metrics.inner + 2, `mobile reader overflow: ${metrics.scroll} > ${metrics.inner}`);
  await mobile.screenshot({ path: `${output}/reader-txt-mobile.png`, fullPage: true });
  report.screenshots.push("reader-txt-mobile.png");
  report.checks.push("mobile reader fits the viewport");
  await mobileContext.close();

  assert(report.errors.length === 0, `browser errors: ${report.errors.join(" | ")}`);
  report.ok = true;
  await writeFile(`${output}/reader-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  await writeFile(`${output}/reader-report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
