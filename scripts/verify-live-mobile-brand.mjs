import { chromium } from "playwright";
import fs from "node:fs/promises";

const url = process.env.READVERSE_URL || "https://nancyreadverse.1ink.online/";
const outDir = "mobile-deployment-evidence";
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
let lastFailure = "Deployment did not become ready";
let passed = false;

try {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
      await page.waitForTimeout(1000);

      const brand = page.locator('.mobile-brand[aria-label="Nancy\'s ReadVerse"]');
      await brand.waitFor({ state: "visible", timeout: 10000 });
      const nancys = brand.locator("span");
      const readverse = brand.locator("strong");
      if ((await nancys.innerText()).trim() !== "Nancy's") throw new Error("Nancy's is missing from the mobile header");
      if ((await readverse.innerText()).trim() !== "READVERSE") throw new Error("READVERSE is missing under Nancy's");

      const nancySize = Number.parseFloat(await nancys.evaluate((el) => getComputedStyle(el).fontSize));
      const readverseSize = Number.parseFloat(await readverse.evaluate((el) => getComputedStyle(el).fontSize));
      if (!(readverseSize < nancySize * 0.55)) throw new Error("READVERSE is not substantially smaller than Nancy's");

      await page.getByRole("button", { name: /Settings/i }).first().click();
      await page.getByText(/Choose your companion/i).waitFor({ state: "visible", timeout: 10000 });
      const meiCard = page.getByRole("button", { name: /Mei Mei/i }).last();
      await meiCard.scrollIntoViewIfNeeded();
      const meiImage = meiCard.locator("img");
      const mei = await meiImage.evaluate((img) => ({
        src: img.currentSrc || img.src,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }));
      if (!mei.src.includes("/avatars/meimei.")) throw new Error(`Mei Mei is still using the old asset: ${mei.src}`);
      if (mei.width < 256 || mei.height < 256) throw new Error(`Mei Mei portrait is too small or broken: ${mei.width}x${mei.height}`);

      await page.screenshot({ path: `${outDir}/mobile-live-settings.png`, fullPage: true });
      await fs.writeFile(`${outDir}/report.json`, JSON.stringify({
        url,
        checkedAt: new Date().toISOString(),
        attempt,
        brand: { nancys: "Nancy's", readverse: "READVERSE", nancySize, readverseSize },
        meiMei: mei,
        passed: true,
      }, null, 2));
      passed = true;
      await page.close();
      break;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      await page.screenshot({ path: `${outDir}/attempt-${attempt}.png`, fullPage: true }).catch(() => {});
      await page.close();
      if (attempt < 20) await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }
} finally {
  await browser.close();
}

if (!passed) {
  await fs.writeFile(`${outDir}/report.json`, JSON.stringify({
    url,
    checkedAt: new Date().toISOString(),
    passed: false,
    failure: lastFailure,
  }, null, 2));
  throw new Error(lastFailure);
}

console.log("Live mobile branding and Mei Mei deployment verified.");
