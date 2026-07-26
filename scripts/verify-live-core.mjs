import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const baseUrl = (process.env.READVERSE_URL || "https://nancies-readverse.pharrtechnolgiescoltd.workers.dev/").replace(/\/$/, "");
const outDir = "live-evidence";
await mkdir(outDir, { recursive: true });

const companions = ["Gojo", "Itachi", "Naruto", "Kakashi", "Megumi", "Sasuke", "Maki", "Nobara", "Hinata", "Sakura", "Temari", "Mei Mei"];
const report = { baseUrl, checkedAt: new Date().toISOString(), attempts: 0, personalities: {}, browser: {}, failures: [] };
const browser = await chromium.launch({ headless: true });

async function api(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { response, body };
}

async function verifyOnce() {
  const health = await api("/api/health");
  if (!health.response.ok || health.body?.status !== "transient-reader") throw new Error("Live Worker is not serving the transient-reader build");
  if (health.body?.storage !== "no permanent Cloudflare copies") throw new Error("Live Worker storage policy marker is missing");

  const personalityOutputs = {};
  for (const companion of companions) {
    const firstQuestion = "How should I open a PDF without saving it permanently?";
    const first = await api("/api/companion/help", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: firstQuestion, companion, history: [] }),
    });
    if (!first.response.ok || typeof first.body?.answer !== "string" || first.body.answer.length < 20) throw new Error(`${companion} failed the first conversation turn`);

    const secondQuestion = "And what should happen if I paste a source page full of ads?";
    const second = await api("/api/companion/help", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: secondQuestion,
        companion,
        history: [
          { role: "user", text: firstQuestion },
          { role: "assistant", text: first.body.answer },
        ],
      }),
    });
    if (!second.response.ok || typeof second.body?.answer !== "string" || second.body.answer.length < 20) throw new Error(`${companion} failed the second conversation turn`);
    if (first.body.answer === second.body.answer) throw new Error(`${companion} repeated the same answer across turns`);
    personalityOutputs[companion] = { first: first.body.answer, second: second.body.answer, modes: [first.body.mode, second.body.mode] };
  }
  report.personalities = personalityOutputs;

  const fixtureUrl = `${baseUrl}/fixtures/source-with-ads.html`;
  const resolved = await api("/api/source/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: fixtureUrl }),
  });
  if (!resolved.response.ok || !resolved.body?.source?.streamUrl) throw new Error(`Source fixture did not resolve: ${resolved.body?.error || resolved.response.status}`);
  if (!resolved.body.source.directUrl.includes("/fixtures/sample.pdf")) throw new Error("Resolver selected the wrong source link");
  if (/utm_|campaign=|ads\.invalid|tracker\.invalid/i.test(resolved.body.source.directUrl)) throw new Error("Resolver retained an ad or tracking URL");
  const streamed = await fetch(`${baseUrl}${resolved.body.source.streamUrl}`);
  if (!streamed.ok || !String(streamed.headers.get("content-type")).includes("application/pdf")) throw new Error("Resolved PDF stream did not open");
  if (streamed.headers.get("x-readverse-storage") !== "temporary-stream") throw new Error("Temporary stream marker is missing");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
  const brand = mobile.locator(".mobile-brand");
  await brand.waitFor({ state: "visible", timeout: 10000 });
  if ((await brand.locator("span").textContent()) !== "Nancy’s") throw new Error("Mobile Nancy’s wordmark is missing");
  if ((await brand.locator("strong").textContent()) !== "READVERSE") throw new Error("Mobile READVERSE wordmark is missing");
  const nancySize = Number.parseFloat(await brand.locator("span").evaluate((el) => getComputedStyle(el).fontSize));
  const readverseSize = Number.parseFloat(await brand.locator("strong").evaluate((el) => getComputedStyle(el).fontSize));
  if (!(readverseSize < nancySize * 0.6)) throw new Error("Mobile READVERSE wordmark is not smaller than Nancy’s");
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (mobileOverflow > 1) throw new Error(`Mobile layout overflows horizontally by ${mobileOverflow}px`);
  await mobile.screenshot({ path: `${outDir}/mobile-home.png`, fullPage: true });
  await mobile.close();

  const page = await browser.newPage({ viewport: { width: 1918, height: 1016 } });
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });

  if ((await page.locator(".brand span").textContent()) !== "Nancy's") throw new Error("Desktop Nancy’s wordmark is missing");
  if (!(await page.locator(".companion-panel.open").isVisible())) throw new Error("Desktop companion chat did not open in the approved layout");

  const pdf = await readFile("public/fixtures/sample.pdf");
  await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles({ name: "nancy-local-test.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Read now" }).last().click();
  await page.locator('.reader-document[src^="blob:"]').waitFor({ state: "visible", timeout: 10000 });
  const localMessage = await page.locator(".message-bubble").last().innerText();
  if (!localMessage.includes("No copy was uploaded to Cloudflare") || !localMessage.includes("Google Drive is not connected yet")) {
    throw new Error("Local PDF did not confirm transient handling and blocked Google saving");
  }
  await page.screenshot({ path: `${outDir}/desktop-local-pdf.png`, fullPage: true });

  await page.locator('.reader-toolbar button[aria-label="Close reader"]').click();
  await page.getByRole("button", { name: "Sources" }).click();
  await page.locator(".source-dialog input[type=url]").fill(fixtureUrl);
  await page.locator(".source-submit").click();
  await page.locator('.reader-document[src*="/api/source/stream"]').waitFor({ state: "visible", timeout: 20000 });
  const sourceMessage = await page.locator(".message-bubble").last().innerText();
  if (!sourceMessage.includes("opened it temporarily") || !sourceMessage.includes("not a permanent copy")) throw new Error("Source URL did not confirm temporary verified opening");
  await page.screenshot({ path: `${outDir}/desktop-source-pdf.png`, fullPage: true });

  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
  report.browser = {
    approvedDesktopLayout: true,
    approvedMobileBrand: true,
    localPdfOpened: true,
    sourcePageResolved: true,
    sourcePdfOpened: true,
    saveBlockedWithoutGoogle: true,
    consoleErrors,
  };
  await page.close();
}

try {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    report.attempts = attempt;
    try {
      await verifyOnce();
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 20) await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }
  if (lastError) throw lastError;
} catch (error) {
  report.failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
  await writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
}

if (report.failures.length) {
  console.error(report.failures.join("\n"));
  process.exit(1);
}
console.log("Live ReadVerse video-approved UI, transient reader, source resolver and all companion conversations verified.");
