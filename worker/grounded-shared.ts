export const HEADERS = {
  accept: "application/json",
  "user-agent": "NoTVerse/2.0 (+https://notverse.1ink.online)",
};

export const OPENERS: Record<string, string> = {
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

export function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseYear(value: unknown): number | undefined {
  const match = typeof value === "string" ? value.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/) : null;
  return match ? Number(match[0]) : undefined;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
