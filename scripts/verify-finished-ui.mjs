import { chromium } from "playwright";
import JSZip from "jszip";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.READVERSE_TEST_URL || "http://127.0.0.1:4173";
const evidence = "engineering-evidence/finished-readverse";
await mkdir(evidence, { recursive: true });

function assert(condition, message) { if (!condition) throw new Error(message); }

async function makeEpub() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("OEBPS/content.opf", `<?xml version="1.0"?><package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">readverse-fixture</dc:identifier><dc:title>ReadVerse EPUB Fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>`);
  zip.file("OEBPS/chapter.xhtml", `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head><body><h1>Chapter One</h1>${Array.from({ length: 30 }, (_, i) => `<p>ReadVerse EPUB paragraph ${i + 1}. A real paginated chapter belongs inside the physical reader.</p>`).join("")}</body></html>`);
  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
}

async function makeCbz() {
  const zip = new JSZip();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAPAAAADwCAIAAACxN37FAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAFUlEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAB4G4GAAAGo9MZAAAAAAElFTkSuQmCC", "base64");
  zip.file("001.png", png);
  zip.file("002.png", png);
  zip.file("003.png", png);
  return zip.generateAsync({ type: "nodebuffer" });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

async function uploadAndOpen(name, mimeType, buffer, expectedSelector) {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
  await page.getByRole("button", { name: "Read now" }).last().click();
  await page.locator(expectedSelector).waitFor({ state: "visible", timeout: 30000 });
}

async function closeReader() {
  const close = page.getByRole("button", { name: "Close reader" }).first();
  await close.click();
  await page.locator(".reader-overlay, .pdf-reader").waitFor({ state: "detached", timeout: 10000 });
}

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${evidence}/dashboard.png`, fullPage: true });

  const textBuffer = Buffer.from(Array.from({ length: 80 }, (_, i) => `Chapter paragraph ${i + 1}. This verifies durable TXT pagination and progress inside Nancy's physical reader.`).join("\n\n"));
  await uploadAndOpen("readverse-story.txt", "text/plain", textBuffer, ".text-book-page");
  await page.getByRole("button", { name: "+ Add to Library" }).click();
  await page.getByRole("button", { name: "Save offline" }).click();
  await page.getByRole("button", { name: "✓ Offline" }).waitFor({ timeout: 30000 });
  await page.locator(".universal-footer button").last().click();
  await page.screenshot({ path: `${evidence}/txt-reader.png`, fullPage: true });
  const offlineCount = await page.evaluate(async () => {
    const request = indexedDB.open("nancies-readverse", 1);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction("reading-files", "readonly");
    const countRequest = tx.objectStore("reading-files").count();
    const count = await new Promise((resolve, reject) => { countRequest.onsuccess = () => resolve(countRequest.result); countRequest.onerror = () => reject(countRequest.error); });
    db.close();
    return count;
  });
  assert(offlineCount >= 1, "TXT file was not saved to IndexedDB");
  await closeReader();

  await uploadAndOpen("readverse-book.epub", "application/epub+zip", await makeEpub(), ".epub-page");
  await page.locator(".epub-page iframe").waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${evidence}/epub-reader.png`, fullPage: true });
  await closeReader();

  await uploadAndOpen("readverse-manga.cbz", "application/vnd.comicbook+zip", await makeCbz(), ".comic-page img");
  await page.getByText("Manga RTL").locator("input").check();
  await page.screenshot({ path: `${evidence}/cbz-reader.png`, fullPage: true });
  await closeReader();

  const pdf = await readFile("public/fixtures/sample.pdf");
  await uploadAndOpen("readverse-sample.pdf", "application/pdf", pdf, ".physical-reader-stage");
  await page.getByRole("button", { name: "Save offline" }).click();
  await page.getByRole("button", { name: "✓ Offline" }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${evidence}/pdf-reader.png`, fullPage: true });
  await closeReader();

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Storage & Sync" }).click();
  await page.getByText("Offline reading").waitFor();
  await page.screenshot({ path: `${evidence}/storage-settings.png`, fullPage: true });

  const browserState = await page.evaluate(() => ({
    library: JSON.parse(localStorage.getItem("readverse.library") || "[]"),
    snapshotUpdatedAt: localStorage.getItem("readverse.snapshot-updated-at"),
  }));
  assert(browserState.library.some((book) => book.title?.includes("readverse-story")), "Add to Library did not persist locally");
  assert(browserState.snapshotUpdatedAt, "snapshot timestamp is missing");
  assert(errors.length === 0, `Browser errors: ${errors.join(" | ")}`);

  const report = { ok: true, offlineCount, libraryCount: browserState.library.length, formats: ["pdf", "epub", "cbz", "txt"], errors, viewport: { width: 1440, height: 1000 } };
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${evidence}/report.json`, JSON.stringify({ ok: false, error: error instanceof Error ? error.stack : String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
