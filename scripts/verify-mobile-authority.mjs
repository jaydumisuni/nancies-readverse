import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const main = await readFile("src/main.tsx", "utf8");
const notes = await readFile("src/notverse/NotesSocialExperience.tsx", "utf8");
const release = await readFile("src/notverse/release-mobile-contract.css", "utf8");
const native = await readFile("src/notverse/mobile-native-screens.css", "utf8");
const adaptive = await readFile("src/notverse/adaptive-interaction-fix.css", "utf8");
const production = await readFile("src/notverse/production-polish.css", "utf8");
const finalizer = await readFile("src/notverse/real-device-mobile-final.css", "utf8");
const controller = await readFile("src/notverse/real-device-mobile-controller.ts", "utf8");
const runtime = await readFile("src/notverse/runtime-interaction-fix.ts", "utf8");
const conversationScroll = await readFile("src/notverse/conversation-scroll.ts", "utf8");
const index = await readFile("index.html", "utf8");

function order(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  assert(a >= 0, `${label}: missing ${first}`);
  assert(b >= 0, `${label}: missing ${second}`);
  assert(a < b, `${label}: ${first} must load before ${second}`);
}

async function assertMissing(path, label) {
  await assert.rejects(access(path), undefined, `${label}: ${path} must remain removed`);
}

/* Cascade authority: compatibility/native first, finalizer next, release contract last. */
order(main, 'import "./notverse/adaptive-interaction-fix.css"', 'import "./notverse/mobile-native-screens.css"', "mobile CSS authority");
order(main, 'import "./notverse/mobile-native-screens.css"', 'import "./notverse/real-device-mobile-final.css"', "mobile CSS authority");
order(main, 'import "./notverse/real-device-mobile-final.css"', 'import "./notverse/release-mobile-contract.css"', "mobile CSS authority");
assert(adaptive.includes("Adaptive compatibility geometry"), "adaptive layer must identify itself as compatibility geometry");
assert(finalizer.includes("Real-device mobile finalizer"), "real-device finalizer lost its authority marker");
assert(native.includes("notverse-comments-open"), "native screen base is missing Comments geometry");
assert(!main.includes("focused-inbox-viewport"), "dead focused Inbox viewport layer must not be imported");
assert(!main.includes("ios-visual-viewport-recovery"), "superseded iOS viewport recovery must not be imported");

/* JS ownership: one controller publishes viewport/state, one module owns scroll. */
assert(controller.includes('root.style.setProperty("--notverse-mobile-vv-height"'), "real-device controller must publish the current viewport metric");
assert(controller.includes('root.style.setProperty("--notverse-viewport-height"'), "real-device controller must publish the legacy viewport metric from the same measurement");
assert(controller.includes('toggleState("notverse-notes-open", notesOpen)'), "real-device controller must own Notes mobile compatibility state");
assert(controller.includes("syncDesktopCompatibilityState"), "single controller must preserve desktop compatibility state");
assert(controller.includes('root.classList.toggle("notverse-chat-open", chatOpen)'), "desktop Chat compatibility must remain root-owned");
assert(!controller.includes("notverse-scroll-lock"), "single controller must not restore fixed-body scroll locking");
assert(!runtime.includes("--notverse-viewport-height"), "runtime enhancer must not publish viewport geometry");
assert(!runtime.includes("notverse-scroll-lock"), "runtime enhancer must not own body scroll locking");
assert(!runtime.includes("pinConversationEnd"), "runtime enhancer must not duplicate conversation scroll ownership");
assert(!runtime.includes("visualViewport?.addEventListener"), "runtime enhancer must not register a second visualViewport controller");
assert(conversationScroll.includes("function pinToEnd"), "conversation-scroll.ts must remain the conversation scroll owner");

/* Companion composer height has one owner. CSS styles the editor; runtime keeps
   the keyboard-edge control at 44px and makes long drafts scroll internally. */
assert(runtime.includes('editor.style.setProperty("height", "44px", "important")'), "runtime enhancer must own the stable chat composer height");
assert(runtime.includes('editor.style.setProperty("overflow-y", "auto", "important")'), "runtime enhancer must own long-draft internal scrolling");
assert(!production.includes(".chat-composer-editor:not(:placeholder-shown)"), "production CSS must not reintroduce a competing expanded chat composer height");

/* Comments must use one native submit path, matching the working Inbox lifecycle. */
assert(!main.includes("replies-enter-submit"), "superseded global Comments Enter shim must not be imported");
assert(!/createPortal\s*\(\s*<RepliesDrawer/.test(notes), "Comments must not portal RepliesDrawer to document.body");
assert(/\{repliesOpen\s*&&\s*note\s*&&\s*<RepliesDrawer/.test(notes), "Comments must render RepliesDrawer in the app tree");
assert(/<form\s+onSubmit=\{submit\}>[\s\S]*?<button\s+type="submit"[^>]*>Send<\/button>/.test(notes), "Comments Send must use native form submission");
assert(!/onPointerDown=\{[^}]*sendDraft/.test(notes), "Comments Send must not submit from pointerdown");
assert(notes.includes('target.closest("button,input,textarea,select,label,a,.replies-backdrop")'), "Comments pointerdown must not reach Notes swipe ownership");
assert(/function pointerUp[\s\S]*?target\.closest\("\.replies-backdrop"\)/.test(notes), "Comments pointerup must not reach Notes swipe ownership");

/* Single ownership: the native base may size the Comments screen, but it must not
   tear down the app shell or fixed nav that Comments now shares with Notes. */
assert(!native.includes("body.notverse-comments-open .readverse-app.notverse-app > .main-shell.notverse-shell"), "native base must not hide the in-tree Comments shell");
assert(!native.includes("body.notverse-comments-open .mobile-nav.notverse-mobile-nav,"), "native base must not include Comments in nav display:none teardown");
assert(!/body\.notverse-comments-open \.mobile-nav\.notverse-mobile-nav\s*\{\s*display:\s*none/i.test(native), "native base must not destroy the Comments nav compositor");
assert(/body\.notverse-comments-open \.replies-backdrop\s*\{[\s\S]*?pointer-events:\s*auto\s*!important;/.test(release), "release contract must keep the in-tree Comments surface interactive");
assert(/body\.notverse-comments-open \.mobile-nav\.notverse-mobile-nav\s*\{[\s\S]*?display:\s*grid\s*!important;[\s\S]*?visibility:\s*visible\s*!important;[\s\S]*?opacity:\s*1\s*!important;[\s\S]*?pointer-events:\s*none\s*!important;/.test(release), "release contract must keep Comments nav compositor painted and inert");

/* Theme ownership: app colors are authored by CSS; a white Note owns light-only
   component color while the document must not globally force dark color-scheme. */
assert(!/<meta\s+name="color-scheme"\s+content="dark"\s*\/?\s*>/i.test(index), "document-wide dark color-scheme conflicts with white Note paper");
assert(/\.notes-social-experience \.note-paper\s*\{[\s\S]*?color-scheme:\s*(?:light only|only light)\s*!important;[\s\S]*?background-color:\s*#fff\s*!important;/.test(release), "mobile Note paper must own a light-only white surface");

/* Superseded implementations are history, not alternative runtime owners. */
await assertMissing("src/notverse/replies-enter-submit.ts", "duplicate Comments submit owner");
await assertMissing("src/notverse/focused-inbox-viewport.css", "unreachable Inbox keyboard CSS");
await assertMissing("src/notverse/ios-visual-viewport-recovery.ts", "duplicate viewport controller");
await assertMissing("src/notverse/ios-visual-viewport-recovery.css", "duplicate viewport CSS");
await assertMissing("src/notverse/NotesExperience.tsx", "duplicate Notes implementation");

console.log("NoTVerse mobile authority verification passed.");
