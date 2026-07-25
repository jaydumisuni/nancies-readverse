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

async function closeSettings(page) {
  const modal = page.locator('.modal-backdrop:visible');
  if (!await modal.isVisible().catch(() => false)) return false;
  const headerClose = modal.locator('header button').last();
  if (await headerClose.isVisible().catch(() => false)) await headerClose.click();
  else {
    const exactX = modal.locator('button').filter({ hasText: /^[×✕]$/ }).first();
    if (await exactX.isVisible().catch(() => false)) await exactX.click();
    else {
      const named = modal.getByRole('button', { name: /close settings/i }).first();
      if (!await named.isVisible().catch(() => false)) return false;
      await named.click();
    }
  }
  await modal.waitFor({ state: 'hidden', timeout: 10000 });
  return true;
}

async function closeChat(page) {
  const named = page.getByRole('button', { name: /close chat/i }).first();
  if (await named.isVisible().catch(() => false)) {
    await named.click();
    return true;
  }
  const panelClose = page.locator('[class*="chat"] button').filter({ hasText: /^[×✕]$/ }).first();
  if (await panelClose.isVisible().catch(() => false)) {
    await panelClose.click();
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

  await page.getByRole('button', { name: /Settings/ }).first().click({ timeout: 10000 });
  await page.getByText(/Choose your companion/i).waitFor({ state: 'visible', timeout: 10000 });
  report.interactions.settingsOpened = true;
  await page.screenshot({ path: `${outDir}/desktop-settings.png`, fullPage: true });

  await page.getByRole('button', { name: /Itachi/ }).first().click({ timeout: 10000 });
  report.interactions.companionChanged = await page.getByText(/Ring colou?r for Itachi/i).isVisible().catch(() => false)
    || await page.getByText(/Selected companion/i).isVisible().catch(() => false);
  report.interactions.settingsBrokenImages = await brokenImages(page);
  await page.screenshot({ path: `${outDir}/desktop-settings-itachi.png`, fullPage: true });

  const settingsModal = page.locator('.modal-backdrop:visible');
  await settingsModal.getByRole('button', { name: /Appearance/ }).click();
  await settingsModal.getByRole('button', { name: /Midnight Violet/ }).click();
  report.interactions.themeChanged = await settingsModal.getByRole('button', { name: /Midnight Violet/ }).getByText(/Active/i).isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/desktop-settings-appearance.png`, fullPage: true });

  report.interactions.settingsClosed = await closeSettings(page);
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: /Chat now/i }).first().click({ timeout: 10000 });
  const chatInput = page.locator('input[placeholder*="Ask"], textarea[placeholder*="Ask"]').last();
  await chatInput.waitFor({ state: 'visible', timeout: 10000 });
  report.interactions.chatOpened = true;
  report.interactions.chatShowsSelectedCompanion = await page.getByText('Itachi', { exact: true }).first().isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/desktop-companion.png`, fullPage: true });

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles({
    name: 'nancy-reading-test.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await page.getByText('nancy-reading-test.pdf', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 });
  report.interactions.pdfUploadedThroughChat = true;
  await page.screenshot({ path: `${outDir}/desktop-chat-upload.png`, fullPage: true });

  const beforeMessages = await page.locator('[class*="message"]').count();
  await chatInput.fill('Give me one short reading tip.');
  const sendButton = page.locator('form button[type="submit"], form .send').last();
  if (await sendButton.isVisible().catch(() => false)) await sendButton.click();
  else await chatInput.press('Enter');
  await page.waitForTimeout(6000);
  report.interactions.chatResponded = (await page.locator('[class*="message"]').count()) > beforeMessages;
  await page.screenshot({ path: `${outDir}/desktop-chat-response.png`, fullPage: true });

  report.interactions.chatClosed = await closeChat(page);
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: /Continue Reading/ }).first().click({ timeout: 10000 });
  await page.locator('.reader-overlay').waitFor({ state: 'visible', timeout: 10000 });
  report.interactions.readerOpened = await page.getByText(/Chapter 15 · Page 186/i).isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/desktop-reader.png`, fullPage: true });

  await page.locator('.reader-overlay .page-edge.next').click();
  await page.waitForTimeout(650);
  report.interactions.pageTurned = await page.getByText(/Chapter 15 · Page 188/i).isVisible().catch(() => false)
    || await page.getByText('188 / 240', { exact: true }).isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/desktop-reader-next.png`, fullPage: true });

  const fullscreenButton = page.locator('.reader-overlay .reader-toolbar nav button').nth(3);
  await fullscreenButton.click();
  await page.waitForTimeout(500);
  report.interactions.fullscreenOpened = await page.evaluate(() => Boolean(document.fullscreenElement))
    || await page.locator('.reader-overlay.is-fullscreen').isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/desktop-reader-fullscreen.png` });
  if (await page.evaluate(() => Boolean(document.fullscreenElement))) await page.evaluate(() => document.exitFullscreen());
  else if (await page.locator('.reader-overlay.is-fullscreen').isVisible().catch(() => false)) await fullscreenButton.click();
  await page.waitForTimeout(300);

  const noteButton = page.locator('.reader-overlay .reader-toolbar nav button').nth(1);
  await noteButton.click();
  await page.waitForTimeout(300);
  report.interactions.notepadOpened = await page.locator('.floating-notepad textarea:visible').isVisible().catch(() => false);
  await page.screenshot({ path: `${outDir}/desktop-reader-note.png`, fullPage: true });
  report.interactions.brokenImages = await brokenImages(page);
  report.consoleErrors.push(...interactionErrors.map(error => `interaction: ${error}`));
  await page.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await mobilePage.locator('.continue-section .book-card').first().click();
  await mobilePage.locator('.reader-overlay').waitFor({ state: 'visible', timeout: 10000 });
  await mobilePage.screenshot({ path: `${outDir}/mobile-reader.png`, fullPage: true });
  report.interactions.mobileReaderOpened = true;
  report.interactions.mobileReaderOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  const mobileReader = mobilePage.locator('.reader-window');
  await mobileReader.evaluate((element) => {
    const start = new Touch({ identifier: 1, target: element, clientX: 330, clientY: 420 });
    const end = new Touch({ identifier: 1, target: element, clientX: 40, clientY: 420 });
    element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }));
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [end] }));
  });
  await mobilePage.waitForTimeout(650);
  report.interactions.mobileSwipeTurnedPage = await mobilePage.getByText(/Chapter 15 · Page 188/i).isVisible().catch(() => false)
    || await mobilePage.getByText('188 / 240', { exact: true }).isVisible().catch(() => false);
  await mobilePage.screenshot({ path: `${outDir}/mobile-reader-after-swipe.png`, fullPage: true });
  await mobileContext.close();
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
if (!report.interactions.themeChanged) report.failures.push('theme did not change to Midnight Violet');
if (!report.interactions.settingsClosed) report.failures.push('settings did not close');
if (!report.interactions.chatOpened) report.failures.push('companion chat did not open');
if (!report.interactions.chatShowsSelectedCompanion) report.failures.push('chat did not use the selected companion');
if (!report.interactions.pdfUploadedThroughChat) report.failures.push('PDF did not upload through chat');
if (!report.interactions.chatResponded) report.failures.push('companion chat did not respond');
if (!report.interactions.chatClosed) report.failures.push('companion chat did not close');
if (!report.interactions.readerOpened) report.failures.push('reader did not open');
if (!report.interactions.pageTurned) report.failures.push('reader page did not turn');
if (!report.interactions.fullscreenOpened) report.failures.push('reader fullscreen did not open');
if (!report.interactions.notepadOpened) report.failures.push('reader notepad did not open');
if (!report.interactions.mobileReaderOpened) report.failures.push('mobile reader did not open');
if (report.interactions.mobileReaderOverflow) report.failures.push('mobile reader has horizontal overflow');
if (!report.interactions.mobileSwipeTurnedPage) report.failures.push('mobile reader swipe did not turn the page');
if (report.interactions.settingsBrokenImages?.length) report.failures.push(`settings: broken images: ${report.interactions.settingsBrokenImages.map(item => item.alt).join(', ')}`);
if (report.interactions.brokenImages?.length) report.failures.push(`reader: broken images: ${report.interactions.brokenImages.map(item => item.alt).join(', ')}`);

await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));

if (report.failures.length) {
  console.error('Visual verification failed:\n' + report.failures.join('\n'));
  process.exit(1);
}
console.log('Visual verification passed. Evidence saved to visual-evidence/.');