type MemoryEnv = { AI: Ai; AI_MODEL: string };
type MemoryBody = { question?: unknown; companion?: unknown; history?: unknown };

type Candidate = {
  title: string;
  authors: string[];
  year?: number;
  description?: string;
  providers: string[];
  sourceIds: string[];
  hypothesisRank?: number;
};

type Hypothesis = { title: string; author?: string };

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

/**
 * Remembered-title search is deliberately two-stage:
 * 1. AI may propose hidden search hypotheses, but those are never shown as facts.
 * 2. A title can reach the user only after an exact public-catalogue match verifies it.
 * Broad catalogue search remains a retrieval fallback, not a licence to guess.
 */
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

  const hypotheses = await generateHypotheses(question, env, ctx);
  const verifiedHypotheses = await verifyHypotheses(hypotheses);

  const queries = [...new Set([
    ...deterministicQueries(question),
    ...hypotheses.flatMap((item) => [item.title, item.author ? `${item.title} ${item.author}` : ""]),
  ].map(cleanQuery).filter((value) => value.length >= 3))].slice(0, 10);

  let candidates = verifiedHypotheses;
  if (candidates.length < 3) {
    const broad = await broadOpenLibrarySearch(deterministicQueries(question));
    candidates = merge([...verifiedHypotheses, ...broad]);
  }

  if (!candidates.length) return noMatch(companion, question, queries, hypotheses);

  const selected = await selectCandidates(question, candidates, verifiedHypotheses, env, ctx);
  if (!selected.length) return noMatch(companion, question, queries, hypotheses);

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
    model: "verified-public-catalogue+workers-ai-hypothesis-ranking",
    companion,
    evidence: {
      type: "public-catalogue",
      intent: "identify",
      queries,
      hypotheses,
      books: selected.map(stripInternal),
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
  const queries = [content, tokens.slice(0, 8).join(" ")];
  if (/butler|servant|household|steward/.test(normalized)) {
    queries.push("butler novel", "butler memory regret", "English butler fiction");
  }
  if (/missed choices|regret|looking back|remember|memory/.test(normalized)) {
    const clue = tokens.filter((token) => /butler|servant|service|life|choice|miss|regret|memory|past/.test(token)).slice(0, 6).join(" ");
    if (clue) queries.push(`${clue} novel`);
  }
  return [...new Set(queries.map(cleanQuery).filter((value) => value.length >= 3))].slice(0, 5);
}

async function generateHypotheses(question: string, env: MemoryEnv, ctx: ExecutionContext): Promise<Hypothesis[]> {
  const prompt = [
    "You are generating hidden retrieval hypotheses for a remembered-book search.",
    "Infer up to four plausible real book titles from the user's clues, with author when you know it.",
    "These hypotheses are NEVER shown to the user unless a public catalogue independently returns an exact matching title, so useful specific hypotheses are better than vague keyword queries.",
    "Do not explain or defend a hypothesis. Do not fabricate obscure titles just to fill the list.",
    'Return JSON only: {"hypotheses":[{"title":"...","author":"..."}]}.',
  ].join(" ");
  const models = [...new Set([
    "@cf/zai-org/glm-4.7-flash",
    env.AI_MODEL,
    "@cf/qwen/qwen3-30b-a3b-fp8",
  ].filter(Boolean))];

  const settled = await Promise.allSettled(models.map(async (model) => {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [{ role: "system", content: prompt }, { role: "user", content: question }],
        max_tokens: 220,
        temperature: 0.2,
      });
      return parseHypotheses(extractText(result));
    } catch (error) {
      ctx.waitUntil(Promise.resolve(console.warn("NoTVerse memory hypothesis fallback", model, error)));
      return [] as Hypothesis[];
    }
  }));

  const merged: Hypothesis[] = [];
  const seen = new Set<string>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      const key = normalize(item.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 8) return merged;
    }
  }
  return merged;
}

function parseHypotheses(text: string): Hypothesis[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { hypotheses?: Array<{ title?: unknown; author?: unknown }> };
    if (!Array.isArray(parsed.hypotheses)) return [];
    return parsed.hypotheses.flatMap((item) => {
      const title = clean(item?.title, 220);
      if (!title) return [];
      const author = clean(item?.author, 160);
      return [{ title, ...(author ? { author } : {}) }];
    }).slice(0, 4);
  } catch {
    return [];
  }
}

async function verifyHypotheses(hypotheses: Hypothesis[]): Promise<Candidate[]> {
  const settled = await Promise.allSettled(hypotheses.slice(0, 8).map((hypothesis, index) => verifyOneHypothesis(hypothesis, index)));
  return merge(settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []))
    .sort((a, b) => (a.hypothesisRank ?? 999) - (b.hypothesisRank ?? 999));
}

async function verifyOneHypothesis(hypothesis: Hypothesis, rank: number): Promise<Candidate | null> {
  const open = await exactOpenLibrary(hypothesis).catch(() => null);
  if (!open) return null;

  // Google Books is corroboration only. It can rate-limit anonymous clients, so a
  // verified Open Library exact match remains sufficient and Google failure is non-fatal.
  const google = await exactGoogleBooks(hypothesis).catch(() => null);
  if (!google) return { ...open, hypothesisRank: rank };
  return {
    ...open,
    year: open.year || google.year,
    description: longer(open.description, google.description),
    providers: [...new Set([...open.providers, ...google.providers])],
    sourceIds: [...new Set([...open.sourceIds, ...google.sourceIds])],
    hypothesisRank: rank,
  };
}

async function exactOpenLibrary(hypothesis: Hypothesis): Promise<Candidate | null> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", hypothesis.title);
  if (hypothesis.author) url.searchParams.set("author", hypothesis.author);
  url.searchParams.set("limit", "8");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,subject");
  const response = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Open Library ${response.status}`);
  const data = await response.json() as { docs?: Array<Record<string, any>> };
  const docs = data.docs || [];
  const exact = docs.find((item) => exactMetadataMatch(hypothesis, item.title, item.author_name));
  return exact ? openLibraryCandidate(exact) : null;
}

async function exactGoogleBooks(hypothesis: Hypothesis): Promise<Candidate | null> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  const parts = [`intitle:${JSON.stringify(hypothesis.title)}`];
  if (hypothesis.author) parts.push(`inauthor:${JSON.stringify(hypothesis.author)}`);
  url.searchParams.set("q", parts.join("+"));
  url.searchParams.set("maxResults", "6");
  url.searchParams.set("printType", "books");
  const response = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Google Books ${response.status}`);
  const data = await response.json() as { items?: Array<Record<string, any>> };
  const item = (data.items || []).find((entry) => {
    const info = entry.volumeInfo || {};
    return exactMetadataMatch(hypothesis, info.title, info.authors);
  });
  if (!item) return null;
  const info = item.volumeInfo || {};
  return {
    title: clean(info.title, 280),
    authors: Array.isArray(info.authors) ? info.authors.map((value: unknown) => clean(value, 140)).filter(Boolean) as string[] : [],
    year: parseYear(info.publishedDate),
    description: cleanDescription(info.description),
    providers: ["Google Books"],
    sourceIds: item.id ? [String(item.id)] : [],
  };
}

function exactMetadataMatch(hypothesis: Hypothesis, titleValue: unknown, authorsValue: unknown): boolean {
  const title = clean(titleValue, 280);
  if (!title || normalize(title) !== normalize(hypothesis.title)) return false;
  if (!hypothesis.author) return true;
  const wanted = normalize(hypothesis.author);
  const authors = Array.isArray(authorsValue) ? authorsValue.map((value) => normalize(String(value))) : [];
  return authors.some((author) => author === wanted || author.includes(wanted) || wanted.includes(author));
}

async function broadOpenLibrarySearch(queries: string[]): Promise<Candidate[]> {
  const settled = await Promise.allSettled(queries.slice(0, 4).map(async (query) => {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "10");
    url.searchParams.set("fields", "key,title,author_name,first_publish_year,subject");
    const response = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Open Library ${response.status}`);
    const data = await response.json() as { docs?: Array<Record<string, any>> };
    return (data.docs || []).map(openLibraryCandidate).filter((book) => Boolean(book.title));
  }));
  return merge(settled.flatMap((result) => result.status === "fulfilled" ? result.value : [])).slice(0, 24);
}

function openLibraryCandidate(item: Record<string, any>): Candidate {
  return {
    title: clean(item.title, 280),
    authors: Array.isArray(item.author_name) ? item.author_name.map((value: unknown) => clean(value, 140)).filter(Boolean) as string[] : [],
    year: typeof item.first_publish_year === "number" ? item.first_publish_year : undefined,
    description: Array.isArray(item.subject) ? item.subject.slice(0, 16).map((value: unknown) => clean(value, 90)).filter(Boolean).join(" · ") : undefined,
    providers: ["Open Library"],
    sourceIds: item.key ? [String(item.key)] : [],
  };
}

async function selectCandidates(
  question: string,
  candidates: Candidate[],
  verifiedHypotheses: Candidate[],
  env: MemoryEnv,
  ctx: ExecutionContext,
): Promise<Candidate[]> {
  // Exact hypothesis verification is the strongest evidence. Keep all exact verified
  // hypotheses visible to the ranker and never let loose broad matches crowd them out.
  const exactKeys = new Set(verifiedHypotheses.map(candidateKey));
  const shortlist = [
    ...verifiedHypotheses,
    ...candidates.filter((item) => !exactKeys.has(candidateKey(item))),
  ].slice(0, 28);

  const ranked = await rank(question, shortlist, env, ctx);
  if (ranked.length) {
    const selected = ranked.map((index) => shortlist[index]).filter((item): item is Candidate => Boolean(item));
    // If the semantic ranker missed every exactly verified hidden hypothesis, include
    // the strongest exact hypothesis as a candidate rather than substituting a loose
    // keyword coincidence such as an author's surname matching an occupation clue.
    if (verifiedHypotheses.length && !selected.some((item) => exactKeys.has(candidateKey(item)))) {
      selected.unshift(verifiedHypotheses[0]);
    }
    return dedupeCandidates(selected).slice(0, 3);
  }

  if (verifiedHypotheses.length) return verifiedHypotheses.slice(0, 3);
  // Broad-only results are too weak to present as remembered-title candidates without
  // semantic confirmation. Honest no-match is preferable to a catalogue-backed guess.
  return [];
}

async function rank(question: string, candidates: Candidate[], env: MemoryEnv, ctx: ExecutionContext): Promise<number[]> {
  const shortlist = candidates.map((book, index) => ({ index, ...stripInternal(book) }));
  const prompt = [
    "Select up to three likely remembered-book matches from ONLY the verified public-catalogue candidates supplied.",
    "Never invent, rename or add a title or author.",
    "Use occupation as a CHARACTER OR PLOT clue, not as an author-surname keyword.",
    "Use plot, setting, era, narrator role, regret/memory themes and the user's wording. Prefer exact narrative fit over lexical coincidence.",
    "Candidates near the start may be exact public-catalogue matches for hidden title hypotheses inferred from the clue; treat that as useful retrieval evidence, not certainty.",
    'Return JSON only: {"indices":[0,1,2]}.',
  ].join(" ");
  const models = [...new Set(["@cf/zai-org/glm-4.7-flash", env.AI_MODEL, "@cf/qwen/qwen3-30b-a3b-fp8"].filter(Boolean))];
  for (const model of models) {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [{ role: "system", content: prompt }, { role: "user", content: `Clue: ${question}\nCandidates: ${JSON.stringify(shortlist)}` }],
        max_tokens: 160,
        temperature: 0.06,
      });
      const text = extractText(result);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]) as { indices?: unknown[] };
      if (!Array.isArray(parsed.indices)) continue;
      const indices = [...new Set(parsed.indices.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value < candidates.length))].slice(0, 3);
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
  if (book.hypothesisRank !== undefined) {
    return overlap.length
      ? `An inferred title hypothesis was independently matched exactly in the catalogue, and its metadata overlaps with your clue on ${overlap.join(", ")}. Treat it as a candidate until you confirm it.`
      : "An inferred title hypothesis was independently matched exactly in the public catalogue. Treat it as a candidate, not a certainty, until you confirm it.";
  }
  if (overlap.length) return `The catalogue metadata overlaps with your clue on ${overlap.join(", ")}; treat it as a candidate, not a certainty, until you confirm it.`;
  return "The public catalogue verifies the title and author, but exposes limited descriptive metadata, so I am presenting it only as a candidate for you to confirm.";
}

function noMatch(companion: string, question: string, queries: string[], hypotheses: Hypothesis[]): Response {
  const opener = OPENERS[companion] ?? OPENERS.Gojo;
  return json({
    ok: true,
    answer: `${opener} I checked the live public catalogues against the clues I could extract, but I could not verify a strong candidate. Give me one more clue and I will narrow it rather than invent a title.`,
    mode: "catalogue-no-match",
    model: "verified-public-catalogue",
    companion,
    evidence: { type: "public-catalogue", intent: "identify", queries, hypotheses, books: [] },
  });
}

function merge(items: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const item of items) {
    const key = candidateKey(item);
    const current = map.get(key);
    if (!current) { map.set(key, item); continue; }
    map.set(key, {
      ...current,
      year: current.year || item.year,
      description: longer(current.description, item.description),
      providers: [...new Set([...current.providers, ...item.providers])],
      sourceIds: [...new Set([...current.sourceIds, ...item.sourceIds])],
      hypothesisRank: Math.min(current.hypothesisRank ?? 999, item.hypothesisRank ?? 999) === 999
        ? undefined
        : Math.min(current.hypothesisRank ?? 999, item.hypothesisRank ?? 999),
    });
  }
  return [...map.values()];
}

function dedupeCandidates(items: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = candidateKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripInternal(book: Candidate): Omit<Candidate, "hypothesisRank"> {
  const { hypothesisRank: _rank, ...rest } = book;
  return rest;
}

function candidateKey(item: Candidate): string { return `${normalize(item.title)}|${normalize(item.authors[0] || "")}`; }
function tokens(value: string): string[] {
  const stop = new Set(["about","after","again","book","books","give","have","into","novel","novels","read","remember","that","their","them","this","what","where","which","with","would"]);
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 3 && !stop.has(token)))];
}
function cleanQuery(value: string): string { return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/^['"`]+|['"`]+$/g, "").trim().slice(0, 200); }
function normalize(value: string): string { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim(); }
function clean(value: unknown, max: number): string { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""; }
function cleanDescription(value: unknown): string | undefined { const text = clean(value, 1200).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return text ? text.slice(0, 760) : undefined; }
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
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
