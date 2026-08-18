import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const builtWorker = "dist/nancies_readverse/index.js";
const module = await import(`${pathToFileURL(builtWorker).href}?https-proof=${Date.now()}`);
const handler = module.default;
assert(handler && typeof handler.fetch === "function", "built NoTVerse Worker is not callable");

const env = {
  APP_NAME: "NoTVerse",
  AI_MODEL: "fixture",
  ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
  AI: { run: async () => ({ response: "fixture" }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

const redirected = await handler.fetch(
  new Request("http://notverse.1ink.online/notes?from=proof"),
  env,
  ctx,
);
assert.equal(redirected.status, 308, `canonical HTTP returned ${redirected.status}, expected 308`);
assert.equal(
  redirected.headers.get("location"),
  "https://notverse.1ink.online/notes?from=proof",
  "canonical redirect did not preserve path/query on HTTPS",
);

const local = await handler.fetch(new Request("http://127.0.0.1/"), env, ctx);
assert.equal(local.status, 200, "localhost HTTP was incorrectly forced through the public-host redirect");
assert.equal(await local.text(), "asset", "localhost request no longer delegates to the base Worker/assets path");

const secure = await handler.fetch(new Request("https://notverse.1ink.online/"), env, ctx);
assert.equal(secure.status, 200, "canonical HTTPS request was incorrectly redirected or blocked");
assert.equal(await secure.text(), "asset", "canonical HTTPS request no longer delegates normally");

console.log("Built NoTVerse Worker HTTPS redirect proof passed.");
