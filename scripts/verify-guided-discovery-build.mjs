import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function text(path) {
  return readFile(path, "utf8");
}

const [app, reader, styles, workerSource, wranglerSource] = await Promise.all([
  text("src/App.tsx"),
  text("src/reader/PdfBookReader.tsx"),
  text("src/styles.css"),
  text("worker/index.ts"),
  text("wrangler.jsonc"),
]);

const sourceChecks = [
  [app.includes("type DiscoveryCandidate ="), "discovery candidate model is missing"],
  [app.includes("sourceCard?: SourceCard"), "source result cards are not wired into chat"],
  [app.includes("Prepare to read"), "confirm-before-prepare action is missing"],
  [app.includes("Open and read"), "confirm-before-open action is missing"],
  [app.includes("Verified public source"), "source preparation stages are missing"],
  [app.includes("Not this one"), "candidate/source rejection action is missing"],
  [app.includes("Add to Library"), "reader library action is missing from App"],
  [reader.includes("Add to Library"), "physical PDF reader library action is missing"],
  [styles.includes(".source-result-card"), "source result card styling is missing"],
  [styles.includes(".discovery-results-card"), "memory discovery card styling is missing"],
  [styles.includes(".reader-add-library"), "reader library styling is missing"],
  [workerSource.includes("/api/discovery/search"), "discovery search endpoint is missing"],
  [workerSource.includes("/api/discovery/source"), "discovery source endpoint is missing"],
  [workerSource.includes("id: sourceId(resolved)"), "direct verified sources do not receive a stable identity"],
];
for (const [condition, message] of sourceChecks) assert(condition, message);

const workerName = JSON.parse(wranglerSource).name;
assert(workerName, "wrangler.jsonc does not define the Worker name");
const builtWorker = `dist/${workerName.replaceAll("-", "_")}/index.js`;
await stat(builtWorker);
const module = await import(`${pathToFileURL(builtWorker).href}?verification=${Date.now()}`);
const handler = module.default;
assert(handler && typeof handler.fetch === "function", "built Worker default export is not callable");

const originalFetch = globalThis.fetch;
const fixturePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url === "https://fixture.notverse.test/book.pdf") {
    return new Response(init.method === "HEAD" ? null : fixturePdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(fixturePdf.byteLength),
        "content-disposition": "inline; filename=\"Fixture Book.pdf\"",
        "accept-ranges": "bytes",
      },
    });
  }
  if (url.startsWith("https://www.googleapis.com/books/v1/volumes")) {
    return Response.json({
      items: [{
        id: "fixture-book",
        volumeInfo: {
          title: "Rich Dad Poor Dad",
          authors: ["Robert Kiyosaki"],
          publishedDate: "1997",
          description: "A personal finance book contrasting two approaches to money.",
          language: "en",
          imageLinks: { thumbnail: "https://fixture.notverse.test/cover.jpg" },
        },
        accessInfo: { accessViewStatus: "NONE" },
      }],
    });
  }
  if (url.startsWith("https://openlibrary.org/search.json")) {
    return Response.json({ docs: [] });
  }
  throw new Error(`Unexpected verification fetch: ${url}`);
};

const env = {
  APP_NAME: "NoTVerse",
  AI_MODEL: "fixture-model",
  ASSETS: { fetch: async () => new Response("asset") },
  AI: { run: async () => ({ response: "fixture" }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function call(path, body) {
  const response = await handler.fetch(new Request(`https://notverse.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env, ctx);
  return { response, body: await response.json() };
}

try {
  const greeting = await call("/api/companion/help", {
    question: "hi",
    companion: "Gojo",
    vibe: "playful and attentive",
    history: [],
  });
  assert(greeting.response.ok && greeting.body.ok, "normal greeting route failed");
  assert(typeof greeting.body.answer === "string" && /here|hey|welcome/i.test(greeting.body.answer), "greeting is generic or empty");

  const resolved = await call("/api/source/resolve", { url: "https://fixture.notverse.test/book.pdf" });
  assert(resolved.response.ok && resolved.body.ok, "direct source resolution failed");
  assert(/^source-[a-z0-9]+$/i.test(resolved.body.source?.id || ""), "direct source has no stable ID");
  assert(resolved.body.source?.format === "pdf", "direct source format was not detected as PDF");
  assert(resolved.body.source?.temporary === true, "resolved source is not marked temporary");
  assert(typeof resolved.body.source?.streamUrl === "string" && resolved.body.source.streamUrl.startsWith("/api/source/stream"), "temporary stream URL is missing");

  const discovery = await call("/api/discovery/search", {
    query: "a book about a rich father and a poor father and money",
    exclude: [],
  });
  assert(discovery.response.ok && discovery.body.ok, "memory/title discovery route failed");
  assert(Array.isArray(discovery.body.candidates) && discovery.body.candidates.length > 0, "memory/title discovery returned no candidates");
  assert(discovery.body.candidates[0].title === "Rich Dad Poor Dad", "discovery did not return the expected strongest candidate");

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "canonical UI source preserved",
      "normal companion greeting",
      "direct source verification",
      "stable source identity",
      "temporary stream handoff",
      "memory/title discovery",
      "confirm-before-open controls",
      "Add to Library controls",
    ],
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
}
