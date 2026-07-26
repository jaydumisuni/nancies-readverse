import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.READVERSE_TEST_URL || "http://127.0.0.1:8787";
const evidenceDir = "companion-intelligence-evidence";
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

const sourceRequests = [];
page.on("request", (request) => {
  if (request.url().includes("/api/source/resolve")) sourceRequests.push(request.postData() || "");
});

await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
const input = page.locator(".chat-input input");
await input.waitFor({ state: "visible", timeout: 30000 });

await input.fill("hi");
await input.press("Enter");
await page.getByText(/Hey\. I am here\./).last().waitFor({ state: "visible", timeout: 20000 });

await input.fill("how are you");
await input.press("Enter");
await page.getByText(/I am good\./).last().waitFor({ state: "visible", timeout: 20000 });

await page.screenshot({ path: `${evidenceDir}/normal-conversation.png`, fullPage: true });

await input.fill("https://richandpoordads.org/");
await input.press("Enter");
await page.locator(".pdf-reader").waitFor({ state: "visible", timeout: 90000 });
await page.locator(".pdf-page-shell canvas").first().waitFor({ state: "visible", timeout: 90000 });
assert.equal(sourceRequests.length, 1, "A pasted URL must route directly to source testing exactly once");
assert.match(sourceRequests[0], /richandpoordads\.org/);
await page.screenshot({ path: `${evidenceDir}/source-opened-in-reader.png`, fullPage: true });

await page.getByRole("button", { name: "Close reader" }).click();
await page.locator(".pdf-reader").waitFor({ state: "detached", timeout: 20000 });
await input.fill("Ok lemme have it");
await input.press("Enter");
await page.locator(".pdf-reader").waitFor({ state: "visible", timeout: 90000 });
await page.locator(".pdf-page-shell canvas").first().waitFor({ state: "visible", timeout: 90000 });
assert.equal(sourceRequests.length, 2, "The natural follow-up must reuse the last source URL");
await page.screenshot({ path: `${evidenceDir}/follow-up-reopened-source.png`, fullPage: true });

assert.equal(consoleErrors.length, 0, `Browser errors: ${consoleErrors.join(" | ")}`);
const report = {
  status: "passed",
  checks: [
    "simple greeting received a natural response",
    "ordinary how-are-you conversation stayed conversational",
    "pasted URL bypassed generic chat and invoked the source resolver",
    "real richandpoordads.org page resolved to a rendered PDF",
    "Ok lemme have it reused the previous source URL",
    "no browser console or page errors",
  ],
  sourceResolveCalls: sourceRequests.length,
  consoleErrors,
};
await writeFile(`${evidenceDir}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
