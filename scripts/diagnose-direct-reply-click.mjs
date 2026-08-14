import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error?.stack || error)));
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.setItem("notverse.preferences", JSON.stringify({ setupComplete:true, interests:["Manga"], discovery:["Title, author, series or ISBN"], accentIntensity:74, readerFont:"serif", noteFont:"handwritten", reducedMotion:false, paperTexture:72, readingVisibility:"approximate", spoilerPreference:"progress", community:{seePublicNotes:true,seeLibraryNotes:true,allowFollowers:true,messageRequests:true,appearInNotebooks:true,privateByDefault:true} })));
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Notes", exact: true }).last().click();
await page.getByRole("button", { name: "New Note" }).click();
const noteText = `Direct click diagnostic ${Date.now()}`;
await page.locator(".note-composer textarea").fill(noteText);
await page.getByRole("button", { name: "Post", exact: true }).click();
const note = page.locator(".note-paper").filter({ hasText: noteText });
await note.waitFor();
const noteId = await note.getAttribute("data-note-id");
await note.getByRole("button", { name: "Reply to Note" }).click();
const form = page.locator(".replies-drawer>form");
const input = form.locator("input");
const send = form.getByRole("button", { name: "Send", exact: true });
await input.fill("Direct click reply");
await send.evaluate((node) => {
  window.__replyNativeClick = false;
  node.addEventListener("click", () => { window.__replyNativeClick = true; }, { once: true });
});
const before = await page.evaluate((id) => ({
  id,
  html: document.querySelector(".replies-drawer>form button")?.outerHTML,
  input: document.querySelector(".replies-drawer>form input")?.value,
  replies: JSON.parse(localStorage.getItem("notverse.noteReplies") || "{}"),
}), noteId);
await send.click();
await page.waitForTimeout(300);
const afterPointer = await page.evaluate((id) => ({
  id,
  nativeClick: window.__replyNativeClick,
  html: document.querySelector(".replies-drawer>form button")?.outerHTML,
  input: document.querySelector(".replies-drawer>form input")?.value,
  replies: JSON.parse(localStorage.getItem("notverse.noteReplies") || "{}"),
  note: JSON.parse(localStorage.getItem("notverse.notes") || "[]").find((item) => item.id === id),
  activity: JSON.parse(localStorage.getItem("notverse.noteActivity") || "[]").filter((item) => item.noteId === id),
  drawer: document.querySelector(".replies-drawer")?.textContent,
}), noteId);
if (afterPointer.input) {
  await input.press("Enter");
  await page.waitForTimeout(300);
}
const afterEnter = await page.evaluate((id) => ({
  input: document.querySelector(".replies-drawer>form input")?.value,
  replies: JSON.parse(localStorage.getItem("notverse.noteReplies") || "{}"),
  note: JSON.parse(localStorage.getItem("notverse.notes") || "[]").find((item) => item.id === id),
  drawer: document.querySelector(".replies-drawer")?.textContent,
}), noteId);
console.log("DIRECT_REPLY_CLICK=" + JSON.stringify({ before, afterPointer, afterEnter, errors }));
await context.close();
await browser.close();
