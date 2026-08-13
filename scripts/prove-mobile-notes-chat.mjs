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

async function verifyMessageClearance(page, threadSelector, composerSelector, label) {
  const geometry = await page.evaluate(({ threadSelector, composerSelector }) => {
    const thread = document.querySelector(threadSelector);
    const composer = document.querySelector(composerSelector)?.getBoundingClientRect();
    const last = thread?.lastElementChild?.getBoundingClientRect();
    const threadBox = thread?.getBoundingClientRect();
    return {
      composer: composer && { top: composer.top, bottom: composer.bottom },
      last: last && { top: last.top, bottom: last.bottom },
      thread: threadBox && { top: threadBox.top, bottom: threadBox.bottom },
      scrollTop: thread instanceof HTMLElement ? thread.scrollTop : 0,
      scrollHeight: thread instanceof HTMLElement ? thread.scrollHeight : 0,
      clientHeight: thread instanceof HTMLElement ? thread.clientHeight : 0,
    };
  }, { threadSelector, composerSelector });
  if (!geometry.thread || !geometry.composer || !geometry.last) throw new Error(`${label}: missing thread/composer geometry ${JSON.stringify(geometry)}`);
  if (geometry.thread.bottom > geometry.composer.top + 1) throw new Error(`${label}: scrolling thread extends under composer ${JSON.stringify(geometry)}`);
  if (geometry.last.bottom > geometry.thread.bottom + 1) throw new Error(`${label}: newest message is clipped below the thread ${JSON.stringify(geometry)}`);
  if (geometry.scrollHeight > geometry.clientHeight && geometry.scrollTop + geometry.clientHeight < geometry.scrollHeight - 2) {
    throw new Error(`${label}: newest message is not scrolled into view ${JSON.stringify(geometry)}`);
  }
  return geometry;
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
  await page.waitForSelector(".companion-panel.open .chat-input textarea.chat-composer-editor");
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

  const editor = page.locator(".chat-input textarea.chat-composer-editor");
  const bridge = page.locator(".chat-input input.chat-input-state-bridge");
  const draft = "Do you have recommendations for books I can read on gambling? I want something that explains the psychology and the odds clearly enough that I can spot mistakes before I send this.";
  await editor.fill(draft);
  await page.waitForTimeout(80);
  const editorBox = await editor.boundingBox();
  if (!editorBox || editorBox.height <= 44) throw new Error(`${name}: long chat draft did not expand vertically`);
  if ((await editor.inputValue()) !== draft) throw new Error(`${name}: visible composer does not retain the full draft`);
  if ((await bridge.inputValue()) !== draft) throw new Error(`${name}: visible composer did not synchronise with React state bridge`);
  await page.screenshot({ path: `${out}/${name}-chat-draft.png`, fullPage: false });

  await editor.press("Shift+Enter");
  await editor.type("Second line so I can inspect and correct wording before sending.");
  if (!(await editor.inputValue()).includes("\n")) throw new Error(`${name}: Shift+Enter does not preserve an editable new line`);
  await page.screenshot({ path: `${out}/${name}-chat-editing.png`, fullPage: false });

  const userMessagesBefore = await page.locator(".message-row.user").count();
  await editor.press("Enter");
  await page.waitForFunction((before) => document.querySelectorAll(".message-row.user").length > before, userMessagesBefore, { timeout: 3000 });
  await page.waitForTimeout(250);
  if ((await editor.inputValue()) !== "") throw new Error(`${name}: visible composer did not clear after sending`);
  const chatClearance = await verifyMessageClearance(page, ".companion-panel.open .chat-body", ".companion-panel.open .chat-input", `${name}/chat`);
  await page.screenshot({ path: `${out}/${name}-chat-sent.png`, fullPage: false });

  if (!chatGeometry.panel || chatGeometry.panel.top < -1 || chatGeometry.panel.bottom > height + 1) throw new Error(`${name}: chat panel exceeds viewport: ${JSON.stringify(chatGeometry.panel)}`);
  if (!chatGeometry.input || chatGeometry.input.bottom > height + 1) throw new Error(`${name}: chat composer is unreachable`);
  if (chatGeometry.chatBody?.overflowY !== "auto") throw new Error(`${name}: only chat history should scroll internally`);
  if (chatGeometry.chatBody?.scrollbarWidth !== "none") throw new Error(`${name}: chat scrollbar remains visible`);
  if (chatGeometry.nav?.opacity !== "0" || chatGeometry.nav?.pointerEvents !== "none") throw new Error(`${name}: mobile navigation remains active behind chat`);
  if (chatGeometry.documentHeight > height + 1) throw new Error(`${name}: chat opens with document scrolling`);

  await editor.fill("Keyboard visibility check with enough text to wrap onto another line before the viewport becomes shorter.");
  await editor.focus();
  const keyboardHeight = Math.min(height, 524);
  await page.setViewportSize({ width, height: keyboardHeight });
  await page.waitForTimeout(300);
  const keyboardGeometry = await page.evaluate(() => {
    const panel = document.querySelector(".companion-panel.open")?.getBoundingClientRect();
    const composer = document.querySelector(".companion-panel.open .chat-input")?.getBoundingClientRect();
    const editor = document.querySelector(".companion-panel.open .chat-composer-editor")?.getBoundingClientRect();
    return {
      height: innerHeight,
      panelBottom: panel?.bottom,
      composerBottom: composer?.bottom,
      editorBottom: editor?.bottom,
      scale: visualViewport?.scale || 1,
    };
  });
  if ((keyboardGeometry.panelBottom || 0) > keyboardGeometry.height + 1) throw new Error(`${name}: keyboard-sized chat panel exceeds viewport`);
  if ((keyboardGeometry.composerBottom || 0) > keyboardGeometry.height + 1) throw new Error(`${name}: composer hides behind keyboard-sized viewport`);
  if ((keyboardGeometry.editorBottom || 0) > keyboardGeometry.height + 1) throw new Error(`${name}: visible draft editor hides behind keyboard-sized viewport`);
  if (Math.abs(keyboardGeometry.scale - 1) > .01) throw new Error(`${name}: focused editor triggered mobile zoom ${keyboardGeometry.scale}`);
  await page.screenshot({ path: `${out}/${name}-chat-keyboard.png`, fullPage: false });

  await page.setViewportSize({ width, height });
  await page.waitForTimeout(160);
  await page.getByRole("button", { name: "Close chat" }).click();
  await page.getByRole("button", { name: "Inbox" }).last().click();
  await page.waitForSelector(".inbox-layout .message-thread");
  const inboxInput = page.locator(".inbox-layout main > form input");
  const inboxText = "This is a longer mobile message used to prove the last bubble remains fully visible above the composer.";
  await inboxInput.fill(inboxText);
  await inboxInput.press("Enter");
  await page.waitForFunction((expected) => {
    const last = document.querySelector(".inbox-layout .message-thread")?.lastElementChild;
    return last?.firstChild?.textContent?.trim() === expected;
  }, inboxText);
  await page.waitForTimeout(180);
  const inboxClearance = await verifyMessageClearance(page, ".inbox-layout .message-thread", ".inbox-layout main > form", `${name}/inbox`);
  await page.screenshot({ path: `${out}/${name}-inbox-sent.png`, fullPage: false });

  await inboxInput.blur();
  await page.waitForFunction(() => !document.body.classList.contains("notverse-inbox-keyboard"));
  await page.getByRole("button", { name: "Search" }).last().click();
  await page.waitForSelector(".search-action-grid");
  if (height <= 700) {
    const searchGeometry = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".search-action-grid > button")];
      const descriptions = cards.map((card) => {
        const small = card.querySelector("small");
        if (!(small instanceof HTMLElement)) return null;
        const style = getComputedStyle(small);
        const box = small.getBoundingClientRect();
        return { text: small.textContent, width: box.width, height: box.height, whiteSpace: style.whiteSpace, lines: Math.round(box.height / Number.parseFloat(style.lineHeight || "10")) };
      }).filter(Boolean);
      const first = cards[0]?.getBoundingClientRect();
      const second = cards[1]?.getBoundingClientRect();
      const third = cards[2]?.getBoundingClientRect();
      return { descriptions, first, second, third };
    });
    if (searchGeometry.first && searchGeometry.second && Math.abs(searchGeometry.first.top - searchGeometry.second.top) > 2) throw new Error(`${name}: first two Search actions are not sharing a readable row`);
    if (searchGeometry.third && searchGeometry.first && searchGeometry.third.top <= searchGeometry.first.top + 2) throw new Error(`${name}: short-phone Search is still squeezing three actions into one row`);
    if (searchGeometry.descriptions.some((item) => item.whiteSpace === "nowrap")) throw new Error(`${name}: Search descriptions are still single-line clipped`);
  }
  await page.screenshot({ path: `${out}/${name}-search.png`, fullPage: false });

  report.viewports.push({ name, width, height, notesGeometry, chatGeometry, chatClearance, keyboardGeometry, inboxClearance, before, after });
  await context.close();
}

for (const [width, height, name] of [
  [360, 640, "short-phone"],
  [384, 848, "phone"],
  [390, 844, "tall-phone"],
  [430, 932, "large-phone"],
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
