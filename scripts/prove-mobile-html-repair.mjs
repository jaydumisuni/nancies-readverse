import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/mobile-html-repair";
await mkdir(out, { recursive: true });

const report = { ok: true, cases: [], errors: [] };

function setupPreferences() {
  localStorage.setItem("notverse.preferences", JSON.stringify({
    setupComplete: true,
    noteFont: "handwritten",
    readingInterests: ["Manga", "Novels", "PDFs"],
    discoveryMethods: ["title", "memory", "link"],
  }));
}

async function prepare(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(setupPreferences);
  await page.reload({ waitUntil: "networkidle" });
}

async function box(locator) {
  return locator.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
  });
}

async function assertSurface(page, selector, width, height, label) {
  const surface = page.locator(selector).first();
  await surface.waitFor();
  const r = await box(surface);
  assert(Math.abs(r.left) <= 1, `${label}: left ${r.left}`);
  assert(Math.abs(r.top) <= 2, `${label}: top ${r.top}`);
  assert(Math.abs(r.width - width) <= 2, `${label}: width ${r.width} vs ${width}`);
  assert(Math.abs(r.height - height) <= 3, `${label}: height ${r.height} vs ${height}`);
  return r;
}

async function proveHomeAndChat(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);

    const shell = page.locator(".main-shell.notverse-shell");
    await shell.waitFor();
    const shellBox = await box(shell);
    assert(shellBox.width >= 388, `${browserName}: Home shell is not full width`);
    assert(shellBox.height > 500, `${browserName}: Home shell collapsed into black space`);
    assert.equal(await page.locator(".mobile-notifications").count(), 0, `${browserName}: duplicate mobile Activity control still exists`);
    assert.equal(await page.locator(".activity-button").count(), 1, `${browserName}: expected one global Activity control`);
    assert.equal(await page.locator('.activity-button[aria-label="Activity"]').count(), 1, `${browserName}: remaining Activity control is ambiguous`);
    await page.screenshot({ path: `${out}/${browserName}-390-home.png`, fullPage: false });

    const companionTrigger = page.locator(".floating-companion");
    await companionTrigger.waitFor();
    await companionTrigger.click();
    await assertSurface(page, ".companion-panel.open", 390, 844, `${browserName} Chat open`);
    const chatBackground = await page.locator(".companion-panel.open").evaluate((node) => getComputedStyle(node).backgroundColor);
    assert(!/rgba\([^)]*,\s*0\s*\)$/.test(chatBackground) && chatBackground !== "transparent", `${browserName}: Chat surface is transparent`);
    const centerOwner = await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(".companion-panel.open") !== null);
    assert(centerOwner, `${browserName}: Home is intercepting the open Chat surface`);
    await page.screenshot({ path: `${out}/${browserName}-390-chat-open.png`, fullPage: false });

    const editor = page.locator(".companion-panel.open textarea.chat-composer-editor");
    await editor.waitFor();
    await editor.fill("Mobile keyboard proof");
    await editor.focus();
    await page.setViewportSize({ width: 390, height: 520 });
    await page.waitForTimeout(120);
    await assertSurface(page, ".companion-panel.open", 390, 520, `${browserName} Chat keyboard`);
    const composer = await box(page.locator(".companion-panel.open .chat-input"));
    assert(composer.bottom <= 521 && composer.bottom >= 516, `${browserName}: Chat composer is not attached to keyboard-height viewport: ${composer.bottom}`);
    assert(composer.top >= 0, `${browserName}: Chat composer moved above viewport`);
    await page.screenshot({ path: `${out}/${browserName}-390-chat-keyboard.png`, fullPage: false });

    report.cases.push({ browserName, kind: "home-chat", shellBox, composer });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveComments(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.getByRole("button", { name: "Notes", exact: true }).last().click();
    const commentAction = page.getByRole("button", { name: "Comment on Note", exact: true });
    await commentAction.waitFor();
    await commentAction.click();

    await page.getByText("Comments", { exact: true }).waitFor();
    assert.equal(await page.getByText("Reply without spoiling what comes next…", { exact: true }).count(), 0, `${browserName}: obsolete reply/spoiler copy remains`);
    assert.equal(await page.getByText("Start the conversation without spoiling what comes next.", { exact: true }).count(), 0, `${browserName}: obsolete spoiler warning remains`);

    const input = page.getByRole("textbox", { name: "Write a comment" });
    await input.waitFor();
    const openInput = await box(input);
    const initialHeight = await page.evaluate(() => innerHeight);
    assert(openInput.bottom <= initialHeight + 1, `${browserName}: Comment input starts below mobile viewport: ${openInput.bottom} vs ${initialHeight}`);

    await input.fill(`Visible comment ${browserName}`);
    await input.focus();
    await page.setViewportSize({ width: 390, height: 520 });
    await page.waitForTimeout(120);
    await assertSurface(page, ".replies-backdrop", 390, 520, `${browserName} Comments keyboard`);
    const form = await box(page.locator(".replies-drawer > form"));
    assert(form.bottom <= 521 && form.bottom >= 516, `${browserName}: Comment composer is below keyboard-height viewport: ${form.bottom}`);
    assert(form.top >= 0, `${browserName}: Comment composer moved off top`);

    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText(`Visible comment ${browserName}`, { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${browserName}-390-comments-keyboard.png`, fullPage: false });

    report.cases.push({ browserName, kind: "comments", openInput, form });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function publishNote(page, text, spoiler) {
  await page.getByRole("button", { name: "New Note" }).click();
  const composer = page.locator(".note-composer");
  await composer.waitFor();
  await composer.locator("textarea").fill(text);
  await composer.getByLabel("Spoiler scope").selectOption({ label: spoiler });
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  await page.getByText(text, { exact: true }).waitFor();
  return page.evaluate((needle) => {
    const notes = JSON.parse(localStorage.getItem("notverse.notes") || "[]");
    return notes.find((note) => note.text === needle) || null;
  }, text);
}

async function proveSpoilerContract(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.getByRole("button", { name: "Notes", exact: true }).last().click();

    const safeText = `No spoiler contract ${browserName} ${Date.now()}`;
    const safe = await publishNote(page, safeText, "No spoilers");
    assert(safe, `${browserName}: no-spoiler Note not persisted`);
    assert(!safe.spoilerBoundary, `${browserName}: "No spoilers" persisted as spoiler boundary: ${safe.spoilerBoundary}`);

    const spoilerText = `Spoiler contract ${browserName} ${Date.now()}`;
    const marked = await publishNote(page, spoilerText, "Whole-book spoilers");
    assert(marked, `${browserName}: spoiler-marked Note not persisted`);
    assert.equal(marked.spoilerBoundary, "Whole-book spoilers", `${browserName}: explicit spoiler choice was lost`);

    await page.screenshot({ path: `${out}/${browserName}-390-spoiler-choice.png`, fullPage: false });
    report.cases.push({ browserName, kind: "spoiler-contract", safeBoundary: safe.spoilerBoundary || null, markedBoundary: marked.spoilerBoundary });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const proof of [proveHomeAndChat, proveComments, proveSpoilerContract]) {
    try {
      await proof(browserType, browserName);
    } catch (error) {
      report.ok = false;
      report.errors.push(`${browserName}/${proof.name}: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    }
  }
}

await writeFile(`${out}/mobile-html-repair-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Mobile HTML repair proof passed (${report.cases.length} cases).`);
