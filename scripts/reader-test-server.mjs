import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../dist/client/", import.meta.url).pathname;
const samplePdf = new URL("../public/fixtures/sample.pdf", import.meta.url).pathname;
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".json": "application/json; charset=utf-8",
};

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, value, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (url.pathname === "/api/source/resolve" && request.method === "POST") {
      const input = JSON.parse(await body(request));
      const sourceUrl = String(input.url || "");
      sendJson(response, {
        ok: true,
        source: {
          sourceUrl,
          directUrl: sourceUrl.replace(/[?&](utm_[^=]+|campaign)=[^&]*/gi, "").replace(/[?&]$/, ""),
          title: "Resolved source proof.pdf",
          format: "pdf",
          streamUrl: "/api/source/stream?proof=1",
          temporary: true,
        },
      });
      return;
    }
    if (url.pathname === "/api/source/stream") {
      const bytes = await readFile(samplePdf);
      response.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": String(bytes.length),
        "x-readverse-storage": "temporary-stream",
        "cache-control": "no-store",
      });
      response.end(bytes);
      return;
    }
    if (url.pathname === "/api/companion/help" && request.method === "POST") {
      sendJson(response, { answer: "The reader is ready. Real pages first, theatrics second.", mode: "test" });
      return;
    }

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
    response.writeHead(200, {
      "content-type": mime[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(bytes);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.stack : String(error));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`ReadVerse reader test server listening on ${port}`);
});
