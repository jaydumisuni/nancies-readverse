import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const base = process.env.READVERSE_TEST_URL || "http://127.0.0.1:4173";
const output = "physical-reader-evidence";
await mkdir(output, { recursive: true });
const report = { status: "running", checks: [], consoleErrors: [], visualMetrics: {} };
const pass = (name, detail = "passed") => report.checks.push({ name, detail });

async function makeBookPdf() {
  const document = await PDFDocument.create();
  document.setTitle("ReadVerse Physical Reader Proof");
  document.setAuthor("Nancy’s ReadVerse");
  const serif = await document.embedFont(StandardFonts.TimesRoman);
  const serifBold = await document.embedFont(StandardFonts.TimesRomanBold);
  for (let pageIndex = 1; pageIndex <= 8; pageIndex += 1) {
    const page = document.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(.96, .93, .87) });
    page.drawText(`CHAPTER ${Math.ceil(pageIndex / 2)}`, { x: 255, y: 735, size: 9, font: serifBold, color: rgb(.22, .18, .15) });
    page.drawText(pageIndex === 1 ? "The Door Between Stories" : `A Page Worth Turning — ${pageIndex}`, { x: 92, y: 696, size: pageIndex === 1 ? 24 : 18, font: serifBold, color: rgb(.17, .13, .11) });
    if (pageIndex === 1) {
      page.drawRectangle({ x: 96, y: 470, width: 420, height: 175, color: rgb(.10, .16, .23), borderColor: rgb(.55, .39, .24), borderWidth: 2 });
      page.drawCircle({ x: 410, y: 570, size: 42, color: rgb(.86, .67, .30) });
      page.drawText("READVERSE", { x: 245, y: 545, size: 22, font: serifBold, color: rgb(.94, .86, .70) });
    }
    const startY = pageIndex === 1 ? 430 : 650;
    for (let line = 0; line < 25; line += 1) {
      const sentence = line % 3 === 0
        ? "The real page remained exactly as its author designed it, held inside a book that felt alive."
        : line % 3 === 1
          ? "Nancy turned the page and the paper shadow moved softly across the binding."
          : "A useful highlight rested above the ink without changing a single word beneath it.";
      page.drawText(sentence, { x: 72, y: startY - line * 20, size: 10.5, font: serif, color: rgb(.16, .13, .11), maxWidth: 468 });
    }
    page.drawText(String(pageIndex), { x: 302, y: 30, size: 9, font: serif, color: rgb(.28, .23, .20) });
  }
  return Buffer.from(await document.save());
}

async function waitForCanvas(page) {
  await page.locator(".pdf-reader").waitFor({ state: "visible", timeout: 30000 });
  await page.locator(".pdf-page-shell canvas").first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".pdf-page-shell canvas");
    return canvas instanceof HTMLCanvasElement && canvas.width > 100 && canvas.height > 100;
  });
}

async function capture(page, name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
}

const pdfBuffer = await makeBookPdf();
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(`desktop: ${message.text()}`); });
  page.on("pageerror", (error) => report.consoleErrors.push(`desktop: ${error.message}`));
  await page.goto(base, { waitUntil: "networkidle", timeout: 90000 });
  const sidebarBefore = await page.locator(".sidebar").boundingBox();
  const mainBefore = await page.locator(".main-shell").boundingBox();
  assert.ok(sidebarBefore && mainBefore);

  await page.locator('input[type="file"]').setInputFiles({ name: "physical-reader-proof.pdf", mimeType: "application/pdf", buffer: pdfBuffer });
  await page.getByRole("button", { name: "Read now" }).last().click();
  await waitForCanvas(page);
  assert.equal(await page.locator(".pdf-page-shell").count(), 2);
  assert.ok(await page.locator(".physical-book.spread").isVisible());
  assert.match(await page.locator(".reader-page-counter span").textContent(), /1–2\s*\/\s*8/);
  const bookBox = await page.locator(".physical-book").boundingBox();
  const workspaceBox = await page.locator(".physical-reader-stage").boundingBox();
  assert.ok(bookBox && workspaceBox);
  assert.ok(bookBox.width / workspaceBox.width > .62);
  assert.ok(bookBox.height / workspaceBox.height > .76);
  report.visualMetrics.desktopBookCoverage = { width: bookBox.width / workspaceBox.width, height: bookBox.height / workspaceBox.height };
  await capture(page, "desktop-book");
  pass("Desktop opens a real eight-page PDF as a two-page physical book");

  await page.locator(".physical-page-arrow.next").click();
  await page.waitForFunction(() => document.querySelector(".reader-page-counter span")?.textContent?.includes("3–4"));
  await page.locator(".physical-page-arrow.previous").click();
  await page.waitForFunction(() => document.querySelector(".reader-page-counter span")?.textContent?.includes("1–2"));
  pass("Animated forward and backward page turns update the real PDF pages");

  const zoomButtons = page.locator(".reader-zoom button");
  await zoomButtons.last().click();
  await page.getByText("110%", { exact: true }).waitFor();
  await zoomButtons.first().click();
  await page.getByText("100%", { exact: true }).waitFor();
  pass("Zoom controls change and restore rendered page scale");

  const mode = page.locator(".experience-select select");
  await mode.selectOption("comic");
  await page.locator(".pdf-reader.experience-comic").waitFor();
  assert.equal(await page.locator(".pdf-page-shell").count(), 1);
  await capture(page, "desktop-comic");
  await mode.selectOption("manga");
  await page.locator(".pdf-reader.experience-manga").waitFor();
  assert.equal(await page.locator(".physical-reader-stage").getAttribute("data-direction"), "rtl");
  await capture(page, "desktop-manga");
  await mode.selectOption("magazine");
  await page.locator(".pdf-reader.experience-magazine").waitFor();
  assert.equal(await page.locator(".pdf-page-shell").count(), 2);
  await capture(page, "desktop-magazine");
  await mode.selectOption("document");
  await page.locator(".pdf-reader.experience-document").waitFor();
  assert.equal(await page.locator(".pdf-page-shell").count(), 1);
  await capture(page, "desktop-document");
  await mode.selectOption("book");
  await page.locator(".pdf-reader.experience-book").waitFor();
  pass("Book, comic, manga, magazine and document identities render distinctly");

  await page.getByRole("button", { name: /Thumbnails/ }).click();
  await page.locator(".pdf-thumbnail").first().waitFor();
  assert.equal(await page.locator(".pdf-thumbnail").count(), 8);
  await page.locator(".reader-side-panel header button").click();
  pass("Thumbnail navigator renders every PDF page");

  await page.getByRole("button", { name: /Bookmark/ }).click();
  await page.locator(".bookmark-current").click();
  assert.equal(await page.locator(".outline-item").count(), 1);
  assert.match(await page.locator(".outline-item").first().textContent(), /Page 1/);
  await page.locator(".reader-side-panel header button").click();
  pass("Ribbon bookmarks can be added, listed and revisited");

  await page.locator(".reader-tools button").filter({ hasText: "Notes" }).click();
  const noteBox = page.locator(".document-note textarea");
  await noteBox.fill("The paper feeling makes the real page easier to remember.");
  await page.locator(".reader-side-panel header button").click();
  await page.locator(".reader-tools button").filter({ hasText: "Notes" }).click();
  assert.equal(await noteBox.inputValue(), "The paper feeling makes the real page easier to remember.");
  await page.locator(".reader-side-panel header button").click();
  pass("Document notes remain attached to the current reading session");

  await page.getByRole("button", { name: /Area marker/ }).click();
  const shell = page.locator(".pdf-page-shell").first();
  const shellBox = await shell.boundingBox();
  assert.ok(shellBox);
  await page.mouse.move(shellBox.x + shellBox.width * .28, shellBox.y + shellBox.height * .32);
  await page.mouse.down();
  await page.mouse.move(shellBox.x + shellBox.width * .66, shellBox.y + shellBox.height * .43, { steps: 8 });
  await page.mouse.up();
  await page.locator(".selection-toolbar").waitFor({ state: "visible" });
  await page.locator(".selection-toolbar button").first().click();
  await page.locator(".pdf-highlight").waitFor({ state: "visible" });
  await page.locator(".highlight-note-editor textarea").fill("A useful visual annotation over the untouched page.");
  assert.equal(await page.locator(".highlight-list-item").count(), 1);
  await capture(page, "desktop-highlight");
  pass("Area highlighting creates a persistent overlay and attached note");

  await page.locator(".reader-fullscreen").click();
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains("pdf-reader"));
  await page.locator(".reader-fullscreen").click();
  await page.waitForFunction(() => !document.fullscreenElement);
  pass("Fullscreen targets the physical reader itself");

  await page.locator(".reader-back").click();
  await page.locator(".pdf-reader").waitFor({ state: "detached" });
  assert.deepEqual(await page.locator(".sidebar").boundingBox(), sidebarBefore);
  assert.deepEqual(await page.locator(".main-shell").boundingBox(), mainBefore);
  pass("Closing the reader restores the approved dashboard without layout changes");

  await page.getByRole("button", { name: "Sources" }).click();
  const sourceUrl = "https://example.test/book.pdf?utm_source=readverse-reader&campaign=physical-proof";
  await page.locator('.source-dialog input[type="url"]').fill(sourceUrl);
  await page.locator(".source-submit").click();
  await waitForCanvas(page);
  assert.match(await page.locator(".reader-title-block small").textContent(), /Temporary PDF session/);
  await capture(page, "desktop-source-link");
  pass("A public source link is cleaned and rendered through the same physical reader");
  await page.locator(".reader-back").click();
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  mobilePage.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(`mobile: ${message.text()}`); });
  mobilePage.on("pageerror", (error) => report.consoleErrors.push(`mobile: ${error.message}`));
  await mobilePage.goto(base, { waitUntil: "networkidle", timeout: 90000 });
  await mobilePage.locator('input[type="file"]').setInputFiles({ name: "physical-reader-proof.pdf", mimeType: "application/pdf", buffer: pdfBuffer });
  await mobilePage.getByRole("button", { name: "Read now" }).last().click();
  await waitForCanvas(mobilePage);
  assert.equal(await mobilePage.locator(".pdf-page-shell").count(), 1);
  const mobilePageBox = await mobilePage.locator(".pdf-page-shell").boundingBox();
  const mobileStageBox = await mobilePage.locator(".physical-reader-stage").boundingBox();
  assert.ok(mobilePageBox && mobileStageBox);
  const mobileWidthCoverage = mobilePageBox.width / mobileStageBox.width;
  const mobileHeightCoverage = mobilePageBox.height / mobileStageBox.height;
  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report.visualMetrics.mobilePageCoverage = { width: mobileWidthCoverage, height: mobileHeightCoverage, overflow };
  await capture(mobilePage, "mobile-book");
  assert.ok(mobileWidthCoverage > .76);
  assert.ok(mobileHeightCoverage > .64);
  assert.ok(overflow <= 1, `Mobile reader overflowed by ${overflow}px`);

  await mobilePage.locator(".physical-reader-stage").dispatchEvent("touchstart", { touches: [{ clientX: 330, clientY: 410 }] });
  await mobilePage.locator(".physical-reader-stage").dispatchEvent("touchend", { changedTouches: [{ clientX: 70, clientY: 410 }] });
  await mobilePage.waitForTimeout(600);
  assert.equal(await mobilePage.locator(".physical-page-number").textContent(), "2");
  await mobilePage.locator(".experience-select select").selectOption("manga");
  assert.equal(await mobilePage.locator(".physical-reader-stage").getAttribute("data-direction"), "rtl");
  await capture(mobilePage, "mobile-manga");
  pass("Mobile uses a full single page, swipe navigation and right-to-left manga mode");
  await mobile.close();

  assert.deepEqual(report.consoleErrors, []);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  report.stack = error instanceof Error ? error.stack : undefined;
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
