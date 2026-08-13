import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.NOTVERSE_URL || "https://notverse.pharrtechnolgiescoltd.workers.dev/";
const output = "engineering-evidence/notverse-live";
await mkdir(output, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const report = {
  ok: false,
  url,
  commit: process.env.GITHUB_SHA || null,
  checkedAt: new Date().toISOString(),
  viewports: [],
  errors: [],
};

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto(`${url}?proof=${Date.now()}`, { waitUntil: "networkidle", timeout: 90000 });
    assert(response && response.status() < 400, `${viewport.name}: HTTP ${response?.status() ?? "no response"}`);
    await page.locator("body").waitFor({ state: "visible", timeout: 30000 });

    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
    const setupVisible = await page.locator(".notverse-setup").isVisible().catch(() => false);
    const homeVisible = await page.locator(".notverse-home").isVisible().catch(() => false);
    const brandAccessible = await page.locator('[aria-label="NoTVerse"], [aria-label="NoTVerse Home"]').first().isVisible().catch(() => false);
    const title = await page.title();
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    /* Preserve the rendered frame before assertions so a failed live gate always
       leaves visual evidence instead of only a textual error. */
    const screenshot = `${viewport.name}.png`;
    await page.screenshot({ path: `${output}/${screenshot}`, fullPage: true });

    /* The approved brand deliberately removed a second visible NoTVerse wordmark:
       the canonical artwork owns the visual name while the DOM exposes NoTVerse
       through accessibility and page identity. Do not reintroduce duplicate text
       merely to satisfy a verifier. */
    assert(brandAccessible || title.includes("NoTVerse"), `${viewport.name}: accessible NoTVerse identity is missing`);
    assert(text.includes("Created for Nancy. Shared with the world."), `${viewport.name}: exact origin line is missing`);
    assert(!text.includes("Nancy's ReadVerse"), `${viewport.name}: old visible product name remains`);
    assert(setupVisible || homeVisible, `${viewport.name}: neither setup nor Home is visible`);
    assert(metrics.scrollWidth <= metrics.clientWidth + 2, `${viewport.name}: horizontal overflow`);
    assert(errors.length === 0, `${viewport.name}: browser errors: ${errors.join(" | ")}`);

    report.viewports.push({
      ...viewport,
      status: response.status(),
      title,
      finalUrl: page.url(),
      setupVisible,
      homeVisible,
      brandAccessible,
      screenshot,
    });
    await context.close();
  }

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
