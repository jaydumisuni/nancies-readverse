import { handlePlatformRoute } from "./platform";

interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
  SESSION_KV?: KVNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  TOKEN_ENCRYPTION_KEY?: string;
}

type ChatTurn = { role?: unknown; text?: unknown };
type CompanionBody = {
  question?: unknown;
  companion?: unknown;
  vibe?: unknown;
  history?: unknown;
};
type ResolveBody = { url?: unknown };
type DiscoveryBody = { query?: unknown; exclude?: unknown };
type DiscoverySourceBody = { candidate?: unknown };

type DiscoveryCandidate = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  cover?: string;
  description?: string;
  whyMatch: string;
  provider: string;
  language?: string;
  downloadUrl?: string;
  identifiers?: Record<string, string>;
};

type ResolvedSource = {
  sourceUrl: string;
  directUrl: string;
  title: string;
  format: string;
  contentType: string;
  sizeBytes?: number;
  author?: string;
  language?: string;
  cover?: string;
  provider?: string;
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const platformResponse = await handlePlatformRoute(request, env);
    if (platformResponse) return platformResponse;

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
    if (url.pathname === "/api/discovery/search") return handleDiscoverySearch(request);
    if (url.pathname === "/api/discovery/source") return handleDiscoverySource(request);
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
  const deterministic = quickConversation(question, companion, history);
  if (deterministic) return json({ ok: true, answer: deterministic, mode: "conversation-router", companion });
  const fallback = conversationalFallback(question, companion, history);

  try {
    const result = await env.AI.run(env.AI_MODEL as keyof AiModels, {
      messages: [
        {
          role: "system",
          content:
            `You are the ${companion}-inspired reading companion selected in NoTVerse. ` +
            `Use only broad personality traits: ${personality}. ${customVibe}. ` +
            "Maintain the same voice across the whole conversation. Do not claim to be the canonical copyrighted character, quote catchphrases, or reproduce copyrighted dialogue. " +
            "Hold a normal human conversation first. Reply naturally to greetings, jokes, acknowledgements and follow-up messages. Use the recent conversation to resolve words like it, that, yes and go ahead. Do not reset to a generic product description. " +
            "When the user supplies a source URL, the client tests it; do not pretend you tested it yourself. Never claim that a file opened, a source resolved, a setting saved, or a Google action completed unless the client supplied a confirmed result. " +
            "NoTVerse keeps fetched files temporary. Permanent files, settings, notes and progress belong in the user's Google account only after explicit consent. " +
            "Do not provide instructions to defeat DRM, paywalls, authentication, CAPTCHAs or access controls. Only mention this restriction when it is actually relevant; never inject it into greetings or ordinary conversation. " +
            "Be concise, useful, spoiler-aware, context-aware and honest. Avoid repeating the same sentence structure or signature line in consecutive replies.",
        },
        ...history,
        { role: "user", content: question },
      ],
      max_tokens: 360,
      temperature: 0.78,
    });
    return json({ ok: true, answer: extractText(result) || fallback, mode: "workers-ai", companion });
  } catch (error) {
    ctx.waitUntil(Promise.resolve(console.warn("Workers AI fallback", error)));
    return json({ ok: true, answer: fallback, mode: "rules", companion });
  }
}

async function handleDiscoverySearch(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: DiscoveryBody;
  try { body = await request.json() as DiscoveryBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 500) : "";
  const excluded = new Set(Array.isArray(body.exclude) ? body.exclude.filter((item): item is string => typeof item === "string") : []);
  if (query.length < 3) return json({ ok: false, error: "Give me at least one useful clue" }, 400);

  const [google, openLibrary] = await Promise.allSettled([
    searchGoogleBooks(query),
    searchOpenLibrary(query),
  ]);
  const candidates = [
    ...(google.status === "fulfilled" ? google.value : []),
    ...(openLibrary.status === "fulfilled" ? openLibrary.value : []),
  ];
  const deduped = dedupeDiscovery(candidates)
    .filter((item) => !excluded.has(item.id))
    .sort((a, b) => discoveryScore(b, query) - discoveryScore(a, query))
    .slice(0, 6);

  if (!deduped.length) {
    const failed = [google, openLibrary].filter((item) => item.status === "rejected").length;
    return json({
      ok: false,
      reason: failed === 2
        ? "The discovery providers were unreachable, so I could not verify any candidates."
        : "I searched the available catalogues but none matched those clues strongly enough.",
      next: ["Add a character, author, cover colour, year, language, setting, or one word from the title."],
    }, 404);
  }
  return json({ ok: true, query, candidates: deduped, providers: ["Google Books", "Open Library"] });
}

async function handleDiscoverySource(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: DiscoverySourceBody;
  try { body = await request.json() as DiscoverySourceBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const candidate = normalizeDiscoveryCandidate(body.candidate);
  if (!candidate) return json({ ok: false, error: "Choose a valid discovery result" }, 400);

  const verified: ResolvedSource[] = [];
  if (candidate.downloadUrl) {
    try {
      const direct = await resolveSource(validatePublicHttpUrl(new URL(candidate.downloadUrl)));
      verified.push({ ...direct, author: candidate.authors[0], language: candidate.language, cover: candidate.cover, provider: candidate.provider });
    } catch {
      // Continue into public archive discovery.
    }
  }

  const archiveResults = await searchInternetArchive(candidate);
  const lanes = archiveResults.slice(0, 10).map((item) => verifyArchiveItem(item, candidate));
  const settled = await Promise.allSettled(lanes);
  for (const item of settled) {
    if (item.status === "fulfilled" && item.value) verified.push(item.value);
    if (verified.length >= 3) break;
  }
  const unique = dedupeSources(verified).slice(0, 3);
  if (!unique.length) {
    return json({
      ok: false,
      reason: `I identified “${candidate.title}”, but the public sources I checked did not expose a supported file that passed both metadata and live-file verification.`,
      next: ["Try another edition or language.", "Paste a source link you trust.", "Upload your own copy."],
    }, 404);
  }
  return json({
    ok: true,
    sources: unique.map((source) => ({
      sourceUrl: source.sourceUrl,
      directUrl: source.directUrl,
      title: source.title,
      format: source.format,
      streamUrl: `/api/source/stream?url=${encodeURIComponent(source.directUrl)}`,
      temporary: true,
      domain: new URL(source.sourceUrl).hostname.replace(/^www\./, ""),
      sizeBytes: source.sizeBytes,
      sizeLabel: source.sizeBytes ? formatBytes(source.sizeBytes) : undefined,
      contentType: source.contentType,
      author: source.author,
      language: source.language,
      cover: source.cover,
      provider: source.provider,
      verifiedAt: new Date().toISOString(),
      id: sourceId(source),
    })),
  });
}

async function searchGoogleBooks(query: string): Promise<DiscoveryCandidate[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("printType", "books");
  const data = await fetchJson(url) as { items?: Array<Record<string, any>> };
  return (data.items || []).map((item) => {
    const info = item.volumeInfo || {};
    const access = item.accessInfo || {};
    const downloadUrl = access?.pdf?.downloadLink || access?.epub?.downloadLink || undefined;
    return {
      id: `google:${item.id}`,
      title: String(info.title || "Untitled"),
      authors: Array.isArray(info.authors) ? info.authors.map(String) : [],
      year: parseYear(info.publishedDate),
      cover: cleanCover(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
      description: cleanDescription(info.description),
      whyMatch: "Matched against Google Books title, creator and description data.",
      provider: "Google Books",
      language: typeof info.language === "string" ? info.language : undefined,
      downloadUrl: access.accessViewStatus === "FULL_PUBLIC" ? downloadUrl : undefined,
      identifiers: Object.fromEntries((info.industryIdentifiers || []).map((entry: any) => [String(entry.type), String(entry.identifier)])),
    };
  });
}

async function searchOpenLibrary(query: string): Promise<DiscoveryCandidate[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i,edition_key,language,subject,isbn");
  const data = await fetchJson(url) as { docs?: Array<Record<string, any>> };
  return (data.docs || []).map((item) => ({
    id: `openlibrary:${String(item.key || item.edition_key?.[0] || item.title)}`,
    title: String(item.title || "Untitled"),
    authors: Array.isArray(item.author_name) ? item.author_name.map(String) : [],
    year: typeof item.first_publish_year === "number" ? item.first_publish_year : undefined,
    cover: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` : undefined,
    description: Array.isArray(item.subject) ? item.subject.slice(0, 5).join(" · ") : undefined,
    whyMatch: "Matched against Open Library title, author, year and subject data.",
    provider: "Open Library",
    language: Array.isArray(item.language) ? item.language[0] : undefined,
    identifiers: Array.isArray(item.isbn) && item.isbn[0] ? { ISBN: String(item.isbn[0]) } : undefined,
  }));
}

async function searchInternetArchive(candidate: DiscoveryCandidate): Promise<Array<Record<string, any>>> {
  const url = new URL("https://archive.org/advancedsearch.php");
  const creator = candidate.authors[0] ? ` AND creator:("${escapeArchive(candidate.authors[0])}")` : "";
  url.searchParams.set("q", `title:("${escapeArchive(candidate.title)}")${creator} AND mediatype:texts`);
  for (const field of ["identifier", "title", "creator", "year", "language", "collection"]) url.searchParams.append("fl[]", field);
  url.searchParams.set("rows", "10");
  url.searchParams.set("page", "1");
  url.searchParams.set("output", "json");
  const data = await fetchJson(url) as { response?: { docs?: Array<Record<string, any>> } };
  return data.response?.docs || [];
}

async function verifyArchiveItem(item: Record<string, any>, candidate: DiscoveryCandidate): Promise<ResolvedSource | null> {
  const identifier = typeof item.identifier === "string" ? item.identifier : "";
  if (!identifier) return null;
  const metadata = await fetchJson(new URL(`https://archive.org/metadata/${encodeURIComponent(identifier)}`)) as Record<string, any>;
  const meta = metadata.metadata || {};
  if (meta.private === "true" || meta.access_restricted_item === "true" || meta.is_dark === "true" || meta.noindex === "true") return null;
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const ranked = files
    .filter((file: any) => file && typeof file.name === "string" && !file.private)
    .map((file: any) => ({ file, format: detectFormat(String(file.format || ""), file.name) || detectFormat("", file.name) }))
    .filter((entry: any) => entry.format && Number(entry.file.size || 0) <= MAX_REMOTE_BYTES)
    .sort((a: any, b: any) => sourceFormatRank(a.format) - sourceFormatRank(b.format));
  for (const entry of ranked.slice(0, 6)) {
    const direct = new URL(`https://archive.org/download/${encodeURIComponent(identifier)}/${entry.file.name.split("/").map(encodeURIComponent).join("/")}`);
    try {
      const probe = await fetchWithSafeRedirects(direct, { method: "HEAD", headers: sourceHeaders() });
      if (!probe.ok) continue;
      const finalUrl = validatePublicHttpUrl(new URL(probe.url || direct.toString()));
      const contentType = cleanContentType(probe.headers.get("content-type"));
      const filename = filenameFromResponse(probe, finalUrl);
      const format = detectFormat(contentType, filename);
      if (!format) continue;
      const sizeBytes = Number(probe.headers.get("content-length") || entry.file.size || 0) || undefined;
      return {
        sourceUrl: `https://archive.org/details/${identifier}`,
        directUrl: stripTracking(finalUrl).toString(),
        title: String(meta.title || item.title || candidate.title),
        format,
        contentType: contentType || mimeForFormat(format),
        sizeBytes,
        author: stringValue(meta.creator) || candidate.authors[0],
        language: stringValue(meta.language) || candidate.language,
        cover: candidate.cover,
        provider: "Internet Archive",
      };
    } catch {
      // Second verifier failed; continue to the next file.
    }
  }
  return null;
}

function normalizeDiscoveryCandidate(value: unknown): DiscoveryCandidate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim().slice(0, 300) : "";
  if (!title) return null;
  return {
    id: typeof item.id === "string" ? item.id.slice(0, 300) : `candidate:${title}`,
    title,
    authors: Array.isArray(item.authors) ? item.authors.filter((author): author is string => typeof author === "string").slice(0, 8) : [],
    year: typeof item.year === "number" ? item.year : undefined,
    cover: typeof item.cover === "string" ? item.cover : undefined,
    description: typeof item.description === "string" ? item.description.slice(0, 600) : undefined,
    whyMatch: typeof item.whyMatch === "string" ? item.whyMatch.slice(0, 300) : "Selected by the reader.",
    provider: typeof item.provider === "string" ? item.provider.slice(0, 80) : "Discovery",
    language: typeof item.language === "string" ? item.language.slice(0, 40) : undefined,
    downloadUrl: typeof item.downloadUrl === "string" ? item.downloadUrl : undefined,
    identifiers: item.identifiers && typeof item.identifiers === "object" ? item.identifiers as Record<string, string> : undefined,
  };
}

function dedupeDiscovery(items: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalise(item.title)}|${normalise(item.authors[0] || "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function discoveryScore(item: DiscoveryCandidate, query: string): number {
  const tokens = tokenise(query);
  const haystack = normalise(`${item.title} ${item.authors.join(" ")} ${item.description || ""}`);
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  const titleBonus = tokens.filter((token) => normalise(item.title).includes(token)).length * 2;
  return matched + titleBonus + (item.cover ? 0.35 : 0) + (item.authors.length ? 0.25 : 0);
}

function dedupeSources(items: ResolvedSource[]): ResolvedSource[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = stripTracking(new URL(item.directUrl)).toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceId(source: ResolvedSource): string {
  let hash = 2166136261;
  for (const char of source.directUrl) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `source-${(hash >>> 0).toString(16)}`;
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url.toString(), {
    headers: { "user-agent": "NoTVerse/1.0", "accept": "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${url.hostname} returned HTTP ${response.status}`);
  return response.json();
}

function cleanCover(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/^http:/, "https:") : undefined;
}
function cleanDescription(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 260) : undefined;
}
function parseYear(value: unknown): number | undefined {
  const match = typeof value === "string" ? value.match(/\d{4}/) : null;
  return match ? Number(match[0]) : undefined;
}
function tokenise(value: string): string[] {
  return [...new Set(normalise(value).split(" ").filter((token) => token.length > 2 && !["the", "and", "book", "manga", "comic", "novel", "story", "about", "with", "that", "this"].includes(token)))];
}
function normalise(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
function escapeArchive(value: string): string {
  return value.replace(/["\\]/g, " ").slice(0, 180);
}
function sourceFormatRank(format: string): number {
  return ({ pdf: 0, epub: 1, cbz: 2, txt: 3 } as Record<string, number>)[format] ?? 9;
}
function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string" && Boolean(item.trim()))?.trim();
  return undefined;
}
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function extractMeta(html: string, name: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1]?.replace(/&amp;/g, "&").trim();
    if (value) return value.slice(0, 180);
  }
  return undefined;
}
function extractLanguage(html: string): string | undefined {
  return html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1]?.slice(0, 20);
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
        id: sourceId(resolved),
        sourceUrl: resolved.sourceUrl,
        directUrl: resolved.directUrl,
        title: resolved.title,
        format: resolved.format,
        streamUrl: `/api/source/stream?url=${encodeURIComponent(resolved.directUrl)}`,
        temporary: true,
        domain: new URL(resolved.sourceUrl).hostname.replace(/^www\./, ""),
        sizeBytes: resolved.sizeBytes,
        sizeLabel: resolved.sizeBytes ? formatBytes(resolved.sizeBytes) : undefined,
        contentType: resolved.contentType,
        author: resolved.author,
        language: resolved.language,
        cover: resolved.cover,
        provider: resolved.provider,
        verifiedAt: new Date().toISOString(),
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
      sizeBytes: Number(response.headers.get("content-length") || 0) || undefined,
    };
  }

  if (!contentType.includes("text/html")) throw new Error("The link did not return a supported file or readable source page");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 2 * 1024 * 1024) throw new Error("The source page is too large to inspect safely");
  const html = (await response.text()).slice(0, 2 * 1024 * 1024);
  const candidates = extractFileCandidates(html, finalUrl);
  if (!candidates.length) {
    throw new Error("No public PDF, EPUB, CBZ or TXT file was exposed by that page. It may require a login, a browser challenge, or a download action the server cannot verify.");
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
        sizeBytes: size || undefined,
        author: extractMeta(html, "author"),
        language: extractLanguage(html),
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
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS sources are supported");
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
    "user-agent": "Mozilla/5.0 (compatible; NoTVerse/1.0; +https://nancyreadverse.1ink.online)",
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

function companionFlourish(companion: string, line: string): string {
  const endings: Record<string, string> = {
    Gojo: " I was paying attention. Try not to look too surprised.",
    Itachi: " Quietly. Properly.",
    Naruto: " We have this.",
    Kakashi: " Efficient enough to be suspicious.",
    Megumi: " No unnecessary noise.",
    Sasuke: " That is the direct answer.",
    Maki: " Simple.",
    Nobara: " Standards maintained.",
    Hinata: " We can take it one step at a time.",
    Sakura: " Clear and checked.",
    Temari: " Efficient, as it should be.",
    "Mei Mei": " Worth the time.",
  };
  return line + (endings[companion] ?? "");
}

function quickConversation(
  question: string,
  companion: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string | null {
  const value = question.trim().toLowerCase();
  if (/^(hi|hey|hello|yo|sup|good morning|good afternoon|good evening)[.!?]*$/.test(value)) {
    return companionFlourish(companion, "Hey. I am here. How are you, and what are we doing today?");
  }
  if (/how are you|you good|what(?:'s| is) up/.test(value)) {
    return companionFlourish(companion, "I am good. More importantly, I am following the conversation. What is on your mind?");
  }
  if (/^(thanks|thank you|nice|cool|great|perfect)[.!?]*$/.test(value)) {
    return companionFlourish(companion, "You are welcome. Keep going.");
  }
  if (/what can you do|what are you capable of/.test(value)) {
    return companionFlourish(companion, "I can chat normally, help choose what to read, inspect a public source through NoTVerse, explain exact failures, and control the reading workflow.");
  }
  if (/^(yes|yeah|yep|okay|ok|go ahead|continue|do it)[.!?]*$/.test(value) && history.length) {
    return companionFlourish(companion, "I have the context. The client will carry out the last clear action; if it needs a link or file, I will ask for only that missing piece.");
  }
  return null;
}

function conversationalFallback(
  question: string,
  companion: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const value = question.toLowerCase();
  if (/upload|file|pdf|epub|cbz/.test(value)) {
    return companionFlourish(companion, "Attach the file or paste its public link. NoTVerse will test it before opening it temporarily.");
  }
  if (/link|source|url|ad/.test(value)) {
    return companionFlourish(companion, "Paste the link directly. NoTVerse will inspect public redirects and file candidates, then open a verified file or report the exact blocker.");
  }
  if (/save|drive|setting|note|progress/.test(value)) {
    return companionFlourish(companion, "Temporary reading works now. Permanent saving waits for an explicit Google action, so the app will not pretend it saved anything.");
  }
  if (history.length) {
    return companionFlourish(companion, "I am following. Tell me the next action in plain words and I will keep the current context instead of starting over.");
  }
  return companionFlourish(companion, "Talk to me normally. Ask about a book, tell me what mood you want, or paste a source for NoTVerse to test.");
}

function detectFormat(contentType: string, filename: string): string | null {
  const type = contentType.toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "application/epub+zip") return "epub";
  if (type === "text/plain") return "txt";
  const extension = filename.toLowerCase().split(".").pop() || "";
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
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "readverse-file");
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
