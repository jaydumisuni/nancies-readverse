import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/mobile-native-screens";
await mkdir(out, { recursive: true });
const report = { ok: true, cases: [], errors: [] };
const commentsSource = await readFile("src/notverse/NotesSocialExperience.tsx", "utf8");
assert.match(commentsSource, /function replyTo\(author: string\)[\s\S]*?input\?\.focus\(\);\s*setDraft\(`/u, "Reply must synchronously focus before updating the mention draft");
assert.doesNotMatch(commentsSource, /requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/u, "Reply focus must not be deferred out of the user gesture");

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

async function rect(locator) {
  return locator.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
  });
}

async function surface(page, selector, width, height, label) {
  const node = page.locator(selector).first();
  await node.waitFor();
  const r = await rect(node);
  assert(Math.abs(r.left) <= 1, `${label}: left ${r.left}`);
  assert(Math.abs(r.width - width) <= 2, `${label}: width ${r.width}`);
  assert(Math.abs(r.height - height) <= 3, `${label}: height ${r.height}`);
  return r;
}

async function proveChat(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.locator(".floating-companion").click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("body.notverse-chat-open").count(), 1, `${browserName}: chat body state missing`);
    assert.equal(await page.locator(".main-shell.notverse-shell").evaluate((n) => getComputedStyle(n).visibility), "hidden", `${browserName}: workspace remains visible behind Chat`);
    await surface(page, ".companion-panel.open", 390, 844, `${browserName} chat screen`);
    const input = page.locator(".companion-panel.open .chat-input input");
    await input.fill("keyboard stability");
    await input.focus();
    await page.setViewportSize({ width: 390, height: 520 });
    await page.waitForTimeout(120);
    await surface(page, ".companion-panel.open", 390, 520, `${browserName} chat keyboard`);
    const body = page.locator(".companion-panel.open .chat-body");
    await body.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(80);
    const composer = await rect(page.locator(".companion-panel.open .chat-input"));
    assert(composer.bottom >= 516 && composer.bottom <= 521, `${browserName}: chat composer detached after scroll ${composer.bottom}`);
    await page.screenshot({ path: `${out}/${browserName}-chat-keyboard.png`, fullPage: false });
    report.cases.push({ browserName, kind: "chat", composer });
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
    await page.getByRole("button", { name: "Comment on Note", exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("body.notverse-comments-open").count(), 1, `${browserName}: comments body state missing`);
    assert.equal(await page.locator(".main-shell.notverse-shell").evaluate((n) => getComputedStyle(n).visibility), "hidden", `${browserName}: Notes remains visible behind Comments`);
    await surface(page, ".replies-backdrop", 390, 844, `${browserName} comments screen`);
    await surface(page, ".replies-drawer", 390, 844, `${browserName} comments drawer`);
    assert.equal(await page.getByRole("button", { name: "Back to Notes" }).count(), 1, `${browserName}: comments back action missing`);
    const mobileNav = page.locator(".mobile-nav.notverse-mobile-nav");
    assert.equal(await mobileNav.getAttribute("inert"), "", `${browserName}: hidden mobile nav is not inert under Comments`);
    assert.equal(await mobileNav.getAttribute("aria-hidden"), "true", `${browserName}: hidden mobile nav still owns accessibility/touch state`);
    assert.equal(await mobileNav.evaluate((n) => getComputedStyle(n).display), "none", `${browserName}: mobile nav remains painted under Comments`);
    const activeNavBefore = await mobileNav.locator("button.active").textContent();
    await page.touchscreen.tap(24, 820);
    await page.waitForTimeout(60);
    assert.equal(await page.locator("body.notverse-comments-open").count(), 1, `${browserName}: tapping old nav coordinates escaped Comments`);
    assert.equal(await mobileNav.locator("button.active").textContent(), activeNavBefore, `${browserName}: invisible mobile nav accepted a tap under Comments`);

    const input = page.getByRole("textbox", { name: "Write a comment" });
    const firstComment = page.locator(".replies-list article").first();
    assert.equal(await firstComment.count(), 1, `${browserName}: starter comment missing for Reply focus proof`);
    const replyAuthor = (await firstComment.locator("b").innerText()).replace(/You$/u, "").trim();
    await firstComment.getByRole("button", { name: "Reply", exact: true }).tap();
    await page.waitForTimeout(20);
    assert.equal(await input.inputValue(), `@${replyAuthor} `, `${browserName}: Reply did not populate the expected mention`);
    assert.equal(await input.evaluate((n) => document.activeElement === n), true, `${browserName}: Reply did not focus the comment composer in the tap gesture`);
    await input.fill("scroll stability");
    await input.focus();
    await page.setViewportSize({ width: 390, height: 520 });
    await page.waitForTimeout(120);
    await surface(page, ".replies-backdrop", 390, 520, `${browserName} comments keyboard`);
    const list = page.locator(".replies-list");
    await list.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(80);
    const form = await rect(page.locator(".replies-drawer > form"));
    assert(form.bottom >= 516 && form.bottom <= 521, `${browserName}: comment composer detached after scroll ${form.bottom}`);
    const overflow = await list.evaluate((n) => getComputedStyle(n).overflowY);
    assert(["auto", "scroll"].includes(overflow), `${browserName}: comments list is not the scroll owner: ${overflow}`);
    await page.screenshot({ path: `${out}/${browserName}-comments-keyboard.png`, fullPage: false });
    report.cases.push({ browserName, kind: "comments", form });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function proveInbox(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.getByRole("button", { name: "Inbox", exact: true }).last().click();
    await page.waitForTimeout(80);
    assert.equal(await page.locator("body.notverse-inbox-active").count(), 1, `${browserName}: inbox tab state missing`);
    assert.notEqual(await page.locator(".inbox-layout > aside").evaluate((n) => getComputedStyle(n).display), "none", `${browserName}: inbox list missing`);
    assert.equal(await page.locator(".inbox-layout > main").evaluate((n) => getComputedStyle(n).display), "none", `${browserName}: conversation is visible beside list`);
    await page.screenshot({ path: `${out}/${browserName}-inbox-list.png`, fullPage: false });

    const firstThread = page.locator(".inbox-layout > aside button").first();
    await firstThread.click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("body.notverse-inbox-thread-open").count(), 1, `${browserName}: inbox thread state missing`);
    assert.equal(await page.locator(".inbox-layout > aside").evaluate((n) => getComputedStyle(n).display), "none", `${browserName}: list remains beside conversation`);
    await surface(page, ".inbox-layout > main", 390, 844, `${browserName} inbox conversation`);
    assert.equal(await page.getByRole("button", { name: "Back to conversations" }).count(), 1, `${browserName}: inbox back action missing`);

    const input = page.getByRole("textbox", { name: "Private message" });
    await input.fill("keyboard stability");
    await input.focus();
    await page.setViewportSize({ width: 390, height: 520 });
    await page.waitForTimeout(120);
    await surface(page, ".inbox-layout > main", 390, 520, `${browserName} inbox keyboard`);
    const thread = page.locator(".message-thread");
    await thread.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(80);
    const form = await rect(page.locator(".inbox-layout main > form"));
    assert(form.bottom >= 516 && form.bottom <= 521, `${browserName}: inbox composer detached after scroll ${form.bottom}`);
    await page.screenshot({ path: `${out}/${browserName}-inbox-keyboard.png`, fullPage: false });

    await page.getByRole("button", { name: "Back to conversations" }).click();
    await page.waitForTimeout(80);
    assert.equal(await page.locator("body.notverse-inbox-thread-open").count(), 0, `${browserName}: inbox thread body state did not clear`);
    assert.notEqual(await page.locator(".inbox-layout > aside").evaluate((n) => getComputedStyle(n).display), "none", `${browserName}: inbox list did not return`);
    report.cases.push({ browserName, kind: "inbox", form });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  for (const proof of [proveInbox, proveChat, proveComments]) {
    try {
      await proof(browserType, browserName);
    } catch (error) {
      report.ok = false;
      report.errors.push(`${browserName}/${proof.name}: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    }
  }
}

await writeFile(`${out}/mobile-native-screens-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Mobile native screen proof passed (${report.cases.length} cases).`);
