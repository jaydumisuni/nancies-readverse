#!/usr/bin/env node
/*
 * iPhone Visual Lab declarative capture campaign runner.
 * Workspace tooling only; never product authority.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, webkit } from 'playwright';

function args() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i];
    if (!key.startsWith('--')) continue;
    out[key.slice(2)] = process.argv[i + 1];
    i += 1;
  }
  if (!out.campaign) throw new Error('--campaign is required');
  if (!out.out) throw new Error('--out is required');
  return out;
}

const cli = args();
const campaignPath = resolve(cli.campaign);
const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));
const outputRoot = resolve(cli.out);
const target = cli.target || campaign.target;
if (!target) throw new Error('campaign target or --target is required');

const engines = { chromium, webkit };
const engineName = cli.engine || campaign.engine || 'webkit';
const engine = engines[engineName];
if (!engine) throw new Error(`unsupported engine: ${engineName}`);

function valueFromSpec(spec, device) {
  if (typeof spec === 'string') return spec.replaceAll('{{device.id}}', device.id).replaceAll('{{device.name}}', device.name);
  if (typeof spec === 'number' || typeof spec === 'boolean' || spec == null) return spec;
  if (Array.isArray(spec)) return spec.map((v) => valueFromSpec(v, device));
  if (spec.device === 'width') return device.width + Number(spec.delta || 0);
  if (spec.device === 'height') return device.height + Number(spec.delta || 0);
  const out = {};
  for (const [k, v] of Object.entries(spec)) out[k] = valueFromSpec(v, device);
  return out;
}

async function locatorFor(page, action) {
  if (action.selector) {
    let loc = page.locator(action.selector);
    if (Number.isInteger(action.nth)) loc = action.nth < 0 ? loc.last() : loc.nth(action.nth);
    return loc;
  }
  if (action.role) {
    const opts = {};
    if (action.name != null) opts.name = action.name;
    if (action.exact != null) opts.exact = Boolean(action.exact);
    let loc = page.getByRole(action.role, opts);
    if (Number.isInteger(action.nth)) loc = action.nth < 0 ? loc.last() : loc.nth(action.nth);
    return loc;
  }
  throw new Error(`action ${action.type} requires selector or role`);
}

async function execute(page, action, device, logs) {
  const a = valueFromSpec(action, device);
  switch (a.type) {
    case 'goto':
      await page.goto(a.url || target, { waitUntil: a.waitUntil || 'networkidle', timeout: a.timeout || 30000 });
      break;
    case 'reload':
      await page.reload({ waitUntil: a.waitUntil || 'networkidle', timeout: a.timeout || 30000 });
      break;
    case 'set-local-storage':
      await page.evaluate((items) => {
        for (const [key, value] of Object.entries(items)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }, a.items || {});
      break;
    case 'click': {
      const loc = await locatorFor(page, a);
      if (a.touch) await loc.tap(); else await loc.click();
      break;
    }
    case 'fill': {
      const loc = await locatorFor(page, a);
      await loc.fill(String(a.value ?? ''));
      break;
    }
    case 'focus': {
      const loc = await locatorFor(page, a);
      await loc.focus();
      break;
    }
    case 'blur': {
      const loc = await locatorFor(page, a);
      await loc.evaluate((node) => node.blur());
      break;
    }
    case 'wait-selector': {
      const loc = await locatorFor(page, a);
      await loc.waitFor({ state: a.state || 'visible', timeout: a.timeout || 5000 });
      break;
    }
    case 'wait-ms':
      await page.waitForTimeout(Number(a.ms || 0));
      break;
    case 'wait-text': {
      const loc = page.getByText(String(a.text ?? ''), { exact: a.exact !== false });
      await loc.waitFor({ state: a.state || 'visible', timeout: a.timeout || 5000 });
      break;
    }
    case 'viewport':
      await page.setViewportSize({ width: Number(a.width), height: Number(a.height) });
      break;
    case 'wait-css-var': {
      const expected = Number(a.expected);
      await page.waitForFunction(({ name, expected, tolerance }) => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const value = Number.parseFloat(raw);
        return Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
      }, { name: a.name, expected, tolerance: Number(a.tolerance ?? 3) }, { timeout: a.timeout || 3000 });
      break;
    }
    case 'press': {
      const loc = await locatorFor(page, a);
      await loc.press(a.key);
      break;
    }
    default:
      throw new Error(`unsupported action type: ${a.type}`);
  }
  logs.push({ action: a.type, ok: true });
}

await mkdir(outputRoot, { recursive: true });
const browser = await engine.launch({ headless: true });
const report = { schema: 'ttg.iphone-visual-lab-campaign-report.v1', campaign_id: campaign.id, engine: engineName, target, created_at: new Date().toISOString(), cases: [], errors: [] };

try {
  for (const device of campaign.devices || []) {
    for (const scene of campaign.scenes || []) {
      const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const consoleErrors = [];
      const actionLog = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));
      const caseRow = { device: device.id, scene: scene.id, consoleErrors, actions: actionLog, ok: false };
      try {
        for (const action of campaign.prepare || []) await execute(page, action, device, actionLog);
        for (const action of scene.actions || []) await execute(page, action, device, actionLog);
        const sceneDir = join(outputRoot, scene.id, device.id);
        await mkdir(sceneDir, { recursive: true });
        const file = scene.file || `${engineName}-${scene.id}.png`;
        await page.screenshot({ path: join(sceneDir, file), fullPage: false });
        caseRow.file = `${scene.id}/${device.id}/${file}`;
        caseRow.final_viewport = page.viewportSize();
        caseRow.ok = true;
      } catch (error) {
        caseRow.error = error instanceof Error ? error.stack || error.message : String(error);
        report.errors.push(`${device.id}/${scene.id}: ${caseRow.error}`);
      } finally {
        report.cases.push(caseRow);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
report.summary = { total: report.cases.length, pass: report.cases.filter((x) => x.ok).length, fail: report.cases.filter((x) => !x.ok).length };
report.ok = report.summary.fail === 0;
await writeFile(join(outputRoot, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
if (!report.ok) process.exitCode = 1;
