import { chromium } from "playwright";
import fs from "node:fs";

const baseUrl = process.env.READVERSE_TEST_URL || "http://127.0.0.1:4173";
const evidence = "engineering-evidence/guided-discovery";
fs.mkdirSync(evidence, { recursive: true });
const results = { passed: [], failed: [], consoleErrors: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("console", message => { if (message.type() === "error") results.consoleErrors.push(message.text()); });
page.on("pageerror", error => results.consoleErrors.push(error.message));

async function check(name, task) {
  try {
    await task();
    results.passed.push(name);
  } catch (error) {
    results.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    await page.screenshot({ path: `${evidence}/failure-${results.failed.length}.png`, fullPage: true }).catch(() => {});
  }
}

await page.goto(baseUrl, { waitUntil: "networkidle" });
await check("dashboard geometry unchanged", async () => {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (geometry.scrollWidth > geometry.width + 1) throw new Error(`horizontal overflow ${geometry.scrollWidth} > ${geometry.width}`);
  await page.screenshot({ path: `${evidence}/dashboard.png`, fullPage: true });
});

await check("open companion chat", async () => {
  await page.getByRole("button", { name: /chat now/i }).first().click();
  await page.locator(".companion-panel.open").waitFor();
});

const chatInput = page.locator(".chat-input input");
await check("normal greeting remains conversational", async () => {
  await chatInput.fill("hi");
  await chatInput.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll(".message-bubble p")].some(el => /hey|here|welcome/i.test(el.textContent || "")), null, { timeout: 20000 });
});

await check("direct source is verified before opening", async () => {
  await chatInput.fill("https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf");
  await chatInput.press("Enter");
  await page.locator(".source-result-card.status-found").waitFor({ timeout: 30000 });
  const text = await page.locator(".source-result-card.status-found").innerText();
  if (!/PDF/i.test(text) || !/Temporary/i.test(text)) throw new Error(`missing verified source details: ${text}`);
  await page.screenshot({ path: `${evidence}/source-found.png`, fullPage: true });
});

await check("source preparation shows real stages and waits for open", async () => {
  await page.getByRole("button", { name: "Prepare to read" }).last().click();
  await page.locator(".source-result-card.status-ready").waitFor({ timeout: 30000 });
  const text = await page.locator(".source-result-card.status-ready").innerText();
  for (const expected of ["Verified public source", "Checking the readable file", "Reading document details", "Preparing the temporary reader"]) {
    if (!text.includes(expected)) throw new Error(`missing stage ${expected}`);
  }
  if (await page.locator(".pdf-reader").count()) throw new Error("reader opened before user confirmation");
  await page.screenshot({ path: `${evidence}/source-ready.png`, fullPage: true });
});

await check("prepared source opens physical reader", async () => {
  await page.getByRole("button", { name: "Open and read" }).last().click();
  await page.locator(".pdf-reader").waitFor({ timeout: 30000 });
  await page.locator(".physical-book").waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${evidence}/reader-open.png`, fullPage: true });
});

await check("add to library works inside reader", async () => {
  const button = page.getByRole("button", { name: /Add to Library/i }).first();
  await button.click();
  await page.getByRole("button", { name: /In Library/i }).first().waitFor();
  await page.screenshot({ path: `${evidence}/reader-in-library.png`, fullPage: true });
});

await page.getByRole("button", { name: "Close reader" }).click();
await check("memory description returns candidate choices", async () => {
  await chatInput.fill("I am trying to remember a book about a rich father and a poor father and money");
  await chatInput.press("Enter");
  await page.locator(".discovery-results-card").waitFor({ timeout: 30000 });
  const count = await page.locator(".discovery-result").count();
  if (count < 1) throw new Error("no discovery candidates");
  await page.screenshot({ path: `${evidence}/memory-results.png`, fullPage: true });
});

await check("wrong result asks for a distinguishing clue", async () => {
  await page.getByRole("button", { name: "Not this one" }).first().click();
  await page.waitForFunction(() => [...document.querySelectorAll(".message-bubble p")].some(el => /one detail|separates it|cover colour|author|setting/i.test(el.textContent || "")), null, { timeout: 15000 });
});

await check("failed source explains why and offers next action", async () => {
  await chatInput.fill("https://example.com/no-readable-book-here");
  await chatInput.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll(".message-bubble p")].some(el => /could not prepare|could not verify|no supported|another link|upload your copy/i.test(el.textContent || "")), null, { timeout: 30000 });
  await page.screenshot({ path: `${evidence}/source-failure-explained.png`, fullPage: true });
});

results.consoleErrors = [...new Set(results.consoleErrors)];
fs.writeFileSync(`${evidence}/report.json`, JSON.stringify(results, null, 2));
await browser.close();
if (results.failed.length || results.consoleErrors.length) process.exit(1);
