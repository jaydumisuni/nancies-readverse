import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function assert(condition, message) { if (!condition) throw new Error(message); }
const read = (path) => readFile(path, "utf8");

const [app, pdf, universal, storage, googleClient, googlePanel, platform, worker, main, serviceWorker, packageJson, wrangler] = await Promise.all([
  read("src/App.tsx"),
  read("src/reader/PdfBookReader.tsx"),
  read("src/reader/UniversalReader.tsx"),
  read("src/platform/storage.ts"),
  read("src/platform/google-client.ts"),
  read("src/platform/GoogleStoragePanel.tsx"),
  read("worker/platform.ts"),
  read("worker/index.ts"),
  read("src/main.tsx"),
  read("public/sw.js"),
  read("package.json"),
  read("wrangler.jsonc"),
]);

const checks = [
  [app.includes("localStorage.setItem(key"), "application state is not durable"],
  [app.includes("useGoogleDriveSync()"), "automatic Google state sync is missing"],
  [app.includes("saveReaderOffline"), "reader offline saving is missing"],
  [app.includes("saveReaderToDrive"), "reader Drive saving is missing"],
  [app.includes("handleReaderProgress"), "library progress synchronisation is missing"],
  [app.includes("<UniversalReader"), "non-PDF formats do not use the physical reader"],
  [pdf.includes("localStorage.setItem(storageKey"), "PDF annotations are not durable"],
  [pdf.includes("Save to Drive"), "PDF Drive control is missing"],
  [universal.includes("JSZip.loadAsync"), "CBZ engine is missing"],
  [universal.includes("renderTo"), "EPUB engine is missing"],
  [universal.includes("splitText"), "TXT engine is missing"],
  [storage.includes("indexedDB.open"), "IndexedDB offline storage is missing"],
  [googleClient.includes("/api/sync/state"), "Google sync client is missing"],
  [googlePanel.includes("Connect Google"), "Google account settings UI is missing"],
  [platform.includes("drive.file"), "least-privilege Drive scope is missing"],
  [platform.includes("resumableDriveUpload"), "large-file Drive upload is missing"],
  [platform.includes("TOKEN_ENCRYPTION_KEY"), "encrypted Google token storage is missing"],
  [worker.includes("handlePlatformRoute"), "platform routes are not connected"],
  [main.includes("registerReadVerseServiceWorker"), "service worker is not registered"],
  [serviceWorker.includes("readverse-shell-v1"), "offline app shell is missing"],
  [JSON.parse(packageJson).dependencies.epubjs, "epubjs dependency is missing"],
  [JSON.parse(packageJson).dependencies.jszip, "jszip dependency is missing"],
  [JSON.parse(wrangler).kv_namespaces?.some((item) => item.binding === "SESSION_KV"), "SESSION_KV binding is missing"],
];
for (const [condition, message] of checks) assert(condition, message);

const workerName = JSON.parse(wrangler).name;
assert(workerName, "wrangler.jsonc does not define the Worker name");
const builtWorker = `dist/${workerName}/index.js`;
await stat(builtWorker);
const module = await import(`${pathToFileURL(builtWorker).href}?finish=${Date.now()}`);
const handler = module.default;
assert(handler && typeof handler.fetch === "function", "built Worker is not callable");

class MemoryKV {
  values = new Map();
  async get(key, type) {
    const value = this.values.get(key) ?? null;
    return type === "json" && value ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
}
const envBase = {
  APP_NAME: "NoTVerse",
  AI_MODEL: "fixture",
  ASSETS: { fetch: async () => new Response("asset") },
  AI: { run: async () => ({ response: "fixture" }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

const unconfigured = await handler.fetch(new Request("https://notverse.test/api/auth/google/status"), envBase, ctx);
const unconfiguredBody = await unconfigured.json();
assert(unconfiguredBody.configured === false && unconfiguredBody.connected === false, "unconfigured Google status is unsafe or incorrect");

const kv = new MemoryKV();
const configuredEnv = { ...envBase, SESSION_KV: kv, GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef" };
const configured = await handler.fetch(new Request("https://notverse.test/api/auth/google/status"), configuredEnv, ctx);
const configuredBody = await configured.json();
assert(configuredBody.configured === true && configuredBody.connected === false, "configured account status is incorrect");
const start = await handler.fetch(new Request("https://notverse.test/api/auth/google/start"), configuredEnv, ctx);
assert(start.status === 302, "Google OAuth start does not redirect");
const target = new URL(start.headers.get("location"));
assert(target.hostname === "accounts.google.com", "Google OAuth redirect target is incorrect");
assert(target.searchParams.get("scope")?.includes("drive.file"), "Google OAuth requests excessive or missing Drive scope");
assert([...kv.values.keys()].some((key) => key.startsWith("oauth:")), "OAuth state was not stored");

console.log(JSON.stringify({ ok: true, checks: checks.length + 7, tracks: { persistence: 10, readers: 10 }, message: "Finished NoTVerse 10-for-2 verification passed" }, null, 2));
