import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const PUBLIC_HOST = "notverse.pharrtechnolgiescoltd.workers.dev";
const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;
const RETIRED_HOST = "notverse.1ink.online";

const [entry, configText, deployWorkflow, readme, verification, productRules, liveVerifier] = await Promise.all([
  readFile("worker/entry.ts", "utf8"),
  readFile("wrangler.jsonc", "utf8"),
  readFile(".github/workflows/deploy-live.yml", "utf8"),
  readFile("README.md", "utf8"),
  readFile("VERIFICATION.md", "utf8"),
  readFile("docs/READVERSE_PRODUCT_RULES.md", "utf8"),
  readFile("scripts/verify-notverse-live.mjs", "utf8"),
]);
const config = JSON.parse(configText);

assert.equal(config.name, "notverse", "canonical Cloudflare Worker name must remain notverse");
assert.equal(config.main, "worker/entry.ts", "canonical Worker entry must remain worker/entry.ts");
assert.equal(config.workers_dev, true, "canonical workers.dev production route must remain explicitly enabled");
assert.equal(config.preview_urls, true, "Cloudflare preview URLs must remain explicitly enabled for release proof");
assert.equal(config.assets?.run_worker_first, true, "Worker must run before static assets so HTTP / can redirect");
assert(
  entry.includes(`const PUBLIC_HOST = "${PUBLIC_HOST}";`),
  "canonical public hostname is not frozen in the Worker HTTPS policy",
);
assert.match(entry, /url\.protocol === "http:" && url\.hostname === PUBLIC_HOST/u, "HTTPS redirect must be scoped to plaintext requests on the canonical hostname");
assert.match(entry, /url\.protocol = "https:";[\s\S]*?Response\.redirect\(url\.toString\(\), 308\)/u, "canonical HTTP requests must receive a permanent 308 HTTPS redirect");

for (const [name, content] of [
  ["production deployment workflow", deployWorkflow],
  ["README production authority", readme],
  ["verification baseline", verification],
  ["canonical product rules", productRules],
  ["live production verifier", liveVerifier],
]) {
  assert(content.includes(PUBLIC_ORIGIN), `${name} does not reference the canonical NoTVerse production origin`);
  assert(!content.includes(RETIRED_HOST), `${name} still references the retired 1ink.online production hostname`);
}
assert(!entry.includes(RETIRED_HOST), "Worker HTTPS policy still references the retired 1ink.online hostname");

console.log("NoTVerse canonical HTTPS and production-origin policy verification passed.");
