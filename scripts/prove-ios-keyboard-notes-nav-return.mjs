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
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });
}

function assertPainted(state, width, height, label) {
  assert.equal(state.display, "grid", `${label}: nav display=${state.display}`);
  assert.equal(state.visibility, "visible", `${label}: nav visibility=${state.visibility}`);
  assert(state.opacity >= .99, `${label}: nav opacity=${state.opacity}`);
  assert.equal(state.pointerEvents, "auto", `${label}: nav pointer-events=${state.pointerEvents}`);
  assert(state.width >= width - 24, `${label}: nav width collapsed to ${state.width}`);
  assert(state.height >= 58, `${label}: nav height collapsed to ${state.height}`);
  assert(state.bottom <= height + 1 && state.bottom >= height - 44, `${label}: nav is not at the visible bottom (${state.bottom}/${height})`);
}

async function runCase(browserType, browserName, width, height, keyboardHeight) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    const nav = page.locator(".mobile-nav.notverse-mobile-nav");

    await page.getByRole("button", { name: "Notes", exact: true }).last().click();
    await page.waitForSelector("body.notverse-notes-open");
    const notesNav = await navState(nav);
    assert.equal(notesNav.position, "absolute", `${browserName}/${width}: Notes nav still uses Safari fixed-bottom anchoring`);
    assertPainted(notesNav, width, height, `${browserName}/${width}: initial Notes`);

    await page.getByRole("button", { name: "Comment on Note", exact: true }).click();
    await page.waitForSelector("body.notverse-comments-open");
    const input = page.getByRole("textbox", { name: "Write a comment" });
    const firstReply = page.locator(".replies-list article").first().getByRole("button", { name: "Reply", exact: true });
    await firstReply.tap();
    assert.equal(await input.evaluate((node) => document.activeElement === node), true, `${browserName}/${width}: Reply did not focus comment input`);

    await input.fill("@Nancy keyboard return proof");
    await page.setViewportSize({ width, height: keyboardHeight });
    await page.waitForTimeout(80);

    const beforeCount = await page.locator(".replies-list article").count();
    await page.getByRole("button", { name: "Send", exact: true }).tap();
    await page.waitForFunction((count) => document.querySelectorAll(".replies-list article").length > count, beforeCount);
    assert.equal(await input.evaluate((node) => document.activeElement === node), true, `${browserName}/${width}: Send unexpectedly removed focus; proof no longer models iPhone path`);

    /* Model the user's exact sequence: the keyboard is dismissed, then Back is
       pressed as the visual viewport returns to full height. */
    await input.evaluate((node) => node.blur());
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "Back to Notes", exact: true }).click();
    await settle(page);

    assert.equal(await page.locator("body.notverse-comments-open").count(), 0, `${browserName}/${width}: Comments state survived Back`);
    assert.equal(await page.locator("body.notverse-notes-open").count(), 1, `${browserName}/${width}: Notes state missing after Back`);

    const restored = await navState(nav);
    assert.equal(restored.position, "absolute", `${browserName}/${width}: restored Notes nav fell back to position:fixed`);
    assertPainted(restored, width, height, `${browserName}/${width}: keyboard -> Back`);
    await page.screenshot({ path: `${out}/${browserName}-${width}-keyboard-back-notes.png`, fullPage: false });

    /* This catches the exact symptom from the phone recording: an invisible nav
       must not require a remembered tap to force a repaint. The first tap should
       perform navigation immediately and the bar must remain painted. */
    await nav.getByRole("button", { name: "Search", exact: true }).click();
    await page.locator(".search-view").waitFor({ state: "visible" });
    const afterTap = await navState(nav);
    assertPainted(afterTap, width, height, `${browserName}/${width}: first nav tap after keyboard`);

    report.cases.push({ browserName, width, height, keyboardHeight, notesNav, restored, afterTap });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const [width, height, keyboardHeight] of [[360, 640, 398], [390, 844, 520]]) {
    try {
      await runCase(browserType, browserName, width, height, keyboardHeight);
    } catch (error) {
      report.ok = false;
      report.errors.push(`${browserName}/${width}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`iOS keyboard -> Notes nav return proof passed (${report.cases.length} cases).`);
