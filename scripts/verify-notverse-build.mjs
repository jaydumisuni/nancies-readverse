import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const read = (path) => readFile(path, "utf8");
const [app, setup, views, notes, css, worker, platform, social, schema, socialConfig, manifest, index, packageJson] = await Promise.all([
  read("src/App.tsx"),
  read("src/notverse/SetupWizard.tsx"),
  read("src/notverse/NoTVerseViews.tsx"),
  read("src/notverse/NotesExperience.tsx"),
  read("src/notverse/notverse.css"),
  read("worker/index.ts"),
  read("worker/platform.ts"),
  read("social-worker/index.ts"),
  read("social-worker/schema.sql"),
  read("social-worker/wrangler.social.jsonc"),
  read("public/manifest.webmanifest"),
  read("index.html"),
  read("package.json"),
]);

const exactOrigin = "Created for Nancy. Shared with the world.";
const approved = ["Gojo", "Itachi", "Naruto", "Kakashi", "Megumi", "Sasuke", "Maki", "Nobara", "Hinata", "Sakura", "Temari", "Mei Mei"];
const placeholders = ["Luna", "Kai", "Ari", "Milo", "Zara", "Neo"];

const checks = [
  [app.includes("<SetupWizard"), "setup wizard is not mounted"],
  [app.includes("<NoTVerseViews"), "NoTVerse sections are not mounted"],
  [app.includes('className="mobile-nav notverse-mobile-nav"'), "six-item mobile navigation is missing"],
  [app.includes("NoTVerse Settings"), "settings still expose the old product name"],
  [setup.includes(exactOrigin), "setup does not preserve the complete origin line"],
  [setup.includes("Swipe up to enter"), "swipe-only final entry is missing"],
  [setup.includes("setupComplete"), "setup completion state is missing"],
  [setup.includes("companions.map"), "setup does not use the real companion roster"],
  [notes.includes("note-flip-stage"), "Notes page-flip stage is missing"],
  [notes.includes("Swipe up to flip forward"), "Notes swipe direction is missing"],
  [notes.includes("note-photo"), "small attached Note image is missing"],
  [notes.includes("spoiler-cover"), "spoiler protection is missing"],
  [notes.includes("RepliesDrawer"), "isolated reply drawer is missing"],
  [views.includes("Scan Cover"), "cover discovery is missing"],
  [views.includes("Scan Page"), "page discovery is missing"],
  [views.includes("Voice Description"), "voice discovery is missing"],
  [views.includes("Provider connections pending · No fake score shown"), "rating honesty state is missing"],
  [views.includes("Reading Now"), "live reading area is missing"],
  [views.includes("Your Notebooks"), "Home Notebooks area is missing"],
  [css.includes("@keyframes noteFlipNext"), "Notes page animation is missing"],
  [css.includes("@keyframes setupFlipForward"), "setup page animation is missing"],
  [manifest.includes('"name": "NoTVerse"'), "manifest is not rebranded"],
  [index.includes("NoTVerse"), "document metadata is not rebranded"],
  [worker.includes("NoTVerse"), "Reader Worker is not rebranded"],
  [platform.includes('FOLDER_NAME = "NoTVerse"'), "Google Drive folder is not rebranded"],
  [social.includes("/v1/notes"), "social Notes API is missing"],
  [social.includes("/v1/notebooks"), "social Notebooks API is missing"],
  [social.includes("/v1/presence"), "social reading presence API is missing"],
  [social.includes("/v1/inbox"), "social Inbox API is missing"],
  [social.includes("Three approved edition-matched rating sources"), "ratings availability guard is missing"],
  [schema.includes("CREATE TABLE IF NOT EXISTS notes"), "Notes table is missing"],
  [schema.includes("CREATE TABLE IF NOT EXISTS notebooks"), "Notebooks table is missing"],
  [schema.includes("CREATE TABLE IF NOT EXISTS messages"), "Inbox schema is missing"],
  [schema.includes("CREATE TABLE IF NOT EXISTS rating_sources"), "rating-source audit schema is missing"],
  [socialConfig.includes('"binding": "DB"'), "isolated D1 binding is missing"],
  [socialConfig.includes('"binding": "MEDIA"'), "isolated R2 binding is missing"],
  [socialConfig.includes('"binding": "SOCIAL_KV"'), "isolated KV binding is missing"],
  [!social.includes("reading book") && !schema.includes("book_blob"), "social service attempts to store copied reading books"],
];
for (const [condition, message] of checks) assert(condition, message);

for (const name of approved) {
  assert(app.includes(`name: "${name}"`), `approved companion is missing: ${name}`);
}
for (const name of placeholders) {
  assert(!app.includes(`name: "${name}"`) && !setup.includes(`>${name}<`), `placeholder companion leaked into the product: ${name}`);
}

const navLabels = ["Home", "Search", "Notes", "Library", "Inbox", "Me"];
for (const label of navLabels) assert(app.includes(`"${label}"`), `navigation item is missing: ${label}`);

const packageData = JSON.parse(packageJson);
assert(packageData.name === "notverse", "package identity is not NoTVerse");
assert(packageData.scripts.build.includes("verify:notverse"), "NoTVerse verification is not part of the strict build");
assert(packageData.scripts.build.includes("check:social"), "social Worker type-check is not part of the strict build");

await stat("dist/nancies_readverse/index.js");
const module = await import(`${pathToFileURL("dist/nancies_readverse/index.js").href}?notverse=${Date.now()}`);
const handler = module.default;
assert(handler && typeof handler.fetch === "function", "built Reader Worker is not callable");
const health = await handler.fetch(new Request("https://notverse.test/api/health"), {
  APP_NAME: "NoTVerse",
  AI_MODEL: "fixture",
  ASSETS: { fetch: async () => new Response("asset") },
  AI: { run: async () => ({ response: "fixture" }) },
}, { waitUntil() {}, passThroughOnException() {} });
const healthBody = await health.json();
assert(healthBody.app === "NoTVerse", "built health response exposes the wrong product name");

console.log(JSON.stringify({ ok: true, checks: checks.length + approved.length + navLabels.length + 5, method: "10 fronts / 2 gates", fronts: ["identity", "setup", "navigation", "home", "search", "notes", "library", "inbox", "profile", "social service"], gates: ["strict build", "browser proof"] }, null, 2));
