import { webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/iphone-visual-lab";
await mkdir(out, { recursive: true });

const devices = [
  { id: "iphone-13-mini", name: "iPhone 13 mini", width: 375, height: 812 },
  { id: "iphone-13-14", name: "iPhone 13 / 14", width: 390, height: 844 },
  { id: "iphone-13-pro-max-14-plus", name: "iPhone 13 Pro Max / 14 Plus", width: 428, height: 926 },
  { id: "iphone-14-pro-15-15-pro", name: "iPhone 14 Pro / 15 / 15 Pro", width: 393, height: 852 },
  { id: "iphone-15-pro-max", name: "iPhone 15 Pro Max", width: 430, height: 932 },
  { id: "iphone-16-pro", name: "iPhone 16 Pro", width: 402, height: 874 },
  { id: "iphone-16-pro-max", name: "iPhone 16 Pro Max", width: 440, height: 956 },
];

const report = { schema: "ttg.iphone-visual-lab-proof.v1", target: url, createdAt: new Date().toISOString(), engine: "webkit", cases: [], errors: [] };

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

async function waitForViewportHeight(page, expected) {
  await page.waitForFunction((height) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--notverse-mobile-vv-height").trim();
    const published = Number.parseFloat(value);
    return Number.isFinite(published) && Math.abs(published - height) <= 3;
  }, expected, { timeout: 3000 });
  await settle(page);
}

async function rect(locator) {
  return locator.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
  });
}

async function shot(page, scene, device, file) {
  const dir = `${out}/${scene}/${device.id}`;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
}

async function captureDevice(browser, device) {
  const keyboardHeight = Math.max(480, device.height - 324);
  const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  try {
    await prepare(page);
    await page.getByRole("button", { name: "Notes", exact: true }).last().click();
    await page.locator(".notes-social-experience").waitFor();
    await settle(page);

    const paper = page.locator(".notes-social-experience .note-paper").first();
    const paperColor = await paper.evaluate((n) => getComputedStyle(n).backgroundColor);
    assert.equal(paperColor, "rgb(255, 255, 255)", `${device.name}: Note paper ${paperColor}`);
    const activity = await rect(page.locator(".notes-social-experience .notes-activity-button"));
    assert(activity.width >= 42 && activity.width <= 46, `${device.name}: Activity width ${activity.width}`);
    assert(activity.height >= 42 && activity.height <= 46, `${device.name}: Activity height ${activity.height}`);
    await shot(page, "notes", device, "webkit-notes.png");

    await page.getByRole("button", { name: "Comment on Note", exact: true }).click();
    await page.locator(".replies-backdrop").waitFor();
    const input = page.getByRole("textbox", { name: "Write a comment" });
    await input.fill(`iPhone lab ${device.id}`);
    await input.focus();
    await page.setViewportSize({ width: device.width, height: keyboardHeight });
    await waitForViewportHeight(page, keyboardHeight);
    const form = await rect(page.locator(".replies-drawer > form"));
    assert(form.bottom >= keyboardHeight - 5 && form.bottom <= keyboardHeight + 2, `${device.name}: Comments composer bottom ${form.bottom}/${keyboardHeight}`);
    const hit = await page.evaluate(({ x, y }) => {
      const node = document.elementFromPoint(x, y);
      return node?.closest?.(".mobile-nav.notverse-mobile-nav") ? "nav" : "surface";
    }, { x: Math.round(device.width / 2), y: Math.max(1, keyboardHeight - 24) });
    assert.equal(hit, "surface", `${device.name}: nav paints above Comments surface`);
    const before = await page.locator(".replies-list article").count();
    await page.getByRole("button", { name: "Send", exact: true }).tap();
    await page.waitForFunction((count) => document.querySelectorAll(".replies-list article").length > count, before);
    await shot(page, "comments-keyboard", device, "webkit-comments-keyboard.png");

    await input.evaluate((n) => n.blur());
    await page.setViewportSize({ width: device.width, height: device.height });
    await waitForViewportHeight(page, device.height);
    await page.getByRole("button", { name: "Back to Notes" }).click();
    await page.waitForFunction(() => !document.body.classList.contains("notverse-comments-open"));
    await settle(page);
    const nav = page.locator(".mobile-nav.notverse-mobile-nav");
    const navStyle = await nav.evaluate((node) => {
      const s = getComputedStyle(node); const r = node.getBoundingClientRect();
      return { display: s.display, visibility: s.visibility, opacity: Number(s.opacity), pointerEvents: s.pointerEvents, width: r.width, height: r.height };
    });
    assert.equal(navStyle.display, "grid", `${device.name}: restored nav display ${navStyle.display}`);
    assert.equal(navStyle.visibility, "visible", `${device.name}: restored nav visibility ${navStyle.visibility}`);
    assert(navStyle.opacity >= .99, `${device.name}: restored nav opacity ${navStyle.opacity}`);
    assert.equal(navStyle.pointerEvents, "auto", `${device.name}: restored nav pointer events ${navStyle.pointerEvents}`);
    await shot(page, "comments-return-nav", device, "webkit-comments-return-nav.png");

    await prepare(page);
    await page.locator(".floating-companion").click();
    await page.locator(".companion-panel.open").waitFor();
    const chatInput = page.locator(".companion-panel.open .chat-input input");
    await chatInput.fill("iPhone lab keyboard proof");
    await chatInput.focus();
    await page.setViewportSize({ width: device.width, height: keyboardHeight });
    await waitForViewportHeight(page, keyboardHeight);
    const chat = await rect(page.locator(".companion-panel.open"));
    assert(Math.abs(chat.width - device.width) <= 2, `${device.name}: Chat width ${chat.width}`);
    assert(Math.abs(chat.height - keyboardHeight) <= 3, `${device.name}: Chat height ${chat.height}/${keyboardHeight}`);
    const composer = await rect(page.locator(".companion-panel.open .chat-input"));
    assert(composer.bottom >= keyboardHeight - 5 && composer.bottom <= keyboardHeight + 2, `${device.name}: Chat composer bottom ${composer.bottom}/${keyboardHeight}`);
    await shot(page, "chat-keyboard", device, "webkit-chat-keyboard.png");

    report.cases.push({ ...device, keyboardHeight, paperColor, activity, commentsForm: form, restoredNav: navStyle, chat, composer, consoleErrors });
  } finally {
    await context.close();
  }
}

const browser = await webkit.launch({ headless: true });
try {
  for (const device of devices) {
    try { await captureDevice(browser, device); }
    catch (error) { report.errors.push({ device: device.id, error: error instanceof Error ? error.stack || error.message : String(error) }); }
  }
} finally {
  await browser.close();
}

report.ok = report.errors.length === 0 && report.cases.length === devices.length;
await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report.errors, null, 2));
  process.exit(1);
}
console.log(`iPhone Visual Lab matrix passed: ${report.cases.length} devices / 4 scenes each.`);
