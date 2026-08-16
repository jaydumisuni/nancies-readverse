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

    const activityButton = page.getByRole("button", { name: "Note activity", exact: true });
    await activityButton.waitFor();
    const activityButtonBox = await rect(activityButton);
    assert(activityButtonBox.width >= 36 && activityButtonBox.height >= 36, `${browserName}: Note activity control is not reachable`);

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

    const actions = note.locator(".note-social-actions > button");
    assert.equal(await actions.count(), 4);
    for (let index = 0; index < 4; index += 1) {
      const box = await rect(actions.nth(index));
      assert(box.height >= 54 && box.width >= 44, `${browserName}: Note action ${index} below current mobile target`);
    }

    await note.getByRole("button", { name: "Comment on Note" }).click();
    const commentInput = page.getByRole("textbox", { name: "Write a comment" });
    await commentInput.waitFor();
    const commentOpenBox = await rect(commentInput);
    assert(commentOpenBox.height >= 46 && commentOpenBox.bottom <= 845, `${browserName}: comment input hidden on open`);

    const tapComment = `Persistent tap comment ${browserName}`;
    await commentInput.fill(tapComment);
    const commentSend = page.locator(".replies-drawer > form").getByRole("button", { name: "Send", exact: true });
    await commentSend.tap();
    await page.waitForFunction(() => document.querySelector(".replies-drawer input")?.value === "");
    await page.getByText(tapComment, { exact: true }).waitFor();

    const enterComment = `Persistent Enter comment ${browserName}`;
    await commentInput.fill(enterComment);
    await commentInput.press("Enter");
    await page.waitForFunction(() => document.querySelector(".replies-drawer input")?.value === "");
    await page.getByText(enterComment, { exact: true }).waitFor();
    assert.equal(await page.locator(".replies-list article").filter({ hasText: enterComment }).count(), 1, `${browserName}: Enter comment duplicated`);
    await page.screenshot({ path: `${out}/${browserName}-390-comments.png`, fullPage: false });
    await page.getByRole("button", { name: "Back to Notes" }).click();

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

    await page.getByRole("button", { name: "Note activity", exact: true }).click();
    const activity = page.locator(".note-activity-panel");
    await activity.waitFor();
    await activity.getByText("Note published", { exact: true }).waitFor();
    await activity.getByText(tapComment, { exact: true }).waitFor();
    await activity.getByText(enterComment, { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${browserName}-390-activity.png`, fullPage: false });
    await activity.getByRole("button", { name: "Close activity" }).click();

    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(setupPreferences);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".notes-social-experience").waitFor();
    const persisted = page.locator(".note-paper").filter({ hasText: text });
    await persisted.waitFor();
    await persisted.getByRole("button", { name: "Comment on Note" }).click();
    await page.getByText(tapComment, { exact: true }).waitFor();
    await page.getByText(enterComment, { exact: true }).waitFor();
    await page.getByRole("button", { name: "Back to Notes" }).click();

    await page.getByRole("button", { name: "Me", exact: true }).last().click();
    const summary = page.locator(".profile-note-summary");
    await summary.waitFor();
    await summary.getByRole("button", { name: "Open My Notes" }).click();
    await page.locator(".notes-tabs button.active", { hasText: "My Notes" }).waitFor();
    await page.getByText(text, { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${browserName}-390-my-notes.png`, fullPage: false });

    report.cases.push({ browserName, noteId, tapComment, enterComment });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  try {
    await journey(engine, name);
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
