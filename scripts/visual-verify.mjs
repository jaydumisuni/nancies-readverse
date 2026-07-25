import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const url = process.env.READVERSE_URL || 'https://nancies-readverse.pharrtechnolgiescoltd.workers.dev/';
const outDir = 'visual-evidence';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];

const report = { url, checkedAt: new Date().toISOString(), viewports: [], interactions: {}, consoleErrors: [] };

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  if (!response || !response.ok()) throw new Error(`${viewport.name}: site returned ${response?.status()}`);
  await page.screenshot({ path: `${outDir}/${viewport.name}-home.png`, fullPage: true });

  const checks = {
    title: await page.title(),
    brandVisible: await page.getByText('READVERSE', { exact: true }).first().isVisible().catch(() => false),
    dashboardVisible: await page.getByText(/Good (morning|afternoon|evening)/).isVisible().catch(() => false),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),
    bodyWidth: await page.evaluate(() => document.body.getBoundingClientRect().width),
    viewportWidth: viewport.width,
    consoleErrors: errors,
  };

  report.consoleErrors.push(...errors.map(error => `${viewport.name}: ${error}`));
  report.viewports.push({ ...viewport, checks });
  await page.close();
}

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

await page.getByRole('button', { name: /Settings/ }).click();
await page.screenshot({ path: `${outDir}/desktop-settings.png`, fullPage: true });
report.interactions.settingsOpened = await page.getByText('Choose your companion').isVisible().catch(() => false);

const itachi = page.getByRole('button', { name: /Itachi/ }).first();
if (await itachi.count()) await itachi.click();
report.interactions.companionChanged = await page.getByText('Itachi').first().isVisible().catch(() => false);

await page.getByRole('button', { name: /Home/ }).click().catch(() => {});
await page.getByRole('button', { name: /Companion/ }).click();
await page.screenshot({ path: `${outDir}/desktop-companion.png`, fullPage: true });
report.interactions.chatOpened = await page.getByRole('button', { name: /Close/ }).isVisible().catch(() => false);

const input = page.locator('textarea, input[type="text"]').last();
if (await input.count()) {
  await input.fill('Give me one short reading tip.');
  await input.press('Enter').catch(() => {});
  await page.waitForTimeout(5000);
}
report.interactions.chatResponded = (await page.locator('.message, [class*="message"]').count()) > 1;
await page.screenshot({ path: `${outDir}/desktop-chat-response.png`, fullPage: true });

await page.getByRole('button', { name: /Close/ }).click().catch(() => {});
await page.getByRole('button', { name: /Continue Reading/ }).click();
await page.screenshot({ path: `${outDir}/desktop-reader.png`, fullPage: true });
report.interactions.readerOpened = await page.getByText(/Chapter 15/i).isVisible().catch(() => false);

await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
await browser.close();

const failures = [];
for (const item of report.viewports) {
  if (!item.checks.brandVisible) failures.push(`${item.name}: brand not visible`);
  if (!item.checks.dashboardVisible) failures.push(`${item.name}: dashboard greeting not visible`);
  if (item.checks.horizontalOverflow) failures.push(`${item.name}: horizontal overflow`);
  if (item.checks.consoleErrors.length) failures.push(`${item.name}: console errors`);
}
if (!report.interactions.settingsOpened) failures.push('settings did not open');
if (!report.interactions.chatOpened) failures.push('companion chat did not open');
if (!report.interactions.readerOpened) failures.push('reader did not open');

if (failures.length) {
  console.error('Visual verification failed:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Visual verification passed. Evidence saved to visual-evidence/.');
