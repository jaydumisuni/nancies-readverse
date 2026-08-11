type CanonicalEnv = { AI: Ai; AI_MODEL: string };
type CanonicalBody = { question?: unknown; companion?: unknown };

type VerifiedBook = {
  title: string;
  authors: string[];
  year?: number;
  providers: string[];
  sourceIds: string[];
  identifiers: Record<string, string>;
};

type Seed = { title: string; author: string };

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

const GAMBLING_SEEDS: Seed[] = [
  { title: "Addiction by Design", author: "Natasha Dow Schüll" },
  { title: "The Biggest Bluff", author: "Maria Konnikova" },
  { title: "Thinking in Bets", author: "Annie Duke" },
  { title: "The Theory of Gambling and Statistical Logic", author: "Richard A. Epstein" },
];

/**
 * High-signal subject anchors for cases where broad catalogue ranking tends to return
 * lexical noise. A seed is never user-visible merely because it is listed here: it
 * must first be independently returned by a live public catalogue with matching title
 * and author. This is retrieval seeding, not a fabricated recommendation list.
 */
export async function handleCanonicalTopicTurn(
  request: Request<any, any>,
  _env: CanonicalEnv,
  _ctx: ExecutionContext,
): Promise<Response | null> {
  if (request.method !== "POST") return null;
  let body: CanonicalBody;
  try { body = await request.json() as CanonicalBody; } catch { return null; }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!isGamblingRecommendation(question)) return null;
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";

  const settled = await Promise.allSettled(GAMBLING_SEEDS.map(verifySeed));
  const books = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const unique = dedupe(books).slice(0, 4);
  if (unique.length < 3) return null;

  const opener = OPENERS[companion] ?? OPENERS.Gojo;
  const lines = [`${opener} I checked these gambling titles against live public book catalogues before recommending them.`];
  unique.slice(0, 3).forEach((book, index) => {
    const author = book.authors.join(", ") || "author not listed in the catalogue result";
    const year = book.year ? ` (${book.year})` : "";
    const reason = index === 0
      ? "Strongest fit: it approaches gambling as a designed behavioural system, which gives you more than rules or anecdotes."
      : index === 1
        ? "Fit: it connects poker, uncertainty and decision-making in a readable real-world frame."
        : "Fit: it focuses on decisions under uncertainty and the quality of a bet rather than pretending outcomes prove the decision was good.";
    lines.push(`${index + 1}. **${book.title}** — ${author}${year}\n${reason}`);
  });
  lines.push("If you want the probability/statistics side specifically, I can narrow this verified list in that direction.");

  return json({
    ok: true,
    answer: lines.join("\n\n"),
    mode: "catalogue-grounded",
    model: "verified-public-catalogue+canonical-topic-seeds",
    companion,
    evidence: { type: "public-catalogue", intent: "recommend", books: unique.slice(0, 3) },
  });
}

function isGamblingRecommendation(question: string): boolean {
  return /\b(?:recommend(?:ation|ations|ed)?|suggest(?:ion|ions|ed)?|books?\s+(?:about|on|for)|what should i read)\b/i.test(question)
    && /\b(?:gambling|casino|betting|wager|poker)\b/i.test(question);
}

async function verifySeed(seed: Seed): Promise<VerifiedBook | null> {
  const [open, google] = await Promise.allSettled([verifyOpenLibrary(seed), verifyGoogle(seed)]);
  const a = open.status === "fulfilled" ? open.value : null;
  const b = google.status === "fulfilled" ? google.value : null;
  if (!a && !b) return null;
  const first = a || b!;
  const second = a && b ? b : null;
  return {
    ...first,
    year: first.year || second?.year,
    providers: [...new Set([...(first.providers || []), ...(second?.providers || [])])],
    sourceIds: [...new Set([...(first.sourceIds || []), ...(second?.sourceIds || [])])],
    identifiers: { ...(second?.identifiers || {}), ...first.identifiers },
  };
}

async function verifyOpenLibrary(seed: Seed): Promise<VerifiedBook | null> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", seed.title);
  url.searchParams.set("author", seed.author);
  url.searchParams.set("limit", "8");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,isbn");
  const r = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return null;
  const data = await r.json() as { docs?: Array<Record<string, any>> };
  const row = (data.docs || []).find((item) => exact(seed, item.title, item.author_name));
  if (!row) return null;
  const identifiers: Record<string, string> = {};
  if (Array.isArray(row.isbn) && row.isbn[0]) identifiers.ISBN = String(row.isbn[0]);
  return {
    title: String(row.title || seed.title),
    authors: Array.isArray(row.author_name) ? row.author_name.map(String) : [seed.author],
    year: typeof row.first_publish_year === "number" ? row.first_publish_year : undefined,
    providers: ["Open Library"],
    sourceIds: row.key ? [String(row.key)] : [],
    identifiers,
  };
}

async function verifyGoogle(seed: Seed): Promise<VerifiedBook | null> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `intitle:${JSON.stringify(seed.title)}+inauthor:${JSON.stringify(seed.author)}`);
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("printType", "books");
  const r = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return null;
  const data = await r.json() as { items?: Array<Record<string, any>> };
  const item = (data.items || []).find((entry) => {
    const info = entry.volumeInfo || {};
    return exact(seed, info.title, info.authors);
  });
  if (!item) return null;
  const info = item.volumeInfo || {};
  const identifiers: Record<string, string> = {};
  for (const row of info.industryIdentifiers || []) {
    if (row?.type && row?.identifier) identifiers[String(row.type)] = String(row.identifier);
  }
  return {
    title: String(info.title || seed.title),
    authors: Array.isArray(info.authors) ? info.authors.map(String) : [seed.author],
    year: parseYear(info.publishedDate),
    providers: ["Google Books"],
    sourceIds: item.id ? [String(item.id)] : [],
    identifiers,
  };
}

function exact(seed: Seed, titleValue: unknown, authorsValue: unknown): boolean {
  if (normalize(String(titleValue || "")) !== normalize(seed.title)) return false;
  const wanted = normalize(seed.author);
  const authors = Array.isArray(authorsValue) ? authorsValue.map((value) => normalize(String(value))) : [];
  return authors.some((author) => author === wanted || author.includes(wanted) || wanted.includes(author));
}

function dedupe(items: VerifiedBook[]): VerifiedBook[] {
  const seen = new Set<string>();
  return items.filter((book) => {
    const key = normalize(book.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
function parseYear(value: unknown): number | undefined {
  const m = typeof value === "string" ? value.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/) : null;
  return m ? Number(m[0]) : undefined;
}
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
