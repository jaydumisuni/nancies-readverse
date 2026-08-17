import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/ios-keyboard-notes-nav-return";
await mkdir(out, { recursive: true });

const report = { ok: true, cases: [], errors: [] };

function preferences() {
  localStorage.setItem("notverse.preferences", JSON.stringify({
    setupComplete: true,
    noteFont: "handwritten",
    readingInterests: ["Manga", "Novels", "PDFs"],
    discoveryMethods: ["title", "memory", "link"],
  }));
}

async function prepare(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(preferences);
  await page.reload({ waitUntil: "networkidle" });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function navState(nav) {
  return nav.evaluate((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return {
      position: style.position,
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
      inert: node.hasAttribute("inert"),
      ariaHidden: node.getAttribute("aria-hidden"),
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });
}

async function shellState(shell) {
  return shell.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      visibility: style.visibility,
      pointerEvents: style.pointerEvents,
      display: style.display,
    };
  });
}

function assertPainted(state, width, height, label) {
  assert.equal(state.display, "grid", `${label}: nav display=${state.display}`);
  assert.equal(state.visibility, "visible", `${label}: nav visibility=${state.visibility}`);
  assert(state.opacity >= .99, `${label}: nav opacity=${state.opacity}`);
  assert.equal(state.pointerEvents, "auto", `${label}: nav pointer-events=${state.pointerEvents}`);
  assert.equal(state.inert, false, `${label}: nav remained inert`);
  assert(state.width >= width - 24, `${label}: nav width collapsed to ${state.width}`);
  assert(state.height >= 58, `${label}: nav height collapsed to ${state.height}`);
  assert(state.bottom <= height + 1 && state.bottom >= height - 44, `${label}: nav is not at visible bottom (${state.bottom}/${height})`);
}

function assertRetainedUnderComments(nav, shell, width, label) {
  assert.equal(shell.visibility, "visible", `${label}: Notes shell was hidden during Comments`);
  assert.equal(shell.pointerEvents, "none", `${label}: Notes shell accepts input under Comments`);
  assert.equal(nav.display, "grid", `${label}: nav display=${nav.display}`);
  assert.equal(nav.visibility, "visible", `${label}: nav visibility=${nav.visibility}`);
  assert(nav.opacity >= .99, `${label}: nav opacity=${nav.opacity}`);
  assert.equal(nav.pointerEvents, "none", `${label}: nav accepts pointer input under Comments`);
  assert.equal(nav.inert, true, `${label}: nav is not inert under Comments`);
  assert.equal(nav.ariaHidden, "true", `${label}: nav is not aria-hidden under Comments`);
  assert(nav.width >= width - 24, `${label}: retained nav width collapsed to ${nav.width}`);
  assert(nav.height >= 58, `${label}: retained nav height collapsed to ${nav.height}`);
}

async function openNotes(page) {
  await page.getByRole("button", { name: "Notes", exact: true }).last().click();
  await page.waitForSelector("body.notverse-notes-open");
}

async function openComments(page) {
  await page.getByRole("button", { name: "Comment on Note", exact: true }).click();
  await page.waitForSelector("body.notverse-comments-open");
}

async function provePlainBack(page, nav, width, height, browserName) {
  await openComments(page);
  await page.getByRole("button", { name: "Back to Notes", exact: true }).click();
  await page.waitForFunction(() => !document.body.classList.contains("notverse-comments-open"));
  await settle(page);
  const state = await navState(nav);
  assertPainted(state, width, height, `${browserName}/${width}: plain Comment -> Back`);
  return state;
}

async function interactWithComment(page, mode) {
  const input = page.getByRole("textbox", { name: "Write a comment" });
  const firstReply = page.locator(".replies-list article").first().getByRole("button", { name: "Reply", exact: true });

  if (mode === "reply") {
    await firstReply.tap();
    await page.waitForFunction(() => {
      const input = document.querySelector('input[aria-label="Write a comment"]');
      return input instanceof HTMLInputElement && input.value.startsWith("@");
    });
  } else {
    await input.tap();
  }

  assert.equal(await input.evaluate((node) => document.activeElement === node), true, `${mode}: comment input is not focused`);
  if (mode !== "reply") await input.fill(`Nancy ${mode} keyboard proof`);

  if (mode === "send") {
    const beforeCount = await page.locator(".replies-list article").count();
    await page.getByRole("button", { name: "Send", exact: true }).tap();
    await page.waitForFunction((count) => document.querySelectorAll(".replies-list article").length > count, beforeCount);
    assert.equal(await input.evaluate((node) => document.activeElement === node), true, "send: input focus was not retained");
  }

  return input;
}

async function proveKeyboardPath(page, nav, shell, width, height, keyboardHeight, browserName, mode) {
  await openComments(page);
  const input = await interactWithComment(page, mode);
  await page.setViewportSize({ width, height: keyboardHeight });
  await page.waitForTimeout(90);

  const coveredNav = await navState(nav);
  const coveredShell = await shellState(shell);
  assertRetainedUnderComments(coveredNav, coveredShell, width, `${browserName}/${width}/${mode}: keyboard open`);

  /* The exact iPhone failure boundary: Back is tapped while the input/keyboard
     has participated in the visual viewport. Comments must release focus but
     stay mounted until the viewport is fully restored. */
  await page.getByRole("button", { name: "Back to Notes", exact: true }).click();
  await page.waitForTimeout(70);
  assert.equal(await page.locator("body.notverse-comments-open").count(), 1, `${browserName}/${width}/${mode}: Comments closed before keyboard recovery`);
  assert.equal(await input.evaluate((node) => document.activeElement === node), false, `${browserName}/${width}/${mode}: Back did not blur comment input`);

  await page.setViewportSize({ width, height });
  await page.waitForFunction(() => !document.body.classList.contains("notverse-comments-open"), null, { timeout: 1200 });
  await settle(page);

  const restored = await navState(nav);
  assert.equal(restored.position, "absolute", `${browserName}/${width}/${mode}: restored Notes nav fell back to fixed`);
  assertPainted(restored, width, height, `${browserName}/${width}/${mode}: restored Notes nav`);
  await page.screenshot({ path: `${out}/${browserName}-${width}-${mode}-back-notes.png`, fullPage: false });

  /* The first remembered-location tap must navigate, not merely repaint. */
  await nav.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator(".search-view").waitFor({ state: "visible" });
  const afterTap = await navState(nav);
  assertPainted(afterTap, width, height, `${browserName}/${width}/${mode}: first nav tap`);

  return { mode, coveredNav, coveredShell, restored, afterTap };
}

async function runCase(browserType, browserName, width, height, keyboardHeight, mode) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    const nav = page.locator(".mobile-nav.notverse-mobile-nav");
    const shell = page.locator(".main-shell.notverse-shell");

    await openNotes(page);
    const initial = await navState(nav);
    assert.equal(initial.position, "absolute", `${browserName}/${width}: Notes nav still uses fixed anchoring`);
    assertPainted(initial, width, height, `${browserName}/${width}: initial Notes`);

    const plain = await provePlainBack(page, nav, width, height, browserName);
    const keyboard = await proveKeyboardPath(page, nav, shell, width, height, keyboardHeight, browserName, mode);
    report.cases.push({ browserName, width, height, keyboardHeight, mode, initial, plain, ...keyboard });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const [width, height, keyboardHeight] of [[360, 640, 398], [390, 844, 520]]) {
    for (const mode of ["type", "reply", "send"]) {
      try {
        await runCase(browserType, browserName, width, height, keyboardHeight, mode);
      } catch (error) {
        report.ok = false;
        report.errors.push(`${browserName}/${width}/${mode}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`iOS Comment keyboard -> Notes nav return proof passed (${report.cases.length} keyboard cases).`);
