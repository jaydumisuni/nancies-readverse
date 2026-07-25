interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  LIBRARY_FILES: R2Bucket;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
}

type CompanionBody = { question?: unknown; companion?: unknown; vibe?: unknown };
type ImportBody = { url?: unknown; title?: unknown };
type ProgressBody = { locator?: unknown; percentage?: unknown };

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_FORMATS = new Map([
  ["application/pdf", "pdf"],
  ["application/epub+zip", "epub"],
  ["application/zip", "cbz"],
  ["text/plain", "txt"],
]);

const personalityGuides: Record<string, string> = {
  Gojo: "playful, quick-witted, confident, gently teasing and protective",
  Itachi: "calm, observant, emotionally restrained, precise and quietly protective",
  Naruto: "warm, energetic, loyal, encouraging and cheerfully chaotic",
  Kakashi: "relaxed, clever, mature, concise and dryly funny",
  Megumi: "reserved, thoughtful, direct, practical and quietly caring",
  Sasuke: "intense, guarded, decisive, restrained and attentive",
  Maki: "strong, blunt, practical, protective and dryly funny",
  Nobara: "bold, stylish, expressive, sassy, fearless and supportive",
  Hinata: "gentle, warm, attentive, softly encouraging and quietly brave",
  Sakura: "caring, practical, confident, lively and no-nonsense",
  Temari: "strategic, composed, sharp, efficient and sarcastically funny",
  "Mei Mei": "elegant, calm, observant, calculating and subtly mischievous",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") return handleHealth(env);
    if (url.pathname === "/api/companion/help") return handleCompanion(request, env, ctx);
    if (url.pathname === "/api/library" && request.method === "GET") return listLibrary(env);
    if (url.pathname === "/api/library/upload" && request.method === "POST") return uploadLibraryFile(request, env);
    if (url.pathname === "/api/library/import-url" && request.method === "POST") return importFromUrl(request, env);

    const fileMatch = url.pathname.match(/^\/api\/library\/([^/]+)\/file$/);
    if (fileMatch && request.method === "GET") return serveLibraryFile(decodeURIComponent(fileMatch[1]), request, env);

    const progressMatch = url.pathname.match(/^\/api\/library\/([^/]+)\/progress$/);
    if (progressMatch && request.method === "PUT") return saveProgress(decodeURIComponent(progressMatch[1]), request, env);

    const itemMatch = url.pathname.match(/^\/api\/library\/([^/]+)$/);
    if (itemMatch && request.method === "DELETE") return deleteLibraryItem(decodeURIComponent(itemMatch[1]), env);

    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleHealth(env: Env): Promise<Response> {
  let database = "unknown";
  try {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    database = result?.ok === 1 ? "ready" : "unavailable";
  } catch {
    database = "unavailable";
  }
  return json({
    ok: true,
    app: env.APP_NAME,
    status: "reader-ready",
    bindings: { d1: database, kv: "configured", r2: "configured", ai: "configured" },
    timestamp: new Date().toISOString(),
  });
}

async function listLibrary(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT l.id, l.title, l.creator, l.format, l.file_key, l.added_at,
           COALESCE(p.locator, 'page:1') AS locator,
           COALESCE(p.percentage, 0) AS percentage
    FROM library_items l
    LEFT JOIN reading_progress p ON p.item_id = l.id
    ORDER BY l.added_at DESC
  `).all();
  return json({ ok: true, items: result.results });
}

async function uploadLibraryFile(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "Choose a file to upload" }, 400);
  if (file.size === 0) return json({ ok: false, error: "The file is empty" }, 400);
  if (file.size > MAX_FILE_BYTES) return json({ ok: false, error: "Files must be 50 MB or smaller" }, 413);

  const format = detectFormat(file.type, file.name);
  if (!format) return json({ ok: false, error: "Supported formats: PDF, EPUB, CBZ and TXT" }, 415);

  const id = crypto.randomUUID();
  const key = `library/${id}/${safeFilename(file.name)}`;
  await env.LIBRARY_FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || mimeForFormat(format), contentDisposition: `inline; filename="${safeFilename(file.name)}"` },
    customMetadata: { originalName: file.name, itemId: id },
  });

  const titleValue = form.get("title");
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim() : stripExtension(file.name);
  await insertLibraryItem(env, { id, title, format, key, sourceUrl: null });
  return json({ ok: true, item: { id, title, format, fileUrl: `/api/library/${id}/file` } }, 201);
}

async function importFromUrl(request: Request, env: Env): Promise<Response> {
  let body: ImportBody;
  try { body = await request.json() as ImportBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  if (typeof body.url !== "string") return json({ ok: false, error: "Enter a valid URL" }, 400);
  let source: URL;
  try { source = new URL(body.url); }
  catch { return json({ ok: false, error: "Enter a valid URL" }, 400); }
  if (!['http:', 'https:'].includes(source.protocol)) return json({ ok: false, error: "Only HTTP and HTTPS links are supported" }, 400);

  const response = await fetch(source.toString(), { redirect: "follow", headers: { "user-agent": "NancysReadVerse/1.0" } });
  if (!response.ok || !response.body) return json({ ok: false, error: `Could not download that file (${response.status})` }, 400);

  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_FILE_BYTES) return json({ ok: false, error: "Remote file is larger than 50 MB" }, 413);

  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
  const filename = filenameFromResponse(response, source);
  const format = detectFormat(contentType, filename);
  if (!format) return json({ ok: false, error: "The link must point directly to a PDF, EPUB, CBZ or TXT file" }, 415);

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) return json({ ok: false, error: "Remote file is larger than 50 MB" }, 413);

  const id = crypto.randomUUID();
  const key = `library/${id}/${safeFilename(filename)}`;
  await env.LIBRARY_FILES.put(key, bytes, {
    httpMetadata: { contentType: contentType || mimeForFormat(format), contentDisposition: `inline; filename="${safeFilename(filename)}"` },
    customMetadata: { originalName: filename, itemId: id, sourceUrl: source.toString() },
  });

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : stripExtension(filename);
  await insertLibraryItem(env, { id, title, format, key, sourceUrl: source.toString() });
  return json({ ok: true, item: { id, title, format, fileUrl: `/api/library/${id}/file` } }, 201);
}

async function insertLibraryItem(env: Env, item: { id: string; title: string; format: string; key: string; sourceUrl: string | null }) {
  await env.DB.prepare(`
    INSERT INTO library_items (id, kind, title, source_item_url, format, file_key, saved_file)
    VALUES (?, 'book', ?, ?, ?, ?, 1)
  `).bind(item.id, item.title, item.sourceUrl, item.format, item.key).run();
  await env.DB.prepare(`INSERT OR REPLACE INTO reading_progress (item_id, locator, percentage, completed) VALUES (?, 'page:1', 0, 0)`)
    .bind(item.id).run();
}

async function serveLibraryFile(id: string, request: Request, env: Env): Promise<Response> {
  const item = await env.DB.prepare("SELECT file_key, format, title FROM library_items WHERE id = ?").bind(id).first<{ file_key: string; format: string; title: string }>();
  if (!item?.file_key) return json({ ok: false, error: "Book not found" }, 404);

  const object = await env.LIBRARY_FILES.get(item.file_key, { range: request.headers });
  if (!object) return json({ ok: false, error: "Stored file is missing" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("accept-ranges", "bytes");
  headers.set("content-type", headers.get("content-type") || mimeForFormat(item.format));
  headers.set("content-disposition", `inline; filename="${safeFilename(item.title)}.${item.format}"`);
  if (object.range) {
    headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    headers.set("content-length", String(object.range.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}

async function saveProgress(id: string, request: Request, env: Env): Promise<Response> {
  let body: ProgressBody;
  try { body = await request.json() as ProgressBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const locator = typeof body.locator === "string" ? body.locator.slice(0, 200) : "page:1";
  const percentage = typeof body.percentage === "number" ? Math.min(100, Math.max(0, body.percentage)) : 0;
  await env.DB.prepare(`
    INSERT INTO reading_progress (item_id, locator, percentage, completed, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(item_id) DO UPDATE SET locator = excluded.locator, percentage = excluded.percentage,
      completed = excluded.completed, updated_at = CURRENT_TIMESTAMP
  `).bind(id, locator, percentage, percentage >= 100 ? 1 : 0).run();
  return json({ ok: true, locator, percentage });
}

async function deleteLibraryItem(id: string, env: Env): Promise<Response> {
  const item = await env.DB.prepare("SELECT file_key FROM library_items WHERE id = ?").bind(id).first<{ file_key: string }>();
  if (!item) return json({ ok: false, error: "Book not found" }, 404);
  if (item.file_key) await env.LIBRARY_FILES.delete(item.file_key);
  await env.DB.prepare("DELETE FROM library_items WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function handleCompanion(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: CompanionBody;
  try { body = await request.json() as CompanionBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";
  const customVibe = typeof body.vibe === "string" ? body.vibe.slice(0, 180) : "";
  if (!question || question.length > 1000) return json({ ok: false, error: "Question must be between 1 and 1000 characters" }, 400);

  const personality = personalityGuides[companion] ?? personalityGuides.Gojo;
  const fallback = `I can help you choose, upload and read books in Nancy's ReadVerse. Open Library to upload a file or import a direct file link.`;
  try {
    const result = await env.AI.run(env.AI_MODEL as keyof AiModels, {
      messages: [
        { role: "system", content: `You are the ${companion}-inspired reading companion in Nancy's ReadVerse. Use broad traits only: ${personality}. ${customVibe}. Be concise, helpful, spoiler-aware and honest. Never claim an action succeeded without a result.` },
        { role: "user", content: question },
      ],
      max_tokens: 240,
      temperature: 0.68,
    });
    return json({ ok: true, answer: extractText(result) || fallback, mode: "workers-ai", companion });
  } catch (error) {
    ctx.waitUntil(Promise.resolve(console.warn("Workers AI fallback", error)));
    return json({ ok: true, answer: fallback, mode: "rules", companion });
  }
}

function detectFormat(contentType: string, filename: string): string | null {
  const normalized = contentType.toLowerCase();
  if (ALLOWED_FORMATS.has(normalized)) return ALLOWED_FORMATS.get(normalized)!;
  const ext = filename.toLowerCase().split('.').pop();
  return ext && ['pdf', 'epub', 'cbz', 'txt'].includes(ext) ? ext : null;
}
function mimeForFormat(format: string): string {
  return ({ pdf: "application/pdf", epub: "application/epub+zip", cbz: "application/zip", txt: "text/plain; charset=utf-8" } as Record<string, string>)[format] || "application/octet-stream";
}
function safeFilename(name: string): string { return name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160) || "book"; }
function stripExtension(name: string): string { return name.replace(/\.[^.]+$/, "").trim() || "Untitled book"; }
function filenameFromResponse(response: Response, source: URL): string {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/\"/g, "").trim()) : source.pathname.split('/').pop() || "imported-book";
}
function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.text === "string") return record.text.trim();
  return "";
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
