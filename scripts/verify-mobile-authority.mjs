import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile("src/main.tsx", "utf8");
const notes = await readFile("src/notverse/NotesSocialExperience.tsx", "utf8");
const release = await readFile("src/notverse/release-mobile-contract.css", "utf8");
const native = await readFile("src/notverse/mobile-native-screens.css", "utf8");
const finalizer = await readFile("src/notverse/real-device-mobile-final.css", "utf8");
const index = await readFile("index.html", "utf8");

function order(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  assert(a >= 0, `${label}: missing ${first}`);
  assert(b >= 0, `${label}: missing ${second}`);
  assert(a < b, `${label}: ${first} must load before ${second}`);
}

/* Cascade authority: compatibility/native first, finalizer next, release contract last. */
order(main, 'import "./notverse/mobile-native-screens.css"', 'import "./notverse/real-device-mobile-final.css"', "mobile CSS authority");
order(main, 'import "./notverse/real-device-mobile-final.css"', 'import "./notverse/release-mobile-contract.css"', "mobile CSS authority");
assert(finalizer.includes("Final mobile surface contract"), "real-device finalizer lost its authority marker");
assert(native.includes("notverse-comments-open"), "native screen base is missing Comments state");

/* Comments must use the same React/browser lifecycle as the working Inbox. */
assert(!/createPortal\s*\(\s*<RepliesDrawer/.test(notes), "Comments must not portal RepliesDrawer to document.body");
assert(/\{repliesOpen\s*&&\s*note\s*&&\s*<RepliesDrawer/.test(notes), "Comments must render RepliesDrawer in the app tree");
assert(/<form\s+onSubmit=\{submit\}>[\s\S]*?<button\s+type="submit"[^>]*>Send<\/button>/.test(notes), "Comments Send must use native form submission");
assert(!/onPointerDown=\{[^}]*sendDraft/.test(notes), "Comments Send must not submit from pointerdown");

/* Legacy native-screen rules may exist, but the final release contract must keep
   the in-tree Comments shell and fixed nav painted/interactable correctly. */
assert(/body\.notverse-comments-open \.readverse-app\.notverse-app > \.main-shell\.notverse-shell\s*\{[\s\S]*?visibility:\s*visible\s*!important;[\s\S]*?pointer-events:\s*auto\s*!important;/.test(release), "release contract must keep Comments app shell visible/interactable");
assert(/body\.notverse-comments-open \.mobile-nav\.notverse-mobile-nav\s*\{[\s\S]*?display:\s*grid\s*!important;[\s\S]*?visibility:\s*visible\s*!important;[\s\S]*?opacity:\s*1\s*!important;[\s\S]*?pointer-events:\s*none\s*!important;/.test(release), "release contract must keep Comments nav compositor painted and inert");

/* Theme ownership: app colors are authored by CSS; a white Note owns light-only
   component color while the document must not globally force dark color-scheme. */
assert(!/<meta\s+name="color-scheme"\s+content="dark"\s*\/?\s*>/i.test(index), "document-wide dark color-scheme conflicts with white Note paper");
assert(/\.notes-social-experience \.note-paper\s*\{[\s\S]*?color-scheme:\s*(?:light only|only light)\s*!important;[\s\S]*?background-color:\s*#fff\s*!important;/.test(release), "mobile Note paper must own a light-only white surface");

console.log("NoTVerse mobile authority verification passed.");
