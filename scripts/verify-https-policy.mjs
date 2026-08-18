import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const entry = await readFile("worker/entry.ts", "utf8");
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));

assert.equal(config.main, "worker/entry.ts", "canonical Worker entry must remain worker/entry.ts");
assert.equal(config.assets?.run_worker_first, true, "Worker must run before static assets so HTTP / can redirect");
assert.match(entry, /const PUBLIC_HOST = "notverse\.1ink\.online";/u, "canonical public hostname is not frozen in the HTTPS policy");
assert.match(entry, /url\.protocol === "http:" && url\.hostname === PUBLIC_HOST/u, "HTTPS redirect must be scoped to plaintext requests on the canonical hostname");
assert.match(entry, /url\.protocol = "https:";[\s\S]*?Response\.redirect\(url\.toString\(\), 308\)/u, "canonical HTTP requests must receive a permanent 308 HTTPS redirect");

console.log("NoTVerse canonical HTTPS policy verification passed.");
