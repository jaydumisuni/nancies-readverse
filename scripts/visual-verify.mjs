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
    .map((image) => ({ alt: image.alt || '(no alt)', src: (image.currentSrc || image.src).slice(0, 180) })));
}

async function closeVisibleOverlay(page) {
  const named = page.getByRole('button', { name: /close/i }).filter({ visible: true }).first();
  if (await named.isVisible().catch(() => false)) {
    await named.click();
    return true;
  }
  const textClose = page.locator('button:visible').filter({ hasText: /^[×✕]$/ }).first();
  if (await textClose.isVisible().catch(() => false)) {
    await textClose.click();
    return true;
  }
  return false;
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    if (!response || !response.ok()) throw new Error(`${viewport.name}: site returned ${response?.status()}`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/${viewport.name}-home.png`, fullPage: true });

    const bodyText = await page.locator('body').innerText().catch(() => '');
    const checks = {
      status: response.status(),
      title: await page.title(),
      bodyPreview: bodyText.slice(0, 500),
      brandVisible: /readverse/i.test(bodyText),
      dashboardVisible: /good (morning|afternoon|evening)/i.test(bodyText),
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
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  if (!response || !response.ok()) throw new Error(`interaction page returned ${response?.status()}`);
  await page.waitForTimeout(1000);

  const settingsButton = page.getByRole('button', { name: /Settings/ }).first();
  await settingsButton.click({ timeout: 10000 });
  await page.getByText(/Choose your companion/i).waitFor({ state: 'visible', timeout: 10000 });
  report.interactions.settingsOpened = true;
  await page.screenshot({ path: `${outDir}/desktop-settings.png`, fullPage: true });

  const itachi = page.getByRole('button', { name: /Itachi/ }).first();
  await itachi.click({ timeout: 10000 });
  report.interactions.companionChanged = await page.getByText(/Ring colou?r for Itachi/i).isVisible().catch(() => false)
    || await page.getByText(/Selected companion/i).isVisible().catch(() => false);
  report.interactions.settingsBrokenImages = await brokenImages(page);
  await page.screenshot({ path: `${outDir}/desktop-settings-itachi.png`, fullPage: true });

  report.interactions.settingsClosed = await closeVisibleOverlay(page);
  await page.waitForTimeout(500);

  const companionButton = page.getByRole('button', { name: /^Companion$/ }).first();
  await companionButton.click({ timeout: 10000 });
  const chatInput = page.locator('input[placeholder*="Ask"], textarea[placeholder*="Ask"]').last();
  await chatInput.waitFor({ state: 'visible', timeout: 10000 });
  report.interactions.chatOpened = true;
  report.interactions.chatShowsSelectedCompanion = await page.getByText('Itachi', { exact: true }).first().isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/desktop-companion.png`, fullPage: true });

  const beforeMessages = await page.locator('[class*="message"]').count();
  await chatInput.fill('Give me one short reading tip.');
  const sendButton = page.locator('form button[type="submit"], form .send').last();
  if (await sendButton.isVisible().catch(() => false)) await sendButton.click();
  else await chatInput.press('Enter');
  await page.waitForTimeout(6000);
  report.interactions.chatResponded = (await page.locator('[class*="message"]').count()) > beforeMessages;
  await page.screenshot({ path: `${outDir}/desktop-chat-response.png`, fullPage: true });

  report.interactions.chatClosed = await closeVisibleOverlay(page);
  await page.waitForTimeout(500);

  const continueButton = page.getByRole('button', { name: /Continue Reading/ }).first();
  await continueButton.click({ timeout: 10000 });
  await page.waitForTimeout(800);
  const readerText = await page.locator('body').innerText();
  report.interactions.readerOpened = /Chapter\s*15|Page\s*18|fullscreen|highlight/i.test(readerText);
  await page.screenshot({ path: `${outDir}/desktop-reader.png`, fullPage: true });

  const noteButton = page.getByRole('button', { name: /note/i }).first();
  if (await noteButton.isVisible().catch(() => false)) {
    await noteButton.click();
    await page.waitForTimeout(300);
    report.interactions.notepadOpened = await page.locator('textarea:visible').isVisible().catch(() => false);
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
if (!report.interactions.settingsClosed) report.failures.push('settings did not close');
if (!report.interactions.chatOpened) report.failures.push('companion chat did not open');
if (!report.interactions.chatShowsSelectedCompanion) report.failures.push('chat did not use the selected companion');
if (!report.interactions.chatResponded) report.failures.push('companion chat did not respond');
if (!report.interactions.chatClosed) report.failures.push('companion chat did not close');
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