import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import worker from "../dist/nancies_readverse/index.js";

const root = new URL("../dist/client/", import.meta.url).pathname;
const port = Number(process.env.PORT || 8787);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".json": "application/json; charset=utf-8",
};

async function nodeBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function assetFetch(request) {
  const url = new URL(request.url);
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!relative) relative = "index.html";
  const safe = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safe);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(root, "index.html");
  }
  const bytes = await readFile(filePath);
  return new Response(bytes, {
    headers: {
      "content-type": mime[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}

const env = {
  APP_NAME: "Nancy's ReadVerse test",
  AI_MODEL: "test-model",
  ASSETS: { fetch: assetFetch },
  AI: { run: async () => { throw new Error("AI intentionally unavailable in deterministic test"); } },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

createServer(async (incoming, outgoing) => {
  try {
    const body = incoming.method === "GET" || incoming.method === "HEAD" ? undefined : await nodeBody(incoming);
    const request = new Request(`http://127.0.0.1:${port}${incoming.url || "/"}`, {
      method: incoming.method,
      headers: incoming.headers,
      body,
    });
    const response = await worker.fetch(request, env, ctx);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (incoming.method === "HEAD" || !response.body) {
      outgoing.end();
      return;
    }
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end(error instanceof Error ? error.stack : String(error));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Compiled ReadVerse worker test server listening on ${port}`);
});
