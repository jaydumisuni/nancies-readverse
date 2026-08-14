import { chromium } from "playwright";

const url = "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.setItem("notverse.preferences", JSON.stringify({ setupComplete: true, interests: ["Manga"], discovery: ["Title, author, series or ISBN"], accentIntensity: 74, readerFont: "serif", noteFont: "handwritten", reducedMotion: false, paperTexture: 72, readingVisibility: "approximate", spoilerPreference: "progress", community: { seePublicNotes: true, seeLibraryNotes: true, allowFollowers: true, messageRequests: true, appearInNotebooks: true, privateByDefault: true } })));
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Notes", exact: true }).last().click();
await page.getByRole("button", { name: "New Note" }).click();
const text = `Reply diagnostic ${Date.now()}`;
await page.locator(".note-composer textarea").fill(text);
await page.getByRole("button", { name: "Post", exact: true }).click();
const note = page.locator(".note-paper").filter({ hasText: text });
await note.waitFor();
const noteId = await note.getAttribute("data-note-id");
await note.getByRole("button", { name: "Reply to Note" }).click();
const input = page.getByRole("textbox", { name: "Write a reply" });
await input.fill("Diagnostic reply record");
await page.getByRole("button", { name: "Send", exact: true }).click();
await page.waitForTimeout(500);
const snapshot = await page.evaluate((id) => ({
  noteId: id,
  repliesStorage: JSON.parse(localStorage.getItem("notverse.noteReplies") || "{}"),
  notesStorage: JSON.parse(localStorage.getItem("notverse.notes") || "[]").filter((note) => note.id === id),
  activityStorage: JSON.parse(localStorage.getItem("notverse.noteActivity") || "[]").filter((item) => item.noteId === id),
  drawerText: document.querySelector(".replies-drawer")?.textContent || "",
  replyArticles: [...document.querySelectorAll(".replies-list article")].map((node) => ({ text: node.textContent, html: node.innerHTML })),
  inputValue: document.querySelector(".replies-drawer input")?.value,
  sendDisabled: document.querySelector(".replies-drawer button[type=submit]")?.disabled,
}), noteId);
console.log("NOTE_REPLY_DIAGNOSTIC=" + JSON.stringify(snapshot));
await context.close();
await browser.close();
