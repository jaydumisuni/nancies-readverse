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
    const title = await page.title();
    const identityMarks = await page.locator('[aria-label="NoTVerse"]').count();
    const applicationName = await page.locator('meta[name="application-name"]').getAttribute("content");
    const setupVisible = await page.locator(".notverse-setup").isVisible().catch(() => false);
    const homeVisible = await page.locator(".notverse-home").isVisible().catch(() => false);
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    // The visual wordmark is CSS-rendered from an accessible image mark, so it is
    // intentionally absent from body.innerText. Prove identity through the document
    // title, application metadata and the actual rendered NoTVerse-labelled mark.
    assert(title === "NoTVerse", `${viewport.name}: NoTVerse document title is missing`);
    assert(applicationName === "NoTVerse", `${viewport.name}: NoTVerse application metadata is missing`);
    assert(identityMarks > 0, `${viewport.name}: NoTVerse brand mark is missing`);
    assert(text.includes("Created for Nancy. Shared with the world."), `${viewport.name}: exact origin line is missing`);
    assert(!text.includes("Nancy's ReadVerse"), `${viewport.name}: old visible product name remains`);
    assert(setupVisible || homeVisible, `${viewport.name}: neither setup nor Home is visible`);
    assert(metrics.scrollWidth <= metrics.clientWidth + 2, `${viewport.name}: horizontal overflow`);
    assert(errors.length === 0, `${viewport.name}: browser errors: ${errors.join(" | ")}`);

    const screenshot = `${viewport.name}.png`;
    await page.screenshot({ path: `${output}/${screenshot}`, fullPage: true });
    report.viewports.push({
      ...viewport,
      status: response.status(),
      title,
      applicationName,
      identityMarks,
      finalUrl: page.url(),
      setupVisible,
      homeVisible,
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
