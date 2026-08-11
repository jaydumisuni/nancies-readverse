type ChatTurn = { role?: unknown; text?: unknown };

type GroundedBody = {
  question?: unknown;
  companion?: unknown;
  history?: unknown;
};

type GroundedEnv = {
  AI: Ai;
  AI_MODEL: string;
};

type Turn = { role: "user" | "assistant"; content: string };

type BookCandidate = {
  key: string;
  title: string;
  authors: string[];
  year?: number;
  description?: string;
  providers: string[];
  identifiers: Record<string, string>;
  score?: number;
};

type BookIntent = "recommend" | "identify";

const PUBLIC_PROVIDERS = new Set(["Google Books", "Open Library"]);
const CATALOGUE_HEADERS = {
  accept: "application/json",
  "user-agent": "NoTVerse/2.0 (+https://notverse.1ink.online)",
};

const companionOpeners: Record<string, string> = {
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

/**
 * Intercepts only factual book recommendation / remembered-title turns.
 * Returns null for ordinary conversation so the normal smart companion keeps control.
 * Titles and authors in responses always come from live public catalogue records.
 */
export async function handleGroundedBookTurn(
  request: Request<any, any>,
  env: GroundedEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  if (request.method !== "POST") return null;

  let body: GroundedBody;
  try {
    body = await request.json() as GroundedBody;
  } catch {
    return null;
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return null;
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";
  const history = normalizeHistory(body.history);

  const priorGrounded = extractPriorGrounded(history);
  const follow = classifyGroundedFollowUp(question, priorGrounded);
  if (follow === "explain" && priorGrounded) {
    return json({
      ok: true,
      answer: explainFirstGroundedChoice(priorGrounded, companion),
      mode: "catalogue-grounded-followup",
      model: "verified-public-catalogue",
      companion,
      evidence: { type: "public-catalogue-history", books: priorGrounded.books },
    });
  }

  const currentIntent = detectBookIntent(question);
  const inheritedIntent = follow === "more" && priorGrounded ? priorGrounded.intent : null;
  const intent = currentIntent || inheritedIntent;
  if (!intent) return null;

  const originalQuestion = inheritedIntent
    ? findPreviousUserQuestion(history) || question
    : question;
  const excluded = new Set(priorGrounded?.books.map((book) => normalize(book.title)) || []);
  const searchQuestion = inheritedIntent ? `${originalQuestion} ${question}` : question;

  const candidates = (await discoverBooks(searchQuestion, intent))
    .filter((book) => !excluded.has(normalize(book.title)));

  if (!candidates.length) {
    return json({
      ok: true,
      answer: noMatchAnswer(searchQuestion, companion, intent),
      mode: "catalogue-no-match",
      model: "verified-public-catalogue",
      companion,
      evidence: { type: "public-catalogue", intent, books: [] },
    });
  }

  const requested = intent === "identify" ? Math.min(3, candidates.length) : Math.min(requestedCount(question), candidates.length, 5);
  const indices = await rankCandidates(searchQuestion, candidates, requested, intent, env, ctx);
  const chosen = (indices.length ? indices : candidates.slice(0, requested).map((_book, index) => index))
    .map((index) => candidates[index])
    .filter((book): book is BookCandidate => Boolean(book))
    .slice(0, requested);

  if (!chosen.length) {
    return json({
      ok: true,
      answer: noMatchAnswer(searchQuestion, companion, intent),
      mode: "catalogue-no-match",
      model: "verified-public-catalogue",
      companion,
      evidence: { type: "public-catalogue", intent, books: [] },
    });
  }

  return json({
    ok: true,
    answer: renderGroundedAnswer(searchQuestion, companion, intent, chosen),
    mode: "catalogue-grounded",
    model: "verified-public-catalogue+workers-ai-ranking",
    companion,
    evidence: {
      type: "public-catalogue",
      intent,
      books: chosen.map(stripScore),
    },
  });
}

function detectBookIntent(question: string): BookIntent | null {
  if (/\b(?:half remember|trying to remember|cannot remember|can't remember|what (?:book|novel|title) (?:is|was|might)|what might it be|which book was it|remember a .*book|remember a .*novel)\b/i.test(question)) return "identify";
  if (/\b(?:recommend(?:ation|ations|ed)?|suggest(?:ion|ions|ed)?|what should i read|reading list|good books?|books?\s+(?:about|on|for)|novels?\s+(?:about|on|for))\b/i.test(question)) return "recommend";
  if (/\b(?:which|what)\b[^?]{0,120}\bbooks?\b[^?]{0,120}\b(?:best|useful|start|choose|read|strongest|practical)\b/i.test(question)) return "recommend";
  if (/\bbooks?\b[^?]{0,120}\b(?:most useful|best for|good for|practical for|fastest practical return)\b/i.test(question)) return "recommend";
  return null;
}

function classifyGroundedFollowUp(
  question: string,
  prior: ReturnType<typeof extractPriorGrounded>,
): "explain" | "more" | null {
  if (!prior) return null;
  if (/\b(?:why|strongest fit|best fit|first (?:one|choice|recommendation|conclusion)|why that|why this)\b/i.test(question)) return "explain";
  if (/\b(?:another|more|different|not this|not it|show more|something else|other one)\b/i.test(question)) return "more";
  return null;
}

function extractPriorGrounded(history: Turn[]): { intent: BookIntent; books: Array<{ title: string; author: string; reason: string }> } | null {
  const assistant = [...history].reverse().find((turn) => turn.role === "assistant" && /\*\*[^*]+\*\*/.test(turn.content));
  if (!assistant) return null;
  const books: Array<{ title: string; author: string; reason: string }> = [];
  const blocks = assistant.content.split(/\n\n+/);
  for (const block of blocks) {
    const match = block.match(/(?:^|\n)\s*\d+\.\s*\*\*([^*]+)\*\*\s*[—-]\s*([^\n(]+)(?:\s*\([^)]*\))?\s*\n?([\s\S]*)/);
    if (!match) continue;
    books.push({
      title: match[1].trim(),
      author: match[2].trim(),
      reason: match[3].trim().slice(0, 500),
    });
  }
  if (!books.length) return null;
  const intent: BookIntent = /checked the clue|likely candidate|remember/i.test(assistant.content) ? "identify" : "recommend";
  return { intent, books };
}

function explainFirstGroundedChoice(
  prior: NonNullable<ReturnType<typeof extractPriorGrounded>>,
  companion: string,
): string {
  const first = prior.books[0];
  const opener = companionOpeners[companion] ?? companionOpeners.Gojo;
  const reason = first.reason || "it had the strongest verified catalogue overlap with the constraints you gave";
  return `${opener} **${first.title}** by ${first.author} stays first because ${lowerFirst(reason)} I am keeping this explanation inside the verified list we already discussed rather than introducing a new title.`;
}

async function discoverBooks(question: string, intent: BookIntent): Promise<BookCandidate[]> {
  const queries = catalogueQueries(question, intent);
  const settled = await Promise.allSettled(queries.flatMap((query) => [
    searchGoogleBooks(query),
    searchOpenLibrary(query),
  ]));
  const books = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return mergeBooks(books)
    .map((book) => ({ ...book, score: scoreBook(book, question, intent) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 12);
}

function catalogueQueries(question: string, intent: BookIntent): string[] {
  const value = question.toLowerCase();
  const hints: string[] = [];
  if (/decision|uncertainty|probability|poker/.test(value)) hints.push("decision making uncertainty probability");
  if (/discipline|motivational|habit/.test(value)) hints.push("discipline habits practice");
  if (/mixed[- ]?methods?|qualitative|quantitative/.test(value)) hints.push("mixed methods research design");
  if (/fashion|clothing|dress/.test(value)) hints.push("fashion history clothing power identity");
  if (/grief|bereave|mourning/.test(value)) hints.push("novel grief healing gentle");
  if (/sleep|insomnia/.test(value)) hints.push("sleep science neuroscience research");
  if (/pricing|professional services|value based fees/.test(value)) hints.push("pricing professional services value based fees");
  if (/butler|missed choices|looking back on (?:his|her|their) life/.test(value)) hints.push("literary novel butler memory regret service");

  const cleaned = question
    .replace(/\b(?:recommend(?:ation|ations|ed)?|suggest(?:ion|ions|ed)?|what should i read|which|what|books?|novels?|read|please|give me|explain|compare|without spoilers?|i half remember|i remember|i am trying to remember|i'm trying to remember|what might it be|most useful|strongest fit)\b/gi, " ")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (cleaned.length >= 3) hints.push(cleaned);
  if (intent === "identify") hints.push(question.slice(0, 220));
  return [...new Set(hints.map((item) => item.trim()).filter((item) => item.length >= 3))].slice(0, 3);
}

async function searchGoogleBooks(query: string): Promise<BookCandidate[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "12");
  url.searchParams.set("printType", "books");
  const response = await fetch(url.toString(), { headers: CATALOGUE_HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Google Books returned ${response.status}`);
  const data = await response.json() as { items?: Array<Record<string, any>> };
  return (data.items || []).flatMap((item) => {
    const info = item.volumeInfo || {};
    const title = clean(info.title, 280);
    if (!title) return [];
    const authors = Array.isArray(info.authors) ? info.authors.map((value: unknown) => clean(value, 140)).filter(Boolean) as string[] : [];
    const identifiers = Object.fromEntries((info.industryIdentifiers || [])
      .map((entry: any) => [clean(entry?.type, 40), clean(entry?.identifier, 80)])
      .filter(([key, value]: [string, string]) => Boolean(key && value)));
    return [{
      key: `google:${String(item.id || normalize(title))}`,
      title,
      authors,
      year: parseYear(info.publishedDate),
      description: cleanDescription(info.description),
      providers: ["Google Books"],
      identifiers,
    }];
  });
}

async function searchOpenLibrary(query: string): Promise<BookCandidate[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "12");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,subject,isbn");
  const response = await fetch(url.toString(), { headers: CATALOGUE_HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Open Library returned ${response.status}`);
  const data = await response.json() as { docs?: Array<Record<string, any>> };
  return (data.docs || []).flatMap((item) => {
    const title = clean(item.title, 280);
    if (!title) return [];
    const authors = Array.isArray(item.author_name) ? item.author_name.map((value: unknown) => clean(value, 140)).filter(Boolean) as string[] : [];
    const identifiers: Record<string, string> = {};
    if (Array.isArray(item.isbn) && item.isbn[0]) identifiers.ISBN = clean(item.isbn[0], 80);
    const subjects = Array.isArray(item.subject)
      ? item.subject.slice(0, 10).map((value: unknown) => clean(value, 80)).filter(Boolean).join(" · ")
      : undefined;
    return [{
      key: `openlibrary:${String(item.key || normalize(title))}`,
      title,
      authors,
      year: typeof item.first_publish_year === "number" ? item.first_publish_year : undefined,
      description: subjects || undefined,
      providers: ["Open Library"],
      identifiers,
    }];
  });
}

function mergeBooks(items: BookCandidate[]): BookCandidate[] {
  const merged = new Map<string, BookCandidate>();
  for (const book of items) {
    const key = `${normalize(book.title)}|${normalize(book.authors[0] || "")}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, book);
      continue;
    }
    merged.set(key, {
      ...current,
      year: current.year || book.year,
      description: longer(current.description, book.description),
      providers: [...new Set([...current.providers, ...book.providers])].filter((value) => PUBLIC_PROVIDERS.has(value)),
      identifiers: { ...book.identifiers, ...current.identifiers },
    });
  }
  return [...merged.values()];
}

function scoreBook(book: BookCandidate, question: string, intent: BookIntent): number {
  const q = meaningfulTokens(question);
  const title = new Set(meaningfulTokens(book.title));
  const authors = new Set(meaningfulTokens(book.authors.join(" ")));
  const description = new Set(meaningfulTokens(book.description || ""));
  let score = book.providers.length * 2;
  for (const token of q) {
    if (title.has(token)) score += 6;
    if (authors.has(token)) score += 4;
    if (description.has(token)) score += 1.5;
  }
  if (book.identifiers.ISBN || book.identifiers.ISBN_13 || book.identifiers.ISBN_10) score += 1;
  if (intent === "identify" && /butler/i.test(question) && /butler|servant|service/i.test(`${book.title} ${book.description || ""}`)) score += 8;
  if (intent === "identify" && /missed choices|regret|looking back/i.test(question) && /memory|regret|past|life/i.test(book.description || "")) score += 5;
  return score;
}

async function rankCandidates(
  question: string,
  candidates: BookCandidate[],
  desired: number,
  intent: BookIntent,
  env: GroundedEnv,
  ctx: ExecutionContext,
): Promise<number[]> {
  const shortlist = candidates.slice(0, 10).map((book, index) => ({
    index,
    title: book.title,
    authors: book.authors,
    year: book.year,
    description: book.description,
    providers: book.providers,
  }));
  const prompt = [
    "Rank only the verified public-catalogue candidates supplied.",
    "Never invent, rename or add a title or author.",
    "Use only supplied metadata and the user's constraints.",
    intent === "identify" ? `Return the ${desired} most likely remembered-title matches.` : `Return the ${desired} best recommendation matches.`,
    'Return JSON only: {"indices":[0,1,2]}',
  ].join(" ");
  const models = [...new Set(["@cf/zai-org/glm-4.7-flash", env.AI_MODEL, "@cf/qwen/qwen3-30b-a3b-fp8"].filter(Boolean))];
  for (const model of models) {
    try {
      const result = await env.AI.run(model as keyof AiModels, {
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Request: ${question}\nCandidates: ${JSON.stringify(shortlist)}` },
        ],
        max_tokens: 150,
        temperature: 0.1,
      });
      const text = extractText(result);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]) as { indices?: unknown[] };
      if (!Array.isArray(parsed.indices)) continue;
      const indices = [...new Set(parsed.indices.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value < candidates.length))].slice(0, desired);
      if (indices.length) return indices;
    } catch (error) {
      ctx.waitUntil(Promise.resolve(console.warn("NoTVerse grounded ranking fallback", model, error)));
    }
  }
  return [];
}

function renderGroundedAnswer(question: string, companion: string, intent: BookIntent, books: BookCandidate[]): string {
  const opener = companionOpeners[companion] ?? companionOpeners.Gojo;
  const lines = [intent === "identify"
    ? `${opener} I checked your clue against live public book catalogues instead of guessing a title.`
    : `${opener} I checked these titles against live public book catalogues first, so the names and authors below are grounded rather than invented.`];

  books.forEach((book, index) => {
    const author = book.authors.length ? book.authors.join(", ") : "author not listed in the catalogue result";
    const year = book.year ? ` (${book.year})` : "";
    lines.push(`${index + 1}. **${book.title}** — ${author}${year}\n${groundedReason(book, question, index === 0)}`);
  });

  lines.push(intent === "identify"
    ? "If that is not it, tell me one more clue—rough year, cover detail, country, character name, or where you saw it—and I will exclude these candidates and search again."
    : "If you want, give me one tighter constraint—beginner vs specialist, fiction vs nonfiction, practical vs academic—and I will narrow the verified list further.");
  return lines.join("\n\n");
}

function groundedReason(book: BookCandidate, question: string, strongest: boolean): string {
  const q = new Set(meaningfulTokens(question));
  const matched = meaningfulTokens(`${book.title} ${book.description || ""}`).filter((token) => q.has(token)).slice(0, 5);
  const providerText = book.providers.length > 1 ? "both public catalogue records" : book.providers[0] || "the public catalogue record";
  if (matched.length) {
    return `${strongest ? "Strongest fit: " : "Fit: "}${providerText} overlap with your request on ${matched.join(", ")}. I am not adding claims beyond that verified metadata.`;
  }
  if (book.description) {
    return `${strongest ? "Strongest fit: " : "Fit: "}${providerText} returned this candidate for your request and supplied descriptive metadata supporting the match. I am keeping the recommendation inside that evidence.`;
  }
  return `${strongest ? "Strongest fit: " : "Fit: "}${providerText} verified the title and author, but exposed too little descriptive metadata for me to claim more than a catalogue-level match.`;
}

function noMatchAnswer(question: string, companion: string, intent: BookIntent): string {
  const opener = companionOpeners[companion] ?? companionOpeners.Gojo;
  const topic = compactTopic(question);
  return intent === "identify"
    ? `${opener} I searched the live public catalogues for ${topic}, but I could not verify a strong candidate. Give me one more clue and I will narrow it rather than invent a title.`
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

function requestedCount(question: string): number {
  if (/\b(?:five|5)\b/i.test(question)) return 5;
  if (/\b(?:four|4)\b/i.test(question)) return 4;
  if (/\b(?:two|2)\b/i.test(question)) return 2;
  return 3;
}

function meaningfulTokens(value: string): string[] {
  const stop = new Set(["about", "after", "again", "book", "books", "give", "have", "into", "most", "novel", "novels", "read", "recommend", "recommendation", "should", "someone", "that", "their", "them", "this", "three", "what", "when", "where", "which", "with", "without", "would", "your"]);
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 2 && !stop.has(token)))];
}

function compactTopic(question: string): string {
  const text = question.replace(/\b(?:recommend(?:ation|ations|ed)?|suggest(?:ion|ions|ed)?|books?|novels?|please|give me|what should i read|which|what|explain|and why|why)\b/gi, " ")
    .replace(/\s+/g, " ").replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, " ").trim();
  return text.slice(0, 120) || "that subject";
}

function stripScore(book: BookCandidate): Omit<BookCandidate, "score"> {
  const { score: _score, ...rest } = book;
  return rest;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanDescription(value: unknown): string | undefined {
  const text = clean(value, 1000).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 650) : undefined;
}

function parseYear(value: unknown): number | undefined {
  const match = typeof value === "string" ? value.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/) : null;
  return match ? Number(match[0]) : undefined;
}

function longer(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

function lowerFirst(value: string): string {
  const cleanValue = value.trim().replace(/[.!?]+$/, "");
  return cleanValue ? cleanValue[0].toLowerCase() + cleanValue.slice(1) + "." : "it best matched the constraints you gave.";
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
    if (message && typeof message === "object") {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") return content.trim();
    }
  }
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
