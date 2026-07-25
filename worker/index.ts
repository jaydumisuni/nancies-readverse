interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
}

type ChatTurn = { role?: unknown; text?: unknown };
type CompanionBody = {
  question?: unknown;
  companion?: unknown;
  vibe?: unknown;
  history?: unknown;
};
type ResolveBody = { url?: unknown };

type ResolvedSource = {
  sourceUrl: string;
  directUrl: string;
  title: string;
  format: string;
  contentType: string;
};

const MAX_REMOTE_BYTES = 80 * 1024 * 1024;
const SUPPORTED_FORMATS = ["pdf", "epub", "cbz", "txt"] as const;

const personalityGuides: Record<string, string> = {
  Gojo: "playful, flamboyantly confident, quick-witted, lightly teasing, protective, energetic and never cruel",
  Itachi: "calm, economical with words, observant, emotionally restrained, precise, loyal and quietly reassuring",
  Naruto: "warm, loud-hearted, optimistic, loyal, encouraging, impulsively funny and persistent",
  Kakashi: "relaxed, mature, perceptive, dryly funny, concise, gently evasive and dependable",
  Megumi: "reserved, thoughtful, practical, direct, quietly caring, skeptical of noise and never performative",
  Sasuke: "intense, guarded, decisive, terse, attentive, competitive and never needlessly insulting",
  Maki: "strong, blunt, pragmatic, protective, disciplined, dryly funny and allergic to excuses",
  Nobara: "bold, stylish, expressive, sassy, fearless, supportive and sharply opinionated",
  Hinata: "gentle, warm, attentive, softly encouraging, patient, quietly brave and never patronising",
  Sakura: "caring, practical, confident, lively, medically sensible, no-nonsense and willing to challenge bad habits",
  Temari: "strategic, composed, efficient, sharp, confident, sarcastically funny and solution-focused",
  "Mei Mei": "elegant, composed, observant, calculating, efficient, subtly mischievous and careful with time",
};

const fallbackVoices: Record<string, (question: string) => string> = {
  Gojo: (q) => `Easy. ${readingAnswer(q)} Try to look impressed; I put effort into making that look effortless.`,
  Itachi: (q) => `${readingAnswer(q)} Move carefully, verify the source, and keep only what you deliberately choose.`,
  Naruto: (q) => `${readingAnswer(q)} We’ll get it open. One clean step at a time—no giving up halfway.`,
  Kakashi: (q) => `${readingAnswer(q)} Surprisingly responsible, I know.`,
  Megumi: (q) => `${readingAnswer(q)} It is the least noisy path, which is usually the right one.`,
  Sasuke: (q) => `${readingAnswer(q)} Use the direct path. Ignore the distractions.`,
  Maki: (q) => `${readingAnswer(q)} No fake success messages. It works or it does not.`,
  Nobara: (q) => `${readingAnswer(q)} Clean, useful, and no ugly ad circus. Correct priorities.`,
  Hinata: (q) => `${readingAnswer(q)} Nothing is saved unless you choose it, so you stay in control.`,
  Sakura: (q) => `${readingAnswer(q)} Check the file type and source first. We are not feeding broken files to the reader.`,
  Temari: (q) => `${readingAnswer(q)} Efficient: resolve, verify, stream, then save only on command.`,
  "Mei Mei": (q) => `${readingAnswer(q)} Temporary access first; permanent storage only when it is worth the cost.`,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        app: env.APP_NAME,
        status: "transient-reader",
        storage: "no permanent Cloudflare copies",
        timestamp: new Date().toISOString(),
      });
    }
    if (url.pathname === "/api/companion/help") return handleCompanion(request, env, ctx);
    if (url.pathname === "/api/source/resolve") return resolveSourceRequest(request);
    if (url.pathname === "/api/source/stream") return streamSourceRequest(request);
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleCompanion(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: CompanionBody;
  try { body = await request.json() as CompanionBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";
  const customVibe = typeof body.vibe === "string" ? body.vibe.slice(0, 180) : "";
  if (!question || question.length > 1200) return json({ ok: false, error: "Question must be between 1 and 1200 characters" }, 400);

  const history = normalizeHistory(body.history);
  const personality = personalityGuides[companion] ?? personalityGuides.Gojo;
  const fallback = (fallbackVoices[companion] ?? fallbackVoices.Gojo)(question);

  try {
    const result = await env.AI.run(env.AI_MODEL as keyof AiModels, {
      messages: [
        {
          role: "system",
          content:
            `You are the ${companion}-inspired reading companion selected in Nancy's ReadVerse. ` +
            `Use only broad personality traits: ${personality}. ${customVibe}. ` +
            "Maintain the same voice across the whole conversation. Do not claim to be the canonical copyrighted character, quote catchphrases, or reproduce copyrighted dialogue. " +
            "Be concise, useful, spoiler-aware and honest. Never claim that a file opened, a source resolved, a setting saved, or a Google action completed unless the client supplied a confirmed result. " +
            "ReadVerse keeps fetched files temporary. Permanent files, settings, notes and progress belong in the user's Google account only after explicit consent. " +
            "Do not suggest bypassing DRM, paywalls, authentication, CAPTCHAs or access controls. Ad and tracker removal is allowed only for content the user is permitted to access.",
        },
        ...history,
        { role: "user", content: question },
      ],
      max_tokens: 280,
      temperature: 0.72,
    });
    return json({ ok: true, answer: extractText(result) || fallback, mode: "workers-ai", companion });
  } catch (error) {
    ctx.waitUntil(Promise.resolve(console.warn("Workers AI fallback", error)));
    return json({ ok: true, answer: fallback, mode: "rules", companion });
  }
}

async function resolveSourceRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: ResolveBody;
  try { body = await request.json() as ResolveBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  if (typeof body.url !== "string") return json({ ok: false, error: "Enter a valid source URL" }, 400);
  let source: URL;
  try { source = validatePublicHttpUrl(new URL(body.url)); }
  catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Invalid URL" }, 400); }

  try {
    const resolved = await resolveSource(source);
    return json({
      ok: true,
      source: {
        sourceUrl: resolved.sourceUrl,
        directUrl: resolved.directUrl,
        title: resolved.title,
        format: resolved.format,
        streamUrl: `/api/source/stream?url=${encodeURIComponent(resolved.directUrl)}`,
        temporary: true,
      },
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Could not resolve that source" }, 422);
  }
}

async function streamSourceRequest(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ ok: false, error: "Method not allowed" }, 405);
  const requestUrl = new URL(request.url);
  const raw = requestUrl.searchParams.get("url");
  if (!raw) return json({ ok: false, error: "Missing source URL" }, 400);

  let source: URL;
  try { source = validatePublicHttpUrl(new URL(raw)); }
  catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Invalid URL" }, 400); }

  try {
    const upstream = await fetchWithSafeRedirects(source, {
      method: request.method,
      headers: sourceHeaders(request.headers.get("range")),
    });
    if (!upstream.ok || (request.method !== "HEAD" && !upstream.body)) {
      return json({ ok: false, error: `Source returned HTTP ${upstream.status}` }, 502);
    }

    const finalUrl = validatePublicHttpUrl(new URL(upstream.url || source.toString()));
    const contentType = cleanContentType(upstream.headers.get("content-type"));
    const filename = filenameFromResponse(upstream, finalUrl);
    const format = detectFormat(contentType, filename);
    if (!format) return json({ ok: false, error: "The resolved resource is not a supported reading file" }, 415);

    const length = Number(upstream.headers.get("content-length") || 0);
    if (length > MAX_REMOTE_BYTES) return json({ ok: false, error: "The source file is larger than 80 MB" }, 413);

    const headers = new Headers();
    headers.set("content-type", contentType || mimeForFormat(format));
    headers.set("content-disposition", `inline; filename="${safeFilename(filename)}"`);
    headers.set("cache-control", "no-store, private, max-age=0");
    headers.set("x-readverse-storage", "temporary-stream");
    headers.set("x-content-type-options", "nosniff");
    const range = upstream.headers.get("content-range");
    if (range) headers.set("content-range", range);
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) headers.set("accept-ranges", acceptRanges);
    if (length) headers.set("content-length", String(length));

    return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Could not stream that source" }, 502);
  }
}

async function resolveSource(source: URL): Promise<ResolvedSource> {
  const response = await fetchWithSafeRedirects(source, { method: "GET", headers: sourceHeaders() });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);

  const finalUrl = validatePublicHttpUrl(new URL(response.url || source.toString()));
  const contentType = cleanContentType(response.headers.get("content-type"));
  const filename = filenameFromResponse(response, finalUrl);
  const directFormat = detectFormat(contentType, filename);
  if (directFormat) {
    return {
      sourceUrl: source.toString(),
      directUrl: stripTracking(finalUrl).toString(),
      title: stripExtension(filename),
      format: directFormat,
      contentType: contentType || mimeForFormat(directFormat),
    };
  }

  if (!contentType.includes("text/html")) throw new Error("The link did not return a supported file or readable source page");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 2 * 1024 * 1024) throw new Error("The source page is too large to inspect safely");
  const html = (await response.text()).slice(0, 2 * 1024 * 1024);
  const candidates = extractFileCandidates(html, finalUrl);
  if (!candidates.length) {
    throw new Error("No accessible PDF, EPUB, CBZ or TXT file was found. Protected, login-only, DRM, CAPTCHA and paywalled sources are not bypassed.");
  }

  for (const candidate of candidates.slice(0, 20)) {
    try {
      const probe = await fetchWithSafeRedirects(candidate, { method: "HEAD", headers: sourceHeaders() });
      if (!probe.ok) continue;
      const candidateUrl = validatePublicHttpUrl(new URL(probe.url || candidate.toString()));
      const candidateType = cleanContentType(probe.headers.get("content-type"));
      const candidateName = filenameFromResponse(probe, candidateUrl);
      const format = detectFormat(candidateType, candidateName);
      if (!format) continue;
      const size = Number(probe.headers.get("content-length") || 0);
      if (size > MAX_REMOTE_BYTES) continue;
      return {
        sourceUrl: source.toString(),
        directUrl: stripTracking(candidateUrl).toString(),
        title: stripExtension(candidateName),
        format,
        contentType: candidateType || mimeForFormat(format),
      };
    } catch {
      // Try the next candidate. No source bytes are retained.
    }
  }

  throw new Error("The page contained file-like links, but none could be verified as an accessible supported file");
}

function extractFileCandidates(html: string, base: URL): URL[] {
  const urls: URL[] = [];
  const seen = new Set<string>();
  const patterns = [
    /(?:href|src|data-url|data-href|data-download)\s*=\s*["']([^"']+)["']/gi,
    /https?:\\?\/\\?\/[^\s"'<>]+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = (match[1] || match[0]).replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();
      if (!raw || raw.startsWith("javascript:") || raw.startsWith("data:")) continue;
      try {
        const candidate = validatePublicHttpUrl(new URL(raw, base));
        const path = candidate.pathname.toLowerCase();
        const hinted = SUPPORTED_FORMATS.some((ext) => path.endsWith(`.${ext}`)) || /(?:download|file|attachment|reader|document)/i.test(raw);
        if (!hinted) continue;
        const cleaned = stripTracking(candidate).toString();
        if (!seen.has(cleaned)) { seen.add(cleaned); urls.push(new URL(cleaned)); }
      } catch {
        // Ignore malformed or private candidates.
      }
    }
  }
  return urls;
}

async function fetchWithSafeRedirects(input: URL, init: RequestInit): Promise<Response> {
  let current = validatePublicHttpUrl(input);
  for (let count = 0; count < 6; count += 1) {
    const response = await fetch(current.toString(), { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("Source redirect had no destination");
    current = validatePublicHttpUrl(new URL(location, current));
  }
  throw new Error("Source redirected too many times");
}

function validatePublicHttpUrl(url: URL): URL {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS sources are supported");
  if (url.username || url.password) throw new Error("Source URLs cannot contain credentials");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Private or local network sources are not allowed");
  }
  if (/^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) {
    throw new Error("Private or local network sources are not allowed");
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    throw new Error("Private or local network sources are not allowed");
  }
  url.hash = "";
  return url;
}

function stripTracking(url: URL): URL {
  const clean = new URL(url.toString());
  const blocked = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|referrer$|source$|campaign$)/i;
  for (const key of [...clean.searchParams.keys()]) if (blocked.test(key)) clean.searchParams.delete(key);
  clean.hash = "";
  return clean;
}

function sourceHeaders(range?: string | null): Headers {
  const headers = new Headers({
    "user-agent": "Mozilla/5.0 (compatible; NancysReadVerse/1.0; +https://nancyreadverse.1ink.online)",
    "accept": "application/pdf,application/epub+zip,application/zip,text/plain,text/html;q=0.9,*/*;q=0.5",
    "accept-language": "en-US,en;q=0.8",
  });
  if (range) headers.set("range", range);
  return headers;
}

function normalizeHistory(value: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(value)) return [];
  const result: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of value.slice(-10) as ChatTurn[]) {
    const role = turn?.role === "user" ? "user" : turn?.role === "companion" || turn?.role === "assistant" ? "assistant" : null;
    const text = typeof turn?.text === "string" ? turn.text.trim().slice(0, 800) : "";
    if (role && text) result.push({ role, content: text });
  }
  return result;
}

function readingAnswer(question: string): string {
  const value = question.toLowerCase();
  if (/upload|file|pdf|epub|cbz/.test(value)) return "Open the file temporarily in this session first. It is not copied to Cloudflare; saving requires an explicit Google Drive action.";
  if (/link|source|url|ad/.test(value)) return "Paste the source link. ReadVerse can remove tracking parameters, ignore ad links, follow safe redirects and verify an accessible reading file without bypassing protected access.";
  if (/save|drive|setting|note|progress/.test(value)) return "Personal data belongs in the user's Google account. Until Google is connected, the current session must not pretend it saved permanently.";
  return "Tell me what you are trying to read, and I will help choose the cleanest temporary route without claiming anything was saved.";
}

function detectFormat(contentType: string, filename: string): string | null {
  const type = contentType.toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "application/epub+zip") return "epub";
  if (type === "text/plain") return "txt";
  const extension = filename.toLowerCase().split('.').pop() || "";
  return SUPPORTED_FORMATS.includes(extension as typeof SUPPORTED_FORMATS[number]) ? extension : null;
}

function cleanContentType(value: string | null): string {
  return (value || "").split(";")[0].trim().toLowerCase();
}

function mimeForFormat(format: string): string {
  return ({ pdf: "application/pdf", epub: "application/epub+zip", cbz: "application/zip", txt: "text/plain; charset=utf-8" } as Record<string, string>)[format] || "application/octet-stream";
}

function filenameFromResponse(response: Response, url: URL): string {
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) { try { return decodeURIComponent(encoded); } catch { /* continue */ } }
  const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  if (plain) return plain.trim();
  return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || "readverse-file");
}

function safeFilename(value: string): string {
  return value.replace(/[\r\n"\\/<>:*?|]+/g, "_").slice(0, 180) || "readverse-file";
}

function stripExtension(value: string): string {
  return value.replace(/\.(pdf|epub|cbz|txt)$/i, "") || "Untitled";
}

function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.text === "string") return record.text.trim();
  return "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
