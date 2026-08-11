type MemoryEnv = { AI: Ai; AI_MODEL: string };
type MemoryBody = { question?: unknown; companion?: unknown; history?: unknown };
type Candidate = {
  title: string;
  authors: string[];
  year?: number;
  description?: string;
  providers: string[];
  sourceIds: string[];
};

const HEADERS = {
  accept: "application/json",
  "user-agent": "NoTVerse/2.0 (+https://notverse.1ink.online)",
};

const OPENERS: Record<string, string> = {
  Gojo: "Absolutely.", Itachi: "Yes.", Naruto: "Definitely.", Kakashi: "I have a likely direction.",
  Megumi: "Yes. Let us narrow it properly.", Sasuke: "Yes. Start with the strongest fit.", Maki: "Yes. No random list.",
  Nobara: "Obviously. We are choosing good ones.", Hinata: "Yes, I would be happy to help.", Sakura: "Yes. Let us make it useful.",
  Temari: "Yes. We can rank this efficiently.", "Mei Mei": "Certainly. It should justify your time.",
};

export async function handleGroundedMemoryTurn(
  request: Request<any, any>,
  env: MemoryEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  if (request.method !== "POST") return null;
  let body: MemoryBody;
  try { body = await request.json() as MemoryBody; } catch { return null; }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || !isRememberedTitleRequest(question)) return null;
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";

  const generated = await generateSearchQueries(question, env, ctx);
  const queries = [...new Set([
    ...deterministicQueries(question),
    ...generated,
  ].map(cleanQuery).filter((value) => value.length >= 3))].slice(0, 8);

  const settled = await Promise.allSettled(queries.flatMap((query) => [
    google(query), openLibrary(query),
  ]));
  const raw = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const candidates = merge(raw).slice(0, 36);

  if (!candidates.length) return noMatch(companion, question, queries);

  const ranked = await rank(question, candidates, env, ctx);
  const selected = (ranked.length ? ranked : [0, 1, 2])
    .map((index) => candidates[index])
    .filter((book): book is Candidate => Boolean(book))
    .slice(0, 3);
  if (!selected.length) return noMatch(companion, question, queries);

  const opener = OPENERS[companion] ?? OPENERS.Gojo;
  const lines = [`${opener} I checked your clues against live public book catalogues instead of guessing.`];
  selected.forEach((book, index) => {
    const author = book.authors.length ? book.authors.join(", ") : "author not listed in the catalogue result";
    const year = book.year ? ` (${book.year})` : "";
    const providers = book.providers.join(" + ");
    lines.push(`${index + 1}. **${book.title}** — ${author}${year}\nVerified by ${providers}. ${fitLine(book, question)}`);
  });
  lines.push("If none is right, give me one more clue—rough year, country, character, cover detail, or where you saw it—and I will narrow the search instead of inventing a title.");

  return json({
    ok: true,
    answer: lines.join("\n\n"),
    mode: "catalogue-grounded",
    model: "verified-public-catalogue+workers-ai-query-ranking",
    companion,
    evidence: {
      type: "public-catalogue",
      intent: "identify",
      queries,
      books: selected,
    },
  });
}

function isRememberedTitleRequest(question: string): boolean {
  return /\b(?:half remember|trying to remember|cannot remember|can't remember|what (?:book|novel|title) (?:is|was|might)|what might it be|which book was it|remember a .*book|remember a .*novel)\b/i.test(question);
}

function deterministicQueries(question: string): string[] {
  const normalized = question.toLowerCase();
  const content = question
    .replace(/\b(?:i half remember|i remember|i am trying to remember|i'm trying to remember|trying to remember|what might it be|which book was it|what book is it|what novel is it|literary|novel|book|title)\b/gi, " ")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .replace(/\s+/g, " ").trim();
  const tokens = content.split(" ").filter((token) => token.length > 3);
  const queries = [content, tokens.slice(0, 7).join(" ")];
  if (/butler|servant|household|steward/.test(normalized)) {
    queries.push("butler novel", "butler memory", "butler regret", "English butler fiction");
  }
  if (/missed choices|regret|looking back|remember|memory/.test(normalized)) {
    queries.push(`${tokens.filter((token) => /butler|servant|service|life|choice|miss|regret|memory|past/.test(token)).slice(0, 5).join(" ")} novel`);
  }
  return queries;
}

async function generateSearchQueries(question: string, env: MemoryEnv, ctx: ExecutionContext): Promise<string[]> {
  const prompt = [
    "Turn a remembered-book description into up to four short public-library catalogue search queries.",
    "Queries are retrieval probes only, not answers. Do not assert that any title is correct.",
    "Prefer distinctive plot, occupation, setting, era, object, character-role and theme clues.",
    "You may include a possible title or author only as a search probe; the application will not show it unless a public catalogue independently returns it.",
    'Return JSON only: {"queries":["query one","query two"]}.',
  ].join(" ");
  const models = [...new Set(["@cf/zai-org/glm-4.7-flash", env.AI_MODEL, "@cf/qwen/qwen3-30b-a3b-fp8"].filter(Boolean))];
  for (const model of models) {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [{ role: "system", content: prompt }, { role: "user", content: question }],
        max_tokens: 180,
        temperature: 0.18,
      });
      const text = extractText(result);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]) as { queries?: unknown[] };
      if (!Array.isArray(parsed.queries)) continue;
      const queries = parsed.queries.map((value) => cleanQuery(String(value))).filter((value) => value.length >= 3).slice(0, 4);
      if (queries.length) return queries;
    } catch (error) {
      ctx.waitUntil(Promise.resolve(console.warn("NoTVerse memory query expansion fallback", model, error)));
    }
  }
  return [];
}

async function google(query: string): Promise<Candidate[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("printType", "books");
  const response = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Google Books ${response.status}`);
  const data = await response.json() as { items?: Array<Record<string, any>> };
  return (data.items || []).flatMap((item) => {
    const info = item.volumeInfo || {};
    const title = clean(info.title, 280);
    if (!title) return [];
    return [{
      title,
      authors: Array.isArray(info.authors) ? info.authors.map((value: unknown) => clean(value, 140)).filter(Boolean) as string[] : [],
      year: parseYear(info.publishedDate),
      description: cleanDescription(info.description),
      providers: ["Google Books"],
      sourceIds: item.id ? [String(item.id)] : [],
    }];
  });
}

async function openLibrary(query: string): Promise<Candidate[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "20");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,subject");
  const response = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Open Library ${response.status}`);
  const data = await response.json() as { docs?: Array<Record<string, any>> };
  return (data.docs || []).flatMap((item) => {
    const title = clean(item.title, 280);
    if (!title) return [];
    return [{
      title,
      authors: Array.isArray(item.author_name) ? item.author_name.map((value: unknown) => clean(value, 140)).filter(Boolean) as string[] : [],
      year: typeof item.first_publish_year === "number" ? item.first_publish_year : undefined,
      description: Array.isArray(item.subject) ? item.subject.slice(0, 16).map((value: unknown) => clean(value, 90)).filter(Boolean).join(" · ") : undefined,
      providers: ["Open Library"],
      sourceIds: item.key ? [String(item.key)] : [],
    }];
  });
}

function merge(items: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const item of items) {
    const key = `${normalize(item.title)}|${normalize(item.authors[0] || "")}`;
    const current = map.get(key);
    if (!current) { map.set(key, item); continue; }
    map.set(key, {
      ...current,
      year: current.year || item.year,
      description: longer(current.description, item.description),
      providers: [...new Set([...current.providers, ...item.providers])],
      sourceIds: [...new Set([...current.sourceIds, ...item.sourceIds])],
    });
  }
  return [...map.values()];
}

async function rank(question: string, candidates: Candidate[], env: MemoryEnv, ctx: ExecutionContext): Promise<number[]> {
  const shortlist = candidates.slice(0, 30).map((book, index) => ({ index, ...book }));
  const prompt = [
    "Select up to three likely matches for a remembered book from ONLY the verified catalogue candidates supplied.",
    "Never invent, rename or add a title or author.",
    "Use occupation, plot, setting, era and theme clues. Prefer an exact narrative fit over loose keyword overlap.",
    'Return JSON only: {"indices":[0,1,2]}.',
  ].join(" ");
  const models = [...new Set(["@cf/zai-org/glm-4.7-flash", env.AI_MODEL, "@cf/qwen/qwen3-30b-a3b-fp8"].filter(Boolean))];
  for (const model of models) {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [{ role: "system", content: prompt }, { role: "user", content: `Clue: ${question}\nCandidates: ${JSON.stringify(shortlist)}` }],
        max_tokens: 140,
        temperature: 0.08,
      });
      const text = extractText(result);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]) as { indices?: unknown[] };
      if (!Array.isArray(parsed.indices)) continue;
      const indices = [...new Set(parsed.indices.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value < shortlist.length))].slice(0, 3);
      if (indices.length) return indices;
    } catch (error) {
      ctx.waitUntil(Promise.resolve(console.warn("NoTVerse memory ranking fallback", model, error)));
    }
  }
  return [];
}

function fitLine(book: Candidate, question: string): string {
  const clues = new Set(tokens(question));
  const overlap = tokens(`${book.title} ${book.description || ""}`).filter((token) => clues.has(token)).slice(0, 5);
  if (overlap.length) return `The catalogue metadata overlaps with your clue on ${overlap.join(", ")}; treat it as a candidate, not a certainty, until you confirm it.`;
  return "The public catalogue verifies the title and author, but exposes limited descriptive metadata, so I am presenting it only as a candidate for you to confirm.";
}

function noMatch(companion: string, question: string, queries: string[]): Response {
  const opener = OPENERS[companion] ?? OPENERS.Gojo;
  return json({
    ok: true,
    answer: `${opener} I checked the live public catalogues against the clues I could extract, but I could not verify a strong candidate. Give me one more clue and I will narrow it rather than invent a title.`,
    mode: "catalogue-no-match",
    model: "verified-public-catalogue",
    companion,
    evidence: { type: "public-catalogue", intent: "identify", queries, books: [] },
  });
}

function tokens(value: string): string[] {
  const stop = new Set(["about","after","again","book","books","give","have","into","novel","novels","read","remember","that","their","them","this","what","where","which","with","would"]);
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 3 && !stop.has(token)))];
}
function cleanQuery(value: string): string { return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/^['"`]+|['"`]+$/g, "").trim().slice(0, 180); }
function normalize(value: string): string { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim(); }
function clean(value: unknown, max: number): string { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""; }
function cleanDescription(value: unknown): string | undefined { const text = clean(value, 1000).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return text ? text.slice(0, 700) : undefined; }
function parseYear(value: unknown): number | undefined { const match = typeof value === "string" ? value.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/) : null; return match ? Number(match[0]) : undefined; }
function longer(a?: string, b?: string): string | undefined { if (!a) return b; if (!b) return a; return a.length >= b.length ? a : b; }
function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.text === "string") return record.text.trim();
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0];
  if (first && typeof first === "object") {
    const choice = first as Record<string, unknown>;
    if (typeof choice.text === "string") return choice.text.trim();
    const message = choice.message;
    if (message && typeof message === "object" && typeof (message as Record<string, unknown>).content === "string") return String((message as Record<string, unknown>).content).trim();
  }
  return "";
}
function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
