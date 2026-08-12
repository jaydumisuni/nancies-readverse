import { HEADERS, OPENERS, jsonResponse as json, normalize, parseYear } from "./grounded-shared";

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
type TopicPack = {
  id: "gambling" | "grief" | "sleep" | "pricing";
  matches(question: string): boolean;
  seeds: Seed[];
  minVerified: number;
  intro: string;
  reasons: string[];
  tail: string;
};

const TOPICS: TopicPack[] = [
  {
    id: "gambling",
    matches: (q) => /\b(?:recommend(?:ation|ations|ed)?|suggest(?:ion|ions|ed)?|books?\s+(?:about|on|for)|what should i read)\b/i.test(q)
      && /\b(?:gambling|casino|betting|wager|poker)\b/i.test(q),
    seeds: [
      { title: "Addiction by Design", author: "Natasha Dow Schüll" },
      { title: "The Biggest Bluff", author: "Maria Konnikova" },
      { title: "Thinking in Bets", author: "Annie Duke" },
      { title: "The Theory of Gambling and Statistical Logic", author: "Richard A. Epstein" },
    ],
    minVerified: 3,
    intro: "I checked these gambling titles against live public book catalogues before recommending them.",
    reasons: [
      "Strongest fit: it approaches gambling as a designed behavioural system, which gives you more than rules or anecdotes.",
      "Fit: it connects poker, uncertainty and decision-making in a readable real-world frame.",
      "Fit: it focuses on decisions under uncertainty and the quality of a bet rather than pretending outcomes prove the decision was good.",
    ],
    tail: "If you want the probability/statistics side specifically, I can narrow this verified list in that direction.",
  },
  {
    id: "grief",
    matches: (q) => /\b(?:grief|grieving|bereavement|mourning|loss)\b/i.test(q)
      && /\b(?:novel|fiction|book|read|suggest|recommend)\b/i.test(q),
    seeds: [
      { title: "A Man Called Ove", author: "Fredrik Backman" },
      { title: "The Reading List", author: "Sara Nisha Adams" },
      { title: "The Collected Regrets of Clover", author: "Mikki Brammer" },
      { title: "The Storied Life of A.J. Fikry", author: "Gabrielle Zevin" },
    ],
    minVerified: 1,
    intro: "I checked these gentler grief novels against live public book catalogues before suggesting them.",
    reasons: [
      "Strongest fit: grief is central, but warmth, community and dry humour keep the story from becoming relentlessly bleak.",
      "Fit: it uses reading and human connection as a route through loneliness and grief rather than treating loss as spectacle.",
      "Fit: it stays close to grief and mortality while leaving room for tenderness, change and ordinary life.",
    ],
    tail: "If you tell me whether you want quiet, funny, romantic or family-centred, I can narrow the verified grief choices further.",
  },
  {
    id: "sleep",
    matches: (q) => /\b(?:sleep|insomnia|circadian)\b/i.test(q)
      && /\b(?:scientific|science|read|book|understand|research)\b/i.test(q),
    seeds: [
      { title: "Why We Sleep", author: "Matthew Walker" },
      { title: "The Sleep Solution", author: "W. Chris Winter" },
      { title: "The Secret World of Sleep", author: "Penelope A. Lewis" },
      { title: "The Promise of Sleep", author: "William C. Dement" },
    ],
    minVerified: 1,
    intro: "I checked these sleep books against live public catalogues first; they are better starting points for scientific sleep reading than wellness-style claims with no source trail.",
    reasons: [
      "Strongest fit: it gives a broad map of sleep science and why sleep matters; treat individual claims as starting points to verify against current research rather than as unquestionable rules.",
      "Fit: it is written from clinical sleep-medicine practice and is useful for separating common sleep problems from generic wellness advice.",
      "Fit: it focuses on what the sleeping brain is doing, giving you a neuroscience-oriented route into the subject.",
    ],
    tail: "If you want the most academic route, I can narrow this to textbooks and review literature instead of popular-science books.",
  },
  {
    id: "pricing",
    matches: (q) => /\b(?:pricing|fees?|rates?|value pricing)\b/i.test(q)
      && /\b(?:professional|services|consulting|consultant|agency|creative)\b/i.test(q),
    seeds: [
      { title: "Implementing Value Pricing", author: "Ronald J. Baker" },
      { title: "Million Dollar Consulting", author: "Alan Weiss" },
      { title: "The Win Without Pitching Manifesto", author: "Blair Enns" },
      { title: "Pricing Creativity", author: "Blair Enns" },
    ],
    minVerified: 1,
    intro: "I checked these pricing and professional-services titles against live public book catalogues before ranking them.",
    reasons: [
      "Strongest fit: it directly challenges hourly billing and gives a value-pricing framework, so the practical return is closest to the pricing decision itself.",
      "Fit: it connects consulting economics, positioning and fees, which is useful when the service itself is the product.",
      "Fit: it is especially useful when expertise is sold through proposals, pitches or creative services and pricing power depends on positioning.",
    ],
    tail: "If you tell me whether you sell consulting, repair, agency or creative work, I can narrow the verified pricing list to the fastest practical fit.",
  },
];

/**
 * High-signal topic anchors for cases where broad catalogue ranking tends to return
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
  const topic = TOPICS.find((candidate) => candidate.matches(question));
  if (!topic) return null;
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";

  const settled = await Promise.allSettled(topic.seeds.map(verifySeed));
  const books = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const unique = dedupe(books).slice(0, 4);
  if (unique.length < topic.minVerified) return null;

  const opener = OPENERS[companion] ?? OPENERS.Gojo;
  const lines = [`${opener} ${topic.intro}`];
  const reasonBySeed = new Map(
    topic.seeds.map((seed, index) => [normalize(seed.title), topic.reasons[index]] as const),
  );
  unique.slice(0, 3).forEach((book, index) => {
    const author = book.authors.join(", ") || "author not listed in the catalogue result";
    const year = book.year ? ` (${book.year})` : "";
    const reason = reasonBySeed.get(normalize(book.title))
      || "Fit: the public catalogue verified this title and author for the topic you asked about.";
    lines.push(`${index + 1}. **${book.title}** — ${author}${year}\n${reason}`);
  });
  lines.push(topic.tail);

  return json({
    ok: true,
    answer: lines.join("\n\n"),
    mode: "catalogue-grounded",
    model: `verified-public-catalogue+canonical-topic-seeds:${topic.id}`,
    companion,
    evidence: { type: "public-catalogue", intent: "recommend", topic: topic.id, books: unique.slice(0, 3) },
  });
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
    // Use canonical display text only after a live catalogue independently matched
    // this exact normalized title + author pair.
    title: seed.title,
    authors: [seed.author],
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
  url.searchParams.set("q", `intitle:${JSON.stringify(seed.title)} inauthor:${JSON.stringify(seed.author)}`);
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
