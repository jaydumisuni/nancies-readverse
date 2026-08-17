import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/comments-inbox-keyboard-parity";
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

async function surfaceState(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".main-shell.notverse-shell");
    const nav = document.querySelector(".mobile-nav.notverse-mobile-nav");
    if (!(shell instanceof HTMLElement) || !(nav instanceof HTMLElement)) throw new Error("mobile shell/nav missing");
    const shellStyle = getComputedStyle(shell);
    const navStyle = getComputedStyle(nav);
    const shellBox = shell.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    return {
      shell: {
        position: shellStyle.position,
        top: shellBox.top,
        left: shellBox.left,
        width: shellBox.width,
        height: shellBox.height,
        visibility: shellStyle.visibility,
        pointerEvents: shellStyle.pointerEvents,
      },
      nav: {
        display: navStyle.display,
        visibility: navStyle.visibility,
        opacity: Number(navStyle.opacity),
        pointerEvents: navStyle.pointerEvents,
        inert: nav.hasAttribute("inert"),
        ariaHidden: nav.getAttribute("aria-hidden"),
        width: navBox.width,
        height: navBox.height,
      },
      bodyClasses: [...document.body.classList],
    };
  });
}

function assertKeyboardOwner(state, width, keyboardHeight, label) {
  assert.equal(state.shell.position, "fixed", `${label}: shell is not fixed`);
  assert(Math.abs(state.shell.top) <= 1, `${label}: shell top moved (${state.shell.top})`);
  assert(Math.abs(state.shell.left) <= 1, `${label}: shell left moved (${state.shell.left})`);
  assert(Math.abs(state.shell.width - width) <= 1, `${label}: shell width ${state.shell.width}/${width}`);
  assert(Math.abs(state.shell.height - keyboardHeight) <= 2, `${label}: shell height ${state.shell.height}/${keyboardHeight}`);
  assert.equal(state.shell.visibility, "visible", `${label}: shell hidden`);
  assert.equal(state.nav.display, "grid", `${label}: nav destroyed`);
  assert.equal(state.nav.visibility, "visible", `${label}: nav visibility hidden`);
  assert(state.nav.opacity <= .01, `${label}: nav should be transparent while keyboard screen owns viewport`);
  assert.equal(state.nav.pointerEvents, "none", `${label}: nav accepts input under keyboard screen`);
  assert.equal(state.nav.inert, true, `${label}: nav is not inert`);
  assert.equal(state.nav.ariaHidden, "true", `${label}: nav is not aria-hidden`);
}

function assertRestoredNav(state, width, label) {
  assert.equal(state.nav.display, "grid", `${label}: nav display=${state.nav.display}`);
  assert.equal(state.nav.visibility, "visible", `${label}: nav visibility=${state.nav.visibility}`);
  assert(state.nav.opacity >= .99, `${label}: nav opacity=${state.nav.opacity}`);
  assert.equal(state.nav.pointerEvents, "auto", `${label}: nav pointer-events=${state.nav.pointerEvents}`);
  assert.equal(state.nav.inert, false, `${label}: nav remained inert`);
  assert(state.nav.width >= width - 24, `${label}: nav width collapsed (${state.nav.width})`);
}

async function proveComments(page, width, height, keyboardHeight) {
  await page.getByRole("button", { name: "Notes", exact: true }).last().click();
  await page.getByRole("button", { name: "Comment on Note", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Write a comment" });
  await input.tap();
  await input.fill("Inbox parity keyboard proof");
  await page.setViewportSize({ width, height: keyboardHeight });
  await settle(page);

  const focused = await surfaceState(page);
  assertKeyboardOwner(focused, width, keyboardHeight, "Comments keyboard");

  /* Inbox closes its thread normally; Comments must do the same. No delayed
     capture/replay handler is allowed to keep the old surface mounted. */
  await page.getByRole("button", { name: "Back to Notes", exact: true }).click();
  await page.waitForFunction(() => !document.body.classList.contains("notverse-comments-open"));
  await page.setViewportSize({ width, height });
  await settle(page);

  const restored = await surfaceState(page);
  assertRestoredNav(restored, width, "Comments -> Notes");
  return { focused, restored };
}

async function proveInbox(page, width, height, keyboardHeight) {
  await page.locator(".notverse-mobile-nav button").filter({ hasText: "Inbox" }).click();
  const firstThread = page.locator(".inbox-layout > aside button").first();
  await firstThread.click();
  const input = page.getByRole("textbox", { name: "Private message" });
  await input.tap();
  await input.fill("Inbox control keyboard proof");
  await page.setViewportSize({ width, height: keyboardHeight });
  await settle(page);

  const focused = await surfaceState(page);
  assertKeyboardOwner(focused, width, keyboardHeight, "Inbox keyboard");

  await page.getByRole("button", { name: "Back to conversations", exact: true }).click();
  await page.setViewportSize({ width, height });
  await settle(page);

  const restored = await surfaceState(page);
  assertRestoredNav(restored, width, "Inbox -> list");
  return { focused, restored };
}

async function runCase(browserType, browserName, width, height, keyboardHeight) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    const comments = await proveComments(page, width, height, keyboardHeight);

    await prepare(page);
    const inbox = await proveInbox(page, width, height, keyboardHeight);

    for (const key of ["position", "visibility", "pointerEvents"]) {
      assert.equal(comments.focused.shell[key], inbox.focused.shell[key], `${browserName}/${width}: Comments/Inbox shell ${key} differs`);
    }
    assert(Math.abs(comments.focused.shell.height - inbox.focused.shell.height) <= 2, `${browserName}/${width}: keyboard shell heights differ`);
    assert.equal(comments.focused.nav.display, inbox.focused.nav.display, `${browserName}/${width}: nav display lifecycle differs`);
    assert.equal(comments.focused.nav.opacity, inbox.focused.nav.opacity, `${browserName}/${width}: nav opacity lifecycle differs`);

    await page.screenshot({ path: `${out}/${browserName}-${width}-inbox-parity-restored.png`, fullPage: false });
    report.cases.push({ browserName, width, height, keyboardHeight, comments, inbox });
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
console.log(`Comments/Inbox keyboard parity proof passed (${report.cases.length} cases).`);
