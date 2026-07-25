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

const report = {
  url,
  checkedAt: new Date().toISOString(),
  viewports: [],
  interactions: {},
  consoleErrors: [],
  failures: [],
};

async function brokenImages(page) {
  return page.locator('img:visible').evaluateAll((images) => images
    .filter((image) => !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0)
    .map((image) => ({ alt: image.alt || '(no alt)', src: image.currentSrc || image.src })));
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    if (!response || !response.ok()) throw new Error(`${viewport.name}: site returned ${response?.status()}`);
    await page.locator('.readverse').waitFor({ state: 'visible', timeout: 30000 });
    await page.screenshot({ path: `${outDir}/${viewport.name}-home.png`, fullPage: true });

    const checks = {
      title: await page.title(),
      brandVisible: await page.getByText('READVERSE', { exact: true }).first().isVisible().catch(() => false),
      dashboardVisible: await page.getByText(/Good (morning|afternoon|evening)/).first().isVisible().catch(() => false),
      horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),
      bodyWidth: await page.evaluate(() => document.body.getBoundingClientRect().width),
      viewportWidth: viewport.width,
      brokenImages: await brokenImages(page),
      consoleErrors: errors,
    };

    report.consoleErrors.push(...errors.map(error => `${viewport.name}: ${error}`));
    report.viewports.push({ ...viewport, checks });
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const interactionErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') interactionErrors.push(msg.text()); });
  page.on('pageerror', err => interactionErrors.push(err.message));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('.readverse').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: /Settings/ }).first().click();
  await page.locator('.settings-page').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${outDir}/desktop-settings.png`, fullPage: true });
  report.interactions.settingsOpened = await page.getByText('Choose your companion').isVisible().catch(() => false);

  const itachi = page.getByRole('button', { name: /Itachi/ }).first();
  await itachi.click();
  report.interactions.companionChanged = await page.getByText('Ring colour for Itachi').isVisible().catch(() => false);
  report.interactions.settingsBrokenImages = await brokenImages(page);
  await page.screenshot({ path: `${outDir}/desktop-settings-itachi.png`, fullPage: true });

  await page.locator('.settings-page > header button').click();
  await page.getByText(/Good (morning|afternoon|evening)/).first().waitFor({ state: 'visible' });

  await page.getByRole('button', { name: /^Companion$/ }).click();
  await page.locator('.chat-panel.open').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${outDir}/desktop-companion.png`, fullPage: true });
  report.interactions.chatOpened = true;
  report.interactions.chatShowsSelectedCompanion = await page.locator('.chat-panel header').getByText('Itachi').isVisible().catch(() => false);

  const input = page.locator('.chat-panel form input');
  const beforeMessages = await page.locator('.chat-panel .message').count();
  await input.fill('Give me one short reading tip.');
  await page.locator('.chat-panel form .send').click();
  await page.waitForFunction(
    (count) => document.querySelectorAll('.chat-panel .message').length > count,
    beforeMessages,
    { timeout: 20000 },
  ).catch(() => {});
  await page.waitForTimeout(1000);
  report.interactions.chatResponded = (await page.locator('.chat-panel .message').count()) > beforeMessages;
  await page.screenshot({ path: `${outDir}/desktop-chat-response.png`, fullPage: true });

  await page.locator('.chat-panel > header button').click();
  await page.locator('.chat-panel.open').waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: /Continue Reading/ }).first().click();
  await page.getByText(/Chapter 15/i).first().waitFor({ state: 'visible', timeout: 10000 });
  report.interactions.readerOpened = true;
  await page.screenshot({ path: `${outDir}/desktop-reader.png`, fullPage: true });

  const noteButton = page.getByRole('button', { name: /note/i }).first();
  if (await noteButton.isVisible().catch(() => false)) {
    await noteButton.click();
    report.interactions.notepadOpened = await page.locator('textarea').isVisible().catch(() => false);
    await page.screenshot({ path: `${outDir}/desktop-reader-note.png`, fullPage: true });
  } else {
    report.interactions.notepadOpened = false;
  }

  report.interactions.brokenImages = await brokenImages(page);
  report.consoleErrors.push(...interactionErrors.map(error => `interaction: ${error}`));
  await page.close();
} catch (error) {
  report.failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}

for (const item of report.viewports) {
  if (!item.checks.brandVisible) report.failures.push(`${item.name}: brand not visible`);
  if (!item.checks.dashboardVisible) report.failures.push(`${item.name}: dashboard greeting not visible`);
  if (item.checks.horizontalOverflow) report.failures.push(`${item.name}: horizontal overflow`);
  if (item.checks.consoleErrors.length) report.failures.push(`${item.name}: console errors`);
  if (item.checks.brokenImages.length) report.failures.push(`${item.name}: broken images: ${item.checks.brokenImages.map(item => item.alt).join(', ')}`);
}
if (!report.interactions.settingsOpened) report.failures.push('settings did not open');
if (!report.interactions.companionChanged) report.failures.push('companion did not change to Itachi');
if (!report.interactions.chatOpened) report.failures.push('companion chat did not open');
if (!report.interactions.chatShowsSelectedCompanion) report.failures.push('chat did not use the selected companion');
if (!report.interactions.chatResponded) report.failures.push('companion chat did not respond');
if (!report.interactions.readerOpened) report.failures.push('reader did not open');
if (!report.interactions.notepadOpened) report.failures.push('reader notepad did not open');
if (report.interactions.settingsBrokenImages?.length) report.failures.push(`settings: broken images: ${report.interactions.settingsBrokenImages.map(item => item.alt).join(', ')}`);
if (report.interactions.brokenImages?.length) report.failures.push(`reader: broken images: ${report.interactions.brokenImages.map(item => item.alt).join(', ')}`);

await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));

if (report.failures.length) {
  console.error('Visual verification failed:\n' + report.failures.join('\n'));
  process.exit(1);
}
console.log('Visual verification passed. Evidence saved to visual-evidence/.');