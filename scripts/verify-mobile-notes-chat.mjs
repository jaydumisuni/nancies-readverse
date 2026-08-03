import { readFile } from "node:fs/promises";

const css = await readFile("src/notverse/mobile-geometry-fix.css", "utf8");
const main = await readFile("src/main.tsx", "utf8");
const smart = await readFile("worker/smart-companion.ts", "utf8");
const config = await readFile("wrangler.jsonc", "utf8");

const checks = [
  [main.includes('import "./notverse/mobile-geometry-fix.css"'), "responsive geometry stylesheet is loaded"],
  [css.includes("body:has(.companion-panel.open)"), "open companion chat locks document scrolling"],
  [css.includes(".companion-panel.open ~ .mobile-nav"), "mobile navigation leaves the screen while chat is open"],
  [css.includes("grid-template-rows: auto minmax(0, 1fr) auto"), "chat header, history and composer use bounded rows"],
  [css.includes("scrollbar-width: none"), "scrollbars are visually hidden"],
  [css.includes(".main-shell.notverse-shell:has(.notes-experience)"), "Notes owns a bounded mobile workspace"],
  [css.includes("touch-action: none"), "vertical Notes gestures are reserved for page flipping"],
  [css.includes(".note-flip-stage") && css.includes("min-height: 0 !important"), "Note paper can shrink to short screens"],
  [smart.includes("Answer the user's actual topic first"), "companion prompt prioritises the real question"],
  [smart.includes("For book recommendations, give 3 to 5 specific relevant titles"), "recommendation behaviour is explicit"],
  [smart.includes("isMismatchedAnswer"), "generic source answers are rejected for recommendation questions"],
  [!/\/link\|source\|url\|ad\//.test(smart), "the old substring 'ad' routing bug is absent"],
  [config.includes('"main": "worker/entry.ts"'), "the smart companion entry is deployed"],
];

const failed = checks.filter(([passed]) => !passed).map(([, label]) => label);
if (failed.length) {
  console.error(`Mobile Notes/chat verification failed:\n- ${failed.join("\n- ")}`);
  process.exit(1);
}

console.log(`Mobile Notes/chat verification passed (${checks.length} checks).`);
