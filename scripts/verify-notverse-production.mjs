import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const targets = [
  { id: "custom", url: "https://nancyreadverse.link.online" },
  { id: "worker", url: "https://nancies-readverse.pharrtechnolgiescoltd.workers.dev" },
];
const output = "engineering-evidence/notverse-production";
await mkdir(output, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyTarget(browser, target) {
  const result = { id: target.id, url: target.url, desktop: {}, mobile: {}, errors: [] };
  for (const mode of [
    { name: "desktop", viewport: { width: 1440, height: 1000 } },
    { name: "mobile", viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: mode.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") result.errors.push(`${mode.name} console: ${message.text()}`); });
    page.on("pageerror", (error) => result.errors.push(`${mode.name} page: ${error.message}`));
    const response = await page.goto(target.url, { waitUntil: "networkidle", timeout: 90000 });
    assert(response, `${target.id} ${mode.name} returned no HTTP response`);
    assert(response.status() < 400, `${target.id} ${mode.name} returned HTTP ${response.status()}`);
    await page.locator("body").waitFor({ state: "visible", timeout: 30000 });
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
    assert(text.includes("NoTVerse"), `${target.id} ${mode.name} does not expose NoTVerse`);
    assert(text.includes("Created for Nancy. Shared with the world."), `${target.id} ${mode.name} is missing the exact origin line`);
    assert(!text.includes("Nancy's ReadVerse"), `${target.id} ${mode.name} still visibly exposes Nancy's ReadVerse`);
    assert(!text.includes("Luna") && !text.includes("Milo") && !text.includes("Zara"), `${target.id} ${mode.name} leaked placeholder companions`);
    const setupVisible = await page.locator(".notverse-setup").isVisible().catch(() => false);
    const homeVisible = await page.locator(".notverse-home").isVisible().catch(() => false);
    assert(setupVisible || homeVisible, `${target.id} ${mode.name} shows neither NoTVerse setup nor Home`);
    const metrics = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    assert(metrics.scroll <= metrics.inner + 2, `${target.id} ${mode.name} has horizontal overflow: ${metrics.scroll} > ${metrics.inner}`);
    const screenshot = `${target.id}-${mode.name}.png`;
    await page.screenshot({ path: `${output}/${screenshot}`, fullPage: false });
    result[mode.name] = {
      status: response.status(),
      finalUrl: page.url(),
      title: await page.title(),
      setupVisible,
      homeVisible,
      screenshot,
    };
    await context.close();
  }
  assert(result.errors.length === 0, `${target.id} browser errors: ${result.errors.join(" | ")}`);
  return result;
}

const browser = await chromium.launch({ headless: true });
const report = { ok: false, verifiedCommit: "d2ca117f4d1da702226d2d92b6eb21b1923de9a9", checkedAt: new Date().toISOString(), targets: [] };
try {
  for (const target of targets) report.targets.push(await verifyTarget(browser, target));
  report.ok = true;
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
