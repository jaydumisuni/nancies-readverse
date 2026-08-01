import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const output = "engineering-evidence/notverse-live";
await mkdir(output, { recursive: true });

const targets = [
  { name: "custom", url: "https://notverse.1ink.online/" },
  { name: "worker", url: "https://notverse.pharrtechnolgiescoltd.workers.dev/" },
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
const report = { checkedAt: new Date().toISOString(), targets: [] };

try {
  for (const target of targets) {
    const targetReport = { ...target, views: [] };
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      const view = { ...viewport, errors };
      try {
        const response = await page.goto(`${target.url}?capture=${Date.now()}`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await page.waitForTimeout(5000);
        const bodyText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
        const metrics = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          readyState: document.readyState,
          scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
          styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
        }));
        const screenshot = `${target.name}-${viewport.name}.png`;
        await page.screenshot({ path: `${output}/${screenshot}`, fullPage: true });
        Object.assign(view, {
          reachable: true,
          status: response?.status() ?? null,
          finalUrl: page.url(),
          title: await page.title(),
          bodyText: bodyText.slice(0, 5000),
          hasNoTVerse: bodyText.includes("NoTVerse"),
          hasOldName: bodyText.includes("Nancy's ReadVerse"),
          setupVisible: await page.locator(".notverse-setup").isVisible().catch(() => false),
          homeVisible: await page.locator(".notverse-home").isVisible().catch(() => false),
          screenshot,
          metrics,
        });
      } catch (error) {
        Object.assign(view, {
          reachable: false,
          error: error instanceof Error ? error.stack : String(error),
          finalUrl: page.url(),
        });
      }
      targetReport.views.push(view);
      await context.close();
    }
    report.targets.push(targetReport);
  }
} finally {
  await browser.close();
}

await writeFile(`${output}/capture-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
