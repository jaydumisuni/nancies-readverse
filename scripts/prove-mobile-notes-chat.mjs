import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/mobile-notes-chat";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { ok: true, baseUrl, viewports: [], errors: [] };

async function prepare(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("notverse.preferences", JSON.stringify({
      setupComplete: true,
      noteFont: "handwritten",
      readingInterests: ["Manga", "Novels"],
      discoveryMethods: ["title", "memory", "link"],
    }));
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function verifyPhone(width, height, name) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await prepare(page);

  await page.getByRole("button", { name: "Notes" }).last().click();
  await page.waitForSelector(".notes-experience .note-paper");

  const before = await page.locator(".note-position strong").textContent();
  const notesGeometry = await page.evaluate(() => {
    const paper = document.querySelector(".note-paper")?.getBoundingClientRect();
    const footer = document.querySelector(".note-paper > footer")?.getBoundingClientRect();
    const nav = document.querySelector(".mobile-nav")?.getBoundingClientRect();
    const notes = document.querySelector(".notes-experience")?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      notes: notes && { top: notes.top, bottom: notes.bottom, height: notes.height },
      paper: paper && { top: paper.top, bottom: paper.bottom, height: paper.height },
      footer: footer && { top: footer.top, bottom: footer.bottom },
      nav: nav && { top: nav.top, bottom: nav.bottom },
      bodyOverflow: getComputedStyle(document.body).overflow,
      notesOverflow: getComputedStyle(document.querySelector(".notes-experience")).overflow,
      touchAction: getComputedStyle(document.querySelector(".notes-experience")).touchAction,
    };
  });

  if (notesGeometry.document.height > height + 1) throw new Error(`${name}: Notes document scrolls (${notesGeometry.document.height} > ${height})`);
  if (!notesGeometry.footer || notesGeometry.footer.bottom > height) throw new Error(`${name}: Note footer is outside the viewport`);
  if (notesGeometry.nav && notesGeometry.paper && notesGeometry.paper.bottom > notesGeometry.nav.top + 1) throw new Error(`${name}: Note paper overlaps mobile navigation`);
  if (notesGeometry.touchAction !== "none") throw new Error(`${name}: Notes does not reserve vertical gestures`);

  await page.locator(".notes-experience").evaluate((element) => {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientY: 560 }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientY: 300 }));
  });
  await page.waitForTimeout(520);
  const after = await page.locator(".note-position strong").textContent();
  if (before === after) throw new Error(`${name}: vertical swipe did not flip the Note`);
  await page.screenshot({ path: `${out}/${name}-notes.png`, fullPage: false });

  await page.getByRole("button", { name: "Home" }).last().click();
  await page.getByRole("button", { name: "Chat now" }).click();
  await page.waitForSelector(".companion-panel.open .chat-input input");
  await page.waitForTimeout(420);

  const chatGeometry = await page.evaluate(() => {
    const panel = document.querySelector(".companion-panel.open")?.getBoundingClientRect();
    const input = document.querySelector(".chat-input")?.getBoundingClientRect();
    const body = document.querySelector(".chat-body");
    const nav = document.querySelector(".mobile-nav");
    return {
      panel: panel && { top: panel.top, bottom: panel.bottom, width: panel.width, height: panel.height },
      input: input && { top: input.top, bottom: input.bottom },
      chatBody: body && {
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        overflowY: getComputedStyle(body).overflowY,
        scrollbarWidth: getComputedStyle(body).scrollbarWidth,
      },
      nav: nav && {
        opacity: getComputedStyle(nav).opacity,
        pointerEvents: getComputedStyle(nav).pointerEvents,
        transform: getComputedStyle(nav).transform,
      },
      documentHeight: document.documentElement.scrollHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });

  const input = page.locator(".chat-input input");
  await input.fill("Do you have recommendations for books I can read on gambling?");
  await page.screenshot({ path: `${out}/${name}-chat.png`, fullPage: false });
  report.viewports.push({ name, width, height, notesGeometry, chatGeometry, before, after });

  if (!chatGeometry.panel || chatGeometry.panel.top < -1 || chatGeometry.panel.bottom > height + 1) throw new Error(`${name}: chat panel exceeds viewport: ${JSON.stringify(chatGeometry.panel)}`);
  if (!chatGeometry.input || chatGeometry.input.bottom > height + 1) throw new Error(`${name}: chat composer is unreachable`);
  if (chatGeometry.chatBody?.overflowY !== "auto") throw new Error(`${name}: only chat history should scroll internally`);
  if (chatGeometry.chatBody?.scrollbarWidth !== "none") throw new Error(`${name}: chat scrollbar remains visible`);
  if (chatGeometry.nav?.opacity !== "0" || chatGeometry.nav?.pointerEvents !== "none") throw new Error(`${name}: mobile navigation remains active behind chat`);
  if (chatGeometry.documentHeight > height + 1) throw new Error(`${name}: chat opens with document scrolling`);
  if ((await input.inputValue()).length < 20) throw new Error(`${name}: chat input is not editable`);

  await context.close();
}

for (const [width, height, name] of [
  [360, 640, "short-phone"],
  [384, 848, "phone"],
  [390, 844, "tall-phone"],
]) {
  try {
    await verifyPhone(width, height, name);
  } catch (error) {
    report.ok = false;
    report.errors.push(error instanceof Error ? error.message : String(error));
  }
}

await writeFile(`${out}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Mobile Notes/chat browser proof passed (${report.viewports.length} viewports).`);
