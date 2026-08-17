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

async function state(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".main-shell.notverse-shell");
    const nav = document.querySelector(".mobile-nav.notverse-mobile-nav");
    const comments = document.querySelector(".replies-backdrop");
    const send = document.querySelector(".replies-drawer > form > button");
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
      comments: comments instanceof HTMLElement ? {
        insideShell: shell.contains(comments),
        parentIsBody: comments.parentElement === document.body,
        mobileHost: comments.dataset.notverseMobileHost || "",
        position: getComputedStyle(comments).position,
        width: comments.getBoundingClientRect().width,
        height: comments.getBoundingClientRect().height,
      } : null,
      sendType: send instanceof HTMLButtonElement ? send.type : "",
      bodyClasses: [...document.body.classList],
    };
  });
}

function assertKeyboardOwner(value, width, keyboardHeight, label) {
  assert.equal(value.shell.position, "fixed", `${label}: shell position=${value.shell.position}`);
  assert(Math.abs(value.shell.top) <= 1, `${label}: shell top=${value.shell.top}`);
  assert(Math.abs(value.shell.left) <= 1, `${label}: shell left=${value.shell.left}`);
  assert(Math.abs(value.shell.width - width) <= 1, `${label}: shell width ${value.shell.width}/${width}`);
  assert(Math.abs(value.shell.height - keyboardHeight) <= 2, `${label}: shell height ${value.shell.height}/${keyboardHeight}`);
  assert.equal(value.shell.visibility, "visible", `${label}: shell hidden`);
  assert.equal(value.nav.display, "grid", `${label}: nav destroyed`);
  assert.equal(value.nav.visibility, "visible", `${label}: nav hidden`);
  assert(value.nav.opacity <= .01, `${label}: nav opacity=${value.nav.opacity}`);
  assert.equal(value.nav.pointerEvents, "none", `${label}: nav accepts input`);
  assert.equal(value.nav.inert, true, `${label}: nav is not inert`);
  assert.equal(value.nav.ariaHidden, "true", `${label}: nav is not aria-hidden`);
}

function assertRestoredNav(value, width, label) {
  assert.equal(value.nav.display, "grid", `${label}: nav display=${value.nav.display}`);
  assert.equal(value.nav.visibility, "visible", `${label}: nav visibility=${value.nav.visibility}`);
  assert(value.nav.opacity >= .99, `${label}: nav opacity=${value.nav.opacity}`);
  assert.equal(value.nav.pointerEvents, "auto", `${label}: nav pointer-events=${value.nav.pointerEvents}`);
  assert.equal(value.nav.inert, false, `${label}: nav remained inert`);
  assert(value.nav.width >= width - 24, `${label}: nav width=${value.nav.width}`);
}

async function proveComments(page, width, height, keyboardHeight, browserName) {
  await page.getByRole("button", { name: "Notes", exact: true }).last().click();
  await page.getByRole("button", { name: "Comment on Note", exact: true }).click();

  const reply = page.locator(".replies-list article").first().getByRole("button", { name: "Reply", exact: true });
  await reply.tap();
  const input = page.getByRole("textbox", { name: "Write a comment" });
  await input.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const node = document.querySelector('input[aria-label="Write a comment"]');
    return node instanceof HTMLInputElement && node.value.startsWith("@");
  });
  await input.fill(`${await input.inputValue()} Inbox parity reply`);

  await page.setViewportSize({ width, height: keyboardHeight });
  await settle(page);

  const keyboard = await state(page);
  assertKeyboardOwner(keyboard, width, keyboardHeight, `${browserName}/${width}: Comments keyboard`);
  assert(keyboard.comments, `${browserName}/${width}: Comments root missing`);
  assert.equal(keyboard.comments.insideShell, true, `${browserName}/${width}: Comments is outside the main app shell`);
  assert.equal(keyboard.comments.parentIsBody, false, `${browserName}/${width}: Comments regressed to a body portal`);
  assert.equal(keyboard.comments.mobileHost, "", `${browserName}/${width}: obsolete DOM rehost marker returned`);
  assert.equal(keyboard.comments.position, "absolute", `${browserName}/${width}: Comments child is not shell-relative`);
  assert(Math.abs(keyboard.comments.width - width) <= 1, `${browserName}/${width}: Comments width mismatch`);
  assert(Math.abs(keyboard.comments.height - keyboardHeight) <= 2, `${browserName}/${width}: Comments height mismatch`);
  assert.equal(keyboard.sendType, "submit", `${browserName}/${width}: Comments Send is not native form submission`);

  const before = await page.locator(".replies-list article").count();
  await page.getByRole("button", { name: "Send", exact: true }).tap();
  await page.waitForFunction((count) => document.querySelectorAll(".replies-list article").length > count, before);

  /* Exact phone sequence: reply is sent, keyboard goes down, then Back. */
  await page.evaluate(() => {
    const node = document.querySelector('input[aria-label="Write a comment"]');
    if (node instanceof HTMLInputElement) node.blur();
  });
  await page.setViewportSize({ width, height });
  await settle(page);

  const beforeBack = await state(page);
  assert(beforeBack.comments?.insideShell, `${browserName}/${width}: Comments left app tree before Back`);

  await page.getByRole("button", { name: "Back to Notes", exact: true }).click();
  await page.waitForFunction(() => !document.body.classList.contains("notverse-comments-open"));
  await settle(page);

  const restored = await state(page);
  assert.equal(restored.comments, null, `${browserName}/${width}: Comments root survived Back`);
  assertRestoredNav(restored, width, `${browserName}/${width}: Comments -> Notes`);

  /* The first remembered-location tap must navigate immediately. */
  await page.locator(".notverse-mobile-nav button").filter({ hasText: "Search" }).click();
  await page.locator(".search-view").waitFor({ state: "visible" });
  const afterFirstTap = await state(page);
  assertRestoredNav(afterFirstTap, width, `${browserName}/${width}: first nav tap`);

  return { keyboard, beforeBack, restored, afterFirstTap };
}

async function proveInbox(page, width, height, keyboardHeight, browserName) {
  await page.locator(".notverse-mobile-nav button").filter({ hasText: "Inbox" }).click();
  await page.locator(".inbox-layout > aside button").first().click();
  const input = page.getByRole("textbox", { name: "Private message" });
  await input.tap();
  await input.fill("Inbox control keyboard proof");
  await page.setViewportSize({ width, height: keyboardHeight });
  await settle(page);

  const keyboard = await state(page);
  assertKeyboardOwner(keyboard, width, keyboardHeight, `${browserName}/${width}: Inbox keyboard`);

  await page.evaluate(() => {
    const node = document.querySelector('input[aria-label="Private message"]');
    if (node instanceof HTMLInputElement) node.blur();
  });
  await page.setViewportSize({ width, height });
  await settle(page);
  await page.getByRole("button", { name: "Back to conversations", exact: true }).click();
  await settle(page);

  const restored = await state(page);
  assertRestoredNav(restored, width, `${browserName}/${width}: Inbox -> list`);
  return { keyboard, restored };
}

async function runCase(browserType, browserName, width, height, keyboardHeight) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    const comments = await proveComments(page, width, height, keyboardHeight, browserName);

    await prepare(page);
    const inbox = await proveInbox(page, width, height, keyboardHeight, browserName);

    assert.equal(comments.keyboard.shell.position, inbox.keyboard.shell.position, `${browserName}/${width}: shell position lifecycle differs`);
    assert(Math.abs(comments.keyboard.shell.height - inbox.keyboard.shell.height) <= 2, `${browserName}/${width}: keyboard shell heights differ`);
    assert.equal(comments.keyboard.nav.display, inbox.keyboard.nav.display, `${browserName}/${width}: nav display lifecycle differs`);
    assert.equal(comments.keyboard.nav.opacity, inbox.keyboard.nav.opacity, `${browserName}/${width}: nav opacity lifecycle differs`);

    await page.screenshot({ path: `${out}/${browserName}-${width}-inbox-control-restored.png`, fullPage: false });
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
console.log(`Comments/Inbox native DOM + keyboard parity proof passed (${report.cases.length} cases).`);
