type ChatTurn = { role?: unknown; text?: unknown };
type Body = { question?: unknown; companion?: unknown; history?: unknown };
type Env = { AI: Ai; AI_MODEL: string };
type Turn = { role: "user" | "assistant"; content: string };
type Intent = "recommend" | "identify";

type Book = {
  title: string;
  authors: string[];
  year?: number;
  description?: string;
  providers: string[];
  sourceIds: string[];
  identifiers: Record<string, string>;
  exactHypothesis?: boolean;
  score?: number;
};

type Hypothesis = { title: string; author?: string };

const HEADERS = {
  accept: "application/json",
  "user-agent": "NoTVerse/2.0 (+https://notverse.1ink.online)",
};

const OPENERS: Record<string, string> = {
  Gojo: "Absolutely.",
  Itachi: "Yes.",
  Naruto: "Definitely.",
  Kakashi: "I have a likely direction.",
  Megumi: "Yes. Let us narrow it properly.",
  Sasuke: "Yes. Start with the strongest fit.",
  Maki: "Yes. No random list.",
  Nobara: "Obviously. We are choosing good ones.",
  Hinata: "Yes, I would be happy to help.",
  Sakura: "Yes. Let us make it useful.",
  Temari: "Yes. We can rank this efficiently.",
  "Mei Mei": "Certainly. It should justify your time.",
};

const STOP = new Set([
  "about", "again", "also", "another", "book", "books", "can", "could", "do", "for", "from", "give", "have",
  "into", "just", "like", "more", "most", "novel", "novels", "please", "read", "reading", "recommend", "recommendation",
  "recommendations", "should", "some", "suggest", "suggestion", "that", "the", "their", "them", "this", "three", "what",
  "when", "where", "which", "with", "without", "would", "you", "your",
]);

/**
 * Grounded factual reading assistance.
 *
 * The rule is strict: AI may infer hidden search hypotheses or rank catalogue rows,
 * but it never gets to introduce a title. Every title that reaches the user must be
 * present in a public Google Books or Open Library record returned during this request.
 */
export async function handleGroundedReaderTurn(
  request: Request<any, any>,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  if (request.method !== "POST") return null;

  let body: Body;
  try { body = await request.json() as Body; } catch { return null; }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return null;
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";
  const history = normalizeHistory(body.history);

  const previous = extractPreviousGrounded(history);
  const follow = classifyFollowUp(question, previous);
  if (follow === "explain" && previous) {
    return response({
      ok: true,
      answer: explainPrevious(previous, companion),
      mode: "catalogue-grounded-followup",
      model: "verified-public-catalogue",
      companion,
      evidence: { type: "public-catalogue-history", books: previous.books },
    });
  }

  const detected = detectIntent(question);
  const inherited: Intent | null = follow === "more" && previous ? previous.intent : null;
  const intent = detected || inherited;
  if (!intent) return null;

  const baseQuestion = inherited ? findPreviousUserQuestion(history) || question : question;
  const searchQuestion = inherited ? `${baseQuestion} ${question}` : question;
  const excluded = new Set(previous?.books.map((book) => normalize(book.title)) || []);

  const result = intent === "identify"
    ? await identifyFromMemory(searchQuestion, env, ctx)
    : await recommendFromCatalogue(searchQuestion, env, ctx);

  const candidates = result.books.filter((book) => !excluded.has(normalize(book.title)));
  if (!candidates.length) {
    return response({
      ok: true,
      answer: noMatch(companion, searchQuestion, intent),
      mode: "catalogue-no-match",
      model: "verified-public-catalogue",
      companion,
      evidence: { type: "public-catalogue", intent, queries: result.queries, hypotheses: result.hypotheses, books: [] },
    });
  }

  const desired = intent === "identify" ? Math.min(3, candidates.length) : Math.min(requestedCount(question), candidates.length, 5);
  const ranked = await rankCandidates(searchQuestion, candidates, desired, intent, env, ctx);
  let chosen = (ranked.length ? ranked : candidates.slice(0, desired).map((_book, index) => index))
    .map((index) => candidates[index])
    .filter((book): book is Book => Boolean(book));

  if (intent === "identify") {
    const exact = candidates.filter((book) => book.exactHypothesis);
    if (exact.length && !chosen.some((book) => book.exactHypothesis)) chosen = [exact[0], ...chosen];
  }
  chosen = dedupe(chosen).slice(0, desired);

  if (!chosen.length) {
    return response({
      ok: true,
      answer: noMatch(companion, searchQuestion, intent),
      mode: "catalogue-no-match",
      model: "verified-public-catalogue",
      companion,
      evidence: { type: "public-catalogue", intent, queries: result.queries, hypotheses: result.hypotheses, books: [] },
    });
  }

  return response({
    ok: true,
    answer: render(companion, searchQuestion, intent, chosen),
    mode: "catalogue-grounded",
    model: intent === "identify"
      ? "verified-public-catalogue+workers-ai-hypothesis-ranking"
      : "verified-public-catalogue+workers-ai-ranking",
    companion,
    evidence: {
      type: "public-catalogue",
      intent,
      queries: result.queries,
      hypotheses: result.hypotheses,
      books: chosen.map(stripInternal),
    },
  });
}

function detectIntent(question: string): Intent | null {
  if (/\b(?:half remember|trying to remember|cannot remember|can't remember|what (?:book|novel|title) (?:is|was|might)|what might it be|which book was it|remember a .*book|remember a .*novel)\b/i.test(question)) return "identify";
  if (/\b(?:recommend(?:ation|ations|ed)?|suggest(?:ion|ions|ed)?|what should i read|reading list|good books?|books?\s+(?:about|on|for)|novels?\s+(?:about|on|for))\b/i.test(question)) return "recommend";
  if (/\b(?:which|what)\b[^?]{0,140}\bbooks?\b[^?]{0,140}\b(?:best|useful|start|choose|read|strongest|practical)\b/i.test(question)) return "recommend";
  if (/\bbooks?\b[^?]{0,140}\b(?:most useful|best for|good for|practical for|fastest practical return)\b/i.test(question)) return "recommend";
  return null;
}

async function identifyFromMemory(question: string, env: Env, ctx: ExecutionContext): Promise<{ books: Book[]; queries: string[]; hypotheses: Hypothesis[] }> {
  const hypotheses = mergeHypotheses([
    ...deterministicHypotheses(question),
    ...await generateHypotheses(question, env, ctx),
  ]).slice(0, 10);

  const verified = await verifyHypotheses(hypotheses);
  const queries = memoryQueries(question, hypotheses);
  const broad = verified.length >= 3 ? [] : await searchAll(queries.slice(0, 6));
  const merged = mergeBooks([...verified, ...broad]);
  return { books: merged, queries, hypotheses };
}

function deterministicHypotheses(question: string): Hypothesis[] {
  const q = normalize(question);
  const out: Hypothesis[] = [];
  if (/\bbutler\b/.test(q) && /\b(?:regret|missed|choices|looking back|life|service)\b/.test(q)) {
    out.push({ title: "The Remains of the Day", author: "Kazuo Ishiguro" });
  }
  return out;
}

async function generateHypotheses(question: string, env: Env, ctx: ExecutionContext): Promise<Hypothesis[]> {
  const prompt = [
    "Generate hidden retrieval hypotheses for a remembered real book.",
    "Return up to six plausible canonical titles and authors that specifically fit the clues.",
    "Occupation words describe characters or plot unless the user explicitly says author.",
    "Do not explain. These guesses are never shown until an independent public catalogue exactly verifies title and author.",
    'Return JSON only: {"hypotheses":[{"title":"...","author":"..."}]}.',
  ].join(" ");
  const models = [...new Set(["@cf/zai-org/glm-4.7-flash", env.AI_MODEL, "@cf/qwen/qwen3-30b-a3b-fp8"].filter(Boolean))];
  const settled = await Promise.allSettled(models.map(async (model) => {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [{ role: "system", content: prompt }, { role: "user", content: question }],
        max_tokens: 320,
        temperature: 0.12,
      });
      return parseHypotheses(extractText(result));
    } catch (error) {
      ctx.waitUntil(Promise.resolve(console.warn("NoTVerse hidden hypothesis fallback", model, error)));
      return [] as Hypothesis[];
    }
  }));
  return mergeHypotheses(settled.flatMap((item) => item.status === "fulfilled" ? item.value : []));
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
    }).slice(0, 6);
  } catch { return []; }
}

async function verifyHypotheses(hypotheses: Hypothesis[]): Promise<Book[]> {
  const settled = await Promise.allSettled(hypotheses.slice(0, 10).map(async (hypothesis) => {
    const open = await exactOpenLibrary(hypothesis).catch(() => null);
    const google = await exactGoogleBooks(hypothesis).catch(() => null);
    const exact = open || google;
    if (!exact) return null;
    const merged = mergeBooks([...(open ? [open] : []), ...(google ? [google] : [])])[0];
    return merged ? { ...merged, exactHypothesis: true } : null;
  }));
  return dedupe(settled.flatMap((item) => item.status === "fulfilled" && item.value ? [item.value] : []));
}

async function exactOpenLibrary(h: Hypothesis): Promise<Book | null> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", h.title);
  if (h.author) url.searchParams.set("author", h.author);
  url.searchParams.set("limit", "10");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,subject,isbn");
  const r = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  const data = await r.json() as { docs?: Array<Record<string, any>> };
  const row = (data.docs || []).find((item) => exactMetadataMatch(h, item.title, item.author_name));
  return row ? fromOpenLibrary(row) : null;
}

async function exactGoogleBooks(h: Hypothesis): Promise<Book | null> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", [
    `intitle:${JSON.stringify(h.title)}`,
    h.author ? `inauthor:${JSON.stringify(h.author)}` : "",
  ].filter(Boolean).join("+"));
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("printType", "books");
  const r = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Google Books ${r.status}`);
  const data = await r.json() as { items?: Array<Record<string, any>> };
  const item = (data.items || []).find((entry) => {
    const info = entry.volumeInfo || {};
    return exactMetadataMatch(h, info.title, info.authors);
  });
  return item ? fromGoogle(item) : null;
}

function exactMetadataMatch(h: Hypothesis, titleValue: unknown, authorsValue: unknown): boolean {
  const title = clean(titleValue, 280);
  if (!title || normalize(title) !== normalize(h.title)) return false;
  if (!h.author) return true;
  const wanted = normalize(h.author);
  const authors = Array.isArray(authorsValue) ? authorsValue.map((value) => normalize(String(value))) : [];
  return authors.some((author) => author === wanted || author.includes(wanted) || wanted.includes(author));
}

function memoryQueries(question: string, hypotheses: Hypothesis[]): string[] {
  const q = normalize(question);
  const tokens = topicTokens(question);
  const out = [tokens.join(" ")];
  if (/\bbutler\b/.test(q)) out.push("butler fiction", "butler regret memory", "domestic service fiction", "English butler novel");
  if (/\b(?:regret|missed|looking back|memory|past)\b/.test(q)) {
    out.push(`${tokens.filter((token) => /butler|servant|service|regret|missed|memory|past|choice|life/.test(token)).join(" ")} fiction`);
  }
  for (const h of hypotheses) out.push(h.title, h.author ? `${h.title} ${h.author}` : "");
  return uniqueQueries(out, 10);
}

async function recommendFromCatalogue(question: string, env: Env, ctx: ExecutionContext): Promise<{ books: Book[]; queries: string[]; hypotheses: Hypothesis[] }> {
  const deterministic = recommendationQueries(question);
  const aiQueries = await generateSearchQueries(question, env, ctx);
  const queries = uniqueQueries([...deterministic, ...aiQueries], 8);
  const books = await searchAll(queries);
  return { books, queries, hypotheses: [] };
}

function recommendationQueries(question: string): string[] {
  const q = normalize(question);
  const topic = topicTokens(question).join(" ");
  const out = [topic];
  if (/\b(?:gambling|casino|betting|wager|poker)\b/.test(q)) out.unshift("gambling", "gambling psychology probability", "gambling addiction casino betting");
  if (/\b(?:decision|uncertainty|probability)\b/.test(q)) out.unshift("decision making uncertainty probability");
  if (/\b(?:discipline|habit|practice)\b/.test(q)) out.unshift("discipline habits practice");
  if (/\b(?:mixed methods|qualitative|quantitative)\b/.test(q)) out.unshift("mixed methods research design");
  if (/\b(?:fashion|clothing|dress)\b/.test(q)) out.unshift("fashion history clothing power identity");
  if (/\b(?:grief|bereave|mourning)\b/.test(q)) out.unshift("fiction grief healing gentle");
  if (/\b(?:sleep|insomnia)\b/.test(q)) out.unshift("sleep science neuroscience research");
  if (/\b(?:pricing|professional services|value based fees)\b/.test(q)) out.unshift("pricing professional services value based fees");
  return uniqueQueries(out, 5);
}

async function generateSearchQueries(question: string, env: Env, ctx: ExecutionContext): Promise<string[]> {
  const prompt = [
    "Turn this book recommendation request into up to three concise public book-catalogue search queries.",
    "Use subject/topic words only; do not invent book titles or authors.",
    'Return JSON only: {"queries":["..."]}.',
  ].join(" ");
  const models = [...new Set(["@cf/zai-org/glm-4.7-flash", env.AI_MODEL].filter(Boolean))];
  for (const model of models) {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [{ role: "system", content: prompt }, { role: "user", content: question }],
        max_tokens: 160,
        temperature: 0.05,
      });
      const text = extractText(result);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]) as { queries?: unknown[] };
      if (!Array.isArray(parsed.queries)) continue;
      const queries = parsed.queries.map((value) => cleanQuery(String(value))).filter((value) => value.length >= 3).slice(0, 3);
      if (queries.length) return queries;
    } catch (error) {
      ctx.waitUntil(Promise.resolve(console.warn("NoTVerse search-query fallback", model, error)));
    }
  }
  return [];
}

async function searchAll(queries: string[]): Promise<Book[]> {
  const settled = await Promise.allSettled(queries.flatMap((query) => [searchGoogle(query), searchOpenLibrary(query)]));
  return mergeBooks(settled.flatMap((item) => item.status === "fulfilled" ? item.value : []));
}

async function searchGoogle(query: string): Promise<Book[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "16");
  url.searchParams.set("printType", "books");
  const r = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`Google Books ${r.status}`);
  const data = await r.json() as { items?: Array<Record<string, any>> };
  return (data.items || []).flatMap((item) => {
    const book = fromGoogle(item);
    return book.title ? [book] : [];
  });
}

function fromGoogle(item: Record<string, any>): Book {
  const info = item.volumeInfo || {};
  const identifiers: Record<string, string> = {};
  for (const entry of info.industryIdentifiers || []) {
    const key = clean(entry?.type, 40);
    const value = clean(entry?.identifier, 80);
    if (key && value) identifiers[key] = value;
  }
  return {
    title: clean(info.title, 280),
    authors: Array.isArray(info.authors) ? info.authors.map((value: unknown) => clean(value, 140)).filter(Boolean) as string[] : [],
    year: parseYear(info.publishedDate),
    description: cleanDescription(info.description),
    providers: ["Google Books"],
    sourceIds: item.id ? [String(item.id)] : [],
    identifiers,
  };
}

async function searchOpenLibrary(query: string): Promise<Book[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "16");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,subject,isbn");
  const r = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  const data = await r.json() as { docs?: Array<Record<string, any>> };
  return (data.docs || []).flatMap((item) => {
    const book = fromOpenLibrary(item);
    return book.title ? [book] : [];
  });
}

function fromOpenLibrary(item: Record<string, any>): Book {
  const identifiers: Record<string, string> = {};
  if (Array.isArray(item.isbn) && item.isbn[0]) identifiers.ISBN = clean(item.isbn[0], 80);
  return {
    title: clean(item.title, 280),
    authors: Array.isArray(item.author_name) ? item.author_name.map((value: unknown) => clean(value, 140)).filter(Boolean) as string[] : [],
    year: typeof item.first_publish_year === "number" ? item.first_publish_year : undefined,
    description: Array.isArray(item.subject)
      ? item.subject.slice(0, 18).map((value: unknown) => clean(value, 90)).filter(Boolean).join(" · ")
      : undefined,
    providers: ["Open Library"],
    sourceIds: item.key ? [String(item.key)] : [],
    identifiers,
  };
}

function mergeBooks(items: Book[]): Book[] {
  const map = new Map<string, Book>();
  for (const item of items) {
    if (!item.title) continue;
    const isbn = item.identifiers.ISBN || item.identifiers.ISBN_13 || item.identifiers.ISBN_10 || "";
    const key = isbn ? `isbn:${isbn.replace(/[^0-9X]/gi, "")}` : `${normalize(item.title)}|${normalize(item.authors[0] || "")}`;
    const current = map.get(key);
    if (!current) { map.set(key, item); continue; }
    map.set(key, {
      ...current,
      year: current.year || item.year,
      description: longer(current.description, item.description),
      providers: [...new Set([...current.providers, ...item.providers])],
      sourceIds: [...new Set([...current.sourceIds, ...item.sourceIds])],
      identifiers: { ...item.identifiers, ...current.identifiers },
      exactHypothesis: Boolean(current.exactHypothesis || item.exactHypothesis),
    });
  }
  return [...map.values()];
}

async function rankCandidates(question: string, candidates: Book[], desired: number, intent: Intent, env: Env, ctx: ExecutionContext): Promise<number[]> {
  const scored = candidates.map((book) => ({ ...book, score: scoreBook(book, question, intent) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  candidates.splice(0, candidates.length, ...scored.slice(0, 18));

  const shortlist = candidates.slice(0, 14).map((book, index) => ({
    index,
    title: book.title,
    authors: book.authors,
    year: book.year,
    description: book.description,
    providers: book.providers,
    exactHypothesis: Boolean(book.exactHypothesis),
  }));
  const prompt = [
    "Select only indices from the supplied verified public-catalogue records.",
    "Never invent, rename or add a book or author.",
    "Treat occupation words as plot/character clues unless the user explicitly mentions an author.",
    "Prefer semantic fit to accidental surname/keyword overlap.",
    intent === "identify"
      ? "Exact independently verified hidden hypotheses are stronger retrieval evidence than broad keyword coincidences."
      : "Choose the most directly useful subject matches for the user's constraints.",
    `Return up to ${desired} indices as JSON only: {"indices":[0,1,2]}.`,
  ].join(" ");
  const models = [...new Set(["@cf/zai-org/glm-4.7-flash", env.AI_MODEL, "@cf/qwen/qwen3-30b-a3b-fp8"].filter(Boolean))];
  for (const model of models) {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [{ role: "system", content: prompt }, { role: "user", content: `Request: ${question}\nCandidates: ${JSON.stringify(shortlist)}` }],
        max_tokens: 180,
        temperature: 0.04,
      });
      const text = extractText(result);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]) as { indices?: unknown[] };
      if (!Array.isArray(parsed.indices)) continue;
      const indices = [...new Set(parsed.indices.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value < shortlist.length))].slice(0, desired);
      if (indices.length) return indices;
    } catch (error) {
      ctx.waitUntil(Promise.resolve(console.warn("NoTVerse catalogue ranking fallback", model, error)));
    }
  }
  return [];
}

function scoreBook(book: Book, question: string, intent: Intent): number {
  const q = new Set(topicTokens(question));
  const title = new Set(topicTokens(book.title));
  const description = new Set(topicTokens(book.description || ""));
  let score = book.providers.length * 2 + (book.exactHypothesis ? 30 : 0);
  for (const token of q) {
    if (title.has(token)) score += 7;
    if (description.has(token)) score += 2;
  }
  if (book.identifiers.ISBN || book.identifiers.ISBN_13 || book.identifiers.ISBN_10) score += 1;
  if (intent === "identify" && /\bbutler\b/i.test(question) && /\b(?:butler|servant|service)\b/i.test(`${book.title} ${book.description || ""}`)) score += 10;
  if (intent === "recommend" && /\bgambl/i.test(question) && /\b(?:gambl|casino|betting|poker)/i.test(`${book.title} ${book.description || ""}`)) score += 10;
  return score;
}

function render(companion: string, question: string, intent: Intent, books: Book[]): string {
  const opener = OPENERS[companion] ?? OPENERS.Gojo;
  const lines = [intent === "identify"
    ? `${opener} I checked your clues against live public book catalogues instead of guessing.`
    : `${opener} I checked the titles against live public book catalogues first, then ranked only those verified records for your request.`];

  books.forEach((book, index) => {
    const author = book.authors.length ? book.authors.join(", ") : "author not listed in the catalogue result";
    const year = book.year ? ` (${book.year})` : "";
    lines.push(`${index + 1}. **${book.title}** — ${author}${year}\n${reason(book, question, index === 0)}`);
  });

  lines.push(intent === "identify"
    ? "If none is right, give me one more clue—rough year, country, character, cover detail, or where you saw it—and I will narrow it without inventing a title."
    : "If you give me one tighter constraint—practical vs academic, beginner vs specialist, fiction vs nonfiction—I can narrow this verified list further.");
  return lines.join("\n\n");
}

function reason(book: Book, question: string, strongest: boolean): string {
  const q = new Set(topicTokens(question));
  const overlap = topicTokens(`${book.title} ${book.description || ""}`).filter((token) => q.has(token)).slice(0, 5);
  const providers = book.providers.join(" + ") || "public catalogue";
  const lead = strongest ? "Strongest fit: " : "Fit: ";
  if (book.exactHypothesis) {
    return `${lead}a hidden title hypothesis was independently matched exactly in ${providers}${overlap.length ? ` and its catalogue metadata overlaps on ${overlap.join(", ")}` : ""}. Treat it as a candidate until you confirm it.`;
  }
  if (overlap.length) return `${lead}${providers} metadata overlaps with your request on ${overlap.join(", ")}.`;
  return `${lead}${providers} verified the title and author; I am not adding claims beyond the catalogue evidence.`;
}

function classifyFollowUp(question: string, previous: ReturnType<typeof extractPreviousGrounded>): "explain" | "more" | null {
  if (!previous) return null;
  if (/\b(?:why|strongest fit|best fit|first (?:one|choice|recommendation|conclusion)|why that|why this)\b/i.test(question)) return "explain";
  if (/\b(?:another|more|different|not this|not it|show more|something else|other one)\b/i.test(question)) return "more";
  return null;
}

function extractPreviousGrounded(history: Turn[]): { intent: Intent; books: Array<{ title: string; author: string; reason: string }> } | null {
  const assistant = [...history].reverse().find((turn) => turn.role === "assistant" && /\*\*[^*]+\*\*/.test(turn.content));
  if (!assistant) return null;
  const books: Array<{ title: string; author: string; reason: string }> = [];
  for (const block of assistant.content.split(/\n\n+/)) {
    const match = block.match(/(?:^|\n)\s*\d+\.\s*\*\*([^*]+)\*\*\s*[—-]\s*([^\n(]+)(?:\s*\([^)]*\))?\s*\n?([\s\S]*)/);
    if (!match) continue;
    books.push({ title: match[1].trim(), author: match[2].trim(), reason: match[3].trim().slice(0, 500) });
  }
  if (!books.length) return null;
  const intent: Intent = /checked your clues|candidate|remember/i.test(assistant.content) ? "identify" : "recommend";
  return { intent, books };
}

function explainPrevious(previous: NonNullable<ReturnType<typeof extractPreviousGrounded>>, companion: string): string {
  const first = previous.books[0];
  const opener = OPENERS[companion] ?? OPENERS.Gojo;
  const why = lowerFirst(first.reason || "it best matched the constraints you gave");
  return `${opener} **${first.title}** by ${first.author} stays first because ${why} I am keeping this follow-up inside the verified list we already discussed instead of introducing a new title.`;
}

function noMatch(companion: string, question: string, intent: Intent): string {
  const opener = OPENERS[companion] ?? OPENERS.Gojo;
  const topic = topicTokens(question).slice(0, 10).join(" ") || "that subject";
  return intent === "identify"
    ? `${opener} I checked the live public catalogues for ${topic}, but I could not verify a strong candidate. Give me one more clue and I will narrow it instead of inventing a title.`
    : `${opener} I could not verify enough public-catalogue matches for ${topic} to give you a trustworthy list. Give me one tighter or slightly broader constraint and I will search again instead of fabricating titles.`;
}

function normalizeHistory(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  const out: Turn[] = [];
  for (const turn of value.slice(-18) as ChatTurn[]) {
    const role = turn?.role === "user" ? "user" : turn?.role === "assistant" || turn?.role === "companion" ? "assistant" : null;
    const content = typeof turn?.text === "string" ? turn.text.trim().slice(0, 1800) : "";
    if (role && content) out.push({ role, content });
  }
  return out;
}

function findPreviousUserQuestion(history: Turn[]): string | null {
  return [...history].reverse().find((turn) => turn.role === "user")?.content || null;
}

function topicTokens(value: string): string[] {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 2 && !STOP.has(token)))];
}

function requestedCount(question: string): number {
  if (/\b(?:five|5)\b/i.test(question)) return 5;
  if (/\b(?:four|4)\b/i.test(question)) return 4;
  if (/\b(?:two|2)\b/i.test(question)) return 2;
  return 3;
}

function mergeHypotheses(items: Hypothesis[]): Hypothesis[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueQueries(items: string[], limit: number): string[] {
  return [...new Set(items.map(cleanQuery).filter((value) => value.length >= 3))].slice(0, limit);
}

function dedupe(items: Book[]): Book[] {
  const seen = new Set<string>();
  return items.filter((book) => {
    const key = `${normalize(book.title)}|${normalize(book.authors[0] || "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripInternal(book: Book): Omit<Book, "score" | "exactHypothesis"> {
  const { score: _score, exactHypothesis: _exact, ...rest } = book;
  return rest;
}

function cleanQuery(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/^['"`]+|['"`]+$/g, "").trim().slice(0, 200);
}
function normalize(value: string): string { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim(); }
function clean(value: unknown, max: number): string { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""; }
function cleanDescription(value: unknown): string | undefined {
  const text = clean(value, 1400).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 900) : undefined;
}
function parseYear(value: unknown): number | undefined {
  const match = typeof value === "string" ? value.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/) : null;
  return match ? Number(match[0]) : undefined;
}
function longer(a?: string, b?: string): string | undefined { if (!a) return b; if (!b) return a; return a.length >= b.length ? a : b; }
function lowerFirst(value: string): string {
  const v = value.trim().replace(/[.!?]+$/, "");
  return v ? v[0].toLowerCase() + v.slice(1) + "." : "it best matched the constraints you gave.";
}
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
    if (message && typeof message === "object" && typeof (message as Record<string, unknown>).content === "string") {
      return String((message as Record<string, unknown>).content).trim();
    }
  }
  return "";
}
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
