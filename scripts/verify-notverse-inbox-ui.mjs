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
  discovery: ["Title, author, series or ISBN", "Describe something from memory", "Scan a cover", "Scan a page", "Paste a source link", "Voice description"],
  accentIntensity: 74,
  readerFont: "serif",
  noteFont: "handwritten",
  reducedMotion: false,
  paperTexture: 72,
  readingVisibility: "approximate",
  spoilerPreference: "progress",
  community: { seePublicNotes: true, seeLibraryNotes: true, allowFollowers: true, messageRequests: true, appearInNotebooks: true, privateByDefault: true },
};

const browser = await chromium.launch({ headless: true });
const report = { ok: false, checks: [], screenshots: [], errors: [] };

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript((preferences) => {
    localStorage.setItem("notverse.preferences", JSON.stringify(preferences));
  }, setupState);
  page.on("console", (message) => { if (message.type() === "error") report.errors.push(message.text()); });
  page.on("pageerror", (error) => report.errors.push(error.message));

  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".notverse-home").waitFor();
  await page.locator(".side-nav button").filter({ hasText: "Inbox" }).click();
  const inbox = page.locator(".inbox-view");
  await inbox.waitFor();

  const message = `Verified private message ${Date.now()}`;
  const field = inbox.getByRole("textbox", { name: "Private message" });
  await field.fill(message);
  await inbox.getByRole("button", { name: "Send", exact: true }).click();
  await inbox.getByText(message, { exact: true }).waitFor();
  assert(await inbox.locator(".message-thread .sent").filter({ hasText: message }).isVisible(), "sent message did not enter the active thread");

  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".notverse-home").waitFor();
  await page.locator(".side-nav button").filter({ hasText: "Inbox" }).click();
  const reloadedInbox = page.locator(".inbox-view");
  await reloadedInbox.waitFor();
  assert(await reloadedInbox.getByText(message, { exact: true }).isVisible(), "sent message was not durable after reload");

  await page.screenshot({ path: `${output}/inbox-sent-desktop.png`, fullPage: true });
  report.screenshots.push("inbox-sent-desktop.png");
  report.checks.push("private message sends into the active thread");
  report.checks.push("private message persists after reload");
  assert(report.errors.length === 0, `browser errors: ${report.errors.join(" | ")}`);
  report.ok = true;
  await writeFile(`${output}/inbox-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  await writeFile(`${output}/inbox-report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
