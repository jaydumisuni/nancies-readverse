import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/notes-social-completion";
await mkdir(out, { recursive: true });
const report = { ok: true, cases: [], errors: [] };

function setupPreferences() {
  localStorage.setItem("notverse.preferences", JSON.stringify({
    setupComplete: true,
    interests: ["Manga", "Novels", "PDFs"],
    discovery: ["Title, author, series or ISBN"],
    accentIntensity: 74,
    readerFont: "serif",
    noteFont: "handwritten",
    reducedMotion: false,
    paperTexture: 72,
    readingVisibility: "approximate",
    spoilerPreference: "progress",
    community: {
      seePublicNotes: true,
      seeLibraryNotes: true,
      allowFollowers: true,
      messageRequests: true,
      appearInNotebooks: true,
      privateByDefault: true,
    },
  }));
}

async function installBrowserStubs(page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => { window.__notverseSharePayload = payload; },
    });
    if (!navigator.clipboard) Object.defineProperty(navigator, "clipboard", { configurable: true, value: {} });
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (value) => { window.__notverseClipboard = value; },
    });
  });
}

async function prepare(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(setupPreferences);
  await page.reload({ waitUntil: "networkidle" });
  await installBrowserStubs(page);
}

async function rect(locator) {
  return locator.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { top: box.top, left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  });
}

async function openNotes(page) {
  await page.getByRole("button", { name: "Notes", exact: true }).last().click();
  await page.locator(".notes-social-experience").waitFor();
}

async function journey(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await openNotes(page);

    const myNotesTab = page.getByRole("button", { name: "My Notes", exact: true });
    await myNotesTab.waitFor();
    const myTabBox = await rect(myNotesTab);
    assert(myTabBox.height >= 40, `${browserName}: My Notes tab too small`);

    const notifications = page.getByRole("button", { name: "Notifications", exact: true });
    await notifications.waitFor();
    const notificationBox = await rect(notifications);
    assert(notificationBox.width >= 36 && notificationBox.height >= 36, `${browserName}: Notifications control is not reachable`);

    await page.getByRole("button", { name: "New Note" }).click();
    const composer = page.locator(".note-composer");
    await composer.waitFor();
    const text = `Social loop proof ${browserName} ${Date.now()}`;
    await composer.locator("textarea").fill(text);
    await composer.getByRole("button", { name: "Post", exact: true }).click();
    await page.locator(".notes-tabs button.active", { hasText: "My Notes" }).waitFor();
    await page.getByText(text, { exact: true }).waitFor();

    const note = page.locator(".note-paper").filter({ hasText: text });
    const noteId = await note.getAttribute("data-note-id");
    assert(noteId, `${browserName}: no stable Note id`);

    const actions = note.locator(".note-social-actions>button");
    assert.equal(await actions.count(), 4);
    for (let index = 0; index < 4; index += 1) {
      const box = await rect(actions.nth(index));
      assert(box.height >= 44 && box.width >= 44, `${browserName}: Note action ${index} below 44px target`);
    }

    await note.getByRole("button", { name: "Reply to Note" }).click();
    const replyInput = page.getByRole("textbox", { name: "Write a reply" });
    await replyInput.waitFor();
    const replyOpenBox = await rect(replyInput);
    assert(replyOpenBox.height >= 40 && replyOpenBox.bottom <= 845, `${browserName}: reply input hidden on open`);

    const tapReply = `Persistent tap reply ${browserName}`;
    await replyInput.fill(tapReply);
    const replySend = page.locator(".replies-drawer>form").getByRole("button", { name: "Send", exact: true });
    await replySend.tap();
    await page.waitForFunction(() => document.querySelector(".replies-drawer input")?.value === "");
    await page.getByText(tapReply, { exact: true }).waitFor();

    const enterReply = `Persistent Enter reply ${browserName}`;
    await replyInput.fill(enterReply);
    await replyInput.press("Enter");
    await page.waitForFunction(() => document.querySelector(".replies-drawer input")?.value === "");
    await page.getByText(enterReply, { exact: true }).waitFor();
    assert.equal(await page.locator(".replies-list article").filter({ hasText: enterReply }).count(), 1, `${browserName}: Enter reply duplicated`);
    await page.screenshot({ path: `${out}/${browserName}-390-replies.png`, fullPage: false });
    await page.getByRole("button", { name: "Close replies" }).click();

    await note.getByRole("button", { name: "Share Note" }).click();
    const payload = await page.evaluate(() => window.__notverseSharePayload);
    assert(payload?.url?.includes(`#note=${encodeURIComponent(noteId)}`), `${browserName}: stable share URL missing`);
    assert(String(payload?.text || "").includes(text.slice(0, 40)), `${browserName}: shared Note text missing`);

    await page.goto(payload.url, { waitUntil: "networkidle" });
    await page.evaluate(setupPreferences);
    await page.reload({ waitUntil: "networkidle" });
    await installBrowserStubs(page);
    await page.locator(".notes-social-experience").waitFor();
    await page.getByText(text, { exact: true }).waitFor();
    assert(page.url().includes(`#note=${encodeURIComponent(noteId)}`), `${browserName}: deep link did not retain Note id`);

    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    const activity = page.locator(".note-activity-panel");
    await activity.waitFor();
    await activity.getByText("Note published", { exact: true }).waitFor();
    await activity.getByText(tapReply, { exact: true }).waitFor();
    await activity.getByText(enterReply, { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${browserName}-390-activity.png`, fullPage: false });
    await activity.getByRole("button", { name: "Close activity" }).click();

    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(setupPreferences);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".notes-social-experience").waitFor();
    const persisted = page.locator(".note-paper").filter({ hasText: text });
    await persisted.waitFor();
    await persisted.getByRole("button", { name: "Reply to Note" }).click();
    await page.getByText(tapReply, { exact: true }).waitFor();
    await page.getByText(enterReply, { exact: true }).waitFor();
    await page.getByRole("button", { name: "Close replies" }).click();

    await page.getByRole("button", { name: "Me", exact: true }).last().click();
    const summary = page.locator(".profile-note-summary");
    await summary.waitFor();
    await summary.getByRole("button", { name: "Open My Notes" }).click();
    await page.locator(".notes-tabs button.active", { hasText: "My Notes" }).waitFor();
    await page.getByText(text, { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${browserName}-390-my-notes.png`, fullPage: false });

    report.cases.push({ browserName, noteId, tapReply, enterReply });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function injectViewport(page, state) {
  return page.evaluate((next) => {
    const viewport = visualViewport;
    if (!viewport) return false;
    try {
      Object.defineProperties(viewport, {
        offsetTop: { configurable: true, value: next.top },
        offsetLeft: { configurable: true, value: next.left },
        width: { configurable: true, value: next.width },
        height: { configurable: true, value: next.height },
      });
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
      return true;
    } catch {
      return false;
    }
  }, state);
}

async function keyboardTransition(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await prepare(page);
    await page.getByRole("button", { name: "Inbox", exact: true }).last().click();
    const input = page.locator(".inbox-layout main>form input");
    await input.focus();

    const states = [
      { top: 0, left: 0, width: 390, height: 844 },
      { top: 0, left: 0, width: 390, height: 700 },
      { top: 40, left: 12, width: 366, height: 600 },
      { top: 84, left: 12, width: 366, height: 440 },
    ];
    const samples = [];
    for (const state of states) {
      assert(await injectViewport(page, state), `${browserName}: cannot inject Inbox transition viewport`);
      await page.waitForTimeout(90);
      const box = await page.locator(".inbox-layout main>form").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, width: rect.width, bottom: rect.bottom };
      });
      const expectedBottom = state.height;
      samples.push({ ...box, expectedBottom });
      assert(Math.abs(box.left) <= 1 && Math.abs(box.width - 390) <= 1, `${browserName}: Inbox moved sideways during focus transition ${JSON.stringify({ state, box })}`);
      assert(Math.abs(box.bottom - expectedBottom) <= 8, `${browserName}: Inbox composer left moving keyboard edge ${JSON.stringify({ state, box, expectedBottom })}`);
    }

    await page.waitForTimeout(650);
    const finalBox = await page.locator(".inbox-layout main>form").evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, width: box.width, bottom: box.bottom };
    });
    const finalBottom = states.at(-1).height;
    assert(Math.abs(finalBox.left) <= 1 && Math.abs(finalBox.width - 390) <= 1, `${browserName}: Inbox final horizontal geometry moved ${JSON.stringify(finalBox)}`);
    assert(Math.abs(finalBox.bottom - finalBottom) <= 8, `${browserName}: Inbox final composer left keyboard edge ${finalBox.bottom} vs ${finalBottom}`);
    await page.screenshot({ path: `${out}/${browserName}-390-inbox-focus-transition.png`, fullPage: false });
    report.cases.push({ browserName, keyboardTransition: true, samples, finalBox });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  try {
    await journey(engine, name);
    await keyboardTransition(engine, name);
  } catch (error) {
    report.ok = false;
    report.errors.push(`${name}: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  }
}

await writeFile(`${out}/notes-social-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Notes social completion proof passed (${report.cases.length} cases).`);
