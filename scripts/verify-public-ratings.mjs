import { pathToFileURL } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const originalFetch = globalThis.fetch;
const fixtureIsbn = "9780141439518";

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "www.googleapis.com" && url.pathname === "/books/v1/volumes") {
    return Response.json({
      items: [{
        id: "google-pride",
        volumeInfo: {
          title: "Pride and Prejudice",
          authors: ["Jane Austen"],
          publishedDate: "1813",
          averageRating: 4.4,
          ratingsCount: 1200,
          industryIdentifiers: [{ type: "ISBN_13", identifier: fixtureIsbn }],
          imageLinks: { thumbnail: "https://example.test/pride.jpg" },
        },
        accessInfo: { accessViewStatus: "NONE" },
      }],
    });
  }
  if (url.hostname === "openlibrary.org" && url.pathname === "/search.json") {
    return Response.json({
      docs: [{
        key: "/works/OL66554W",
        title: "Pride and Prejudice",
        author_name: ["Jane Austen"],
        first_publish_year: 1813,
        isbn: [fixtureIsbn],
        ratings_average: 4.1,
        ratings_count: 800,
      }],
    });
  }
  return originalFetch(input, init);
};

try {
  const module = await import(`${pathToFileURL("dist/nancies_readverse/index.js").href}?ratings=${Date.now()}`);
  const handler = module.default;
  const response = await handler.fetch(new Request("https://notverse.test/api/discovery/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Pride and Prejudice Jane Austen" }),
  }), {
    APP_NAME: "NoTVerse",
    AI_MODEL: "fixture",
    ASSETS: { fetch: async () => new Response("asset") },
    AI: { run: async () => ({ response: "fixture" }) },
  }, { waitUntil() {}, passThroughOnException() {} });
  const body = await response.json();
  assert(response.ok && body.ok, "public rating discovery request failed");
  assert(body.candidates?.length === 1, "edition-matched public catalogue results were not merged");
  const candidate = body.candidates[0];
  assert(candidate.rating, "public rating was not attached to the discovery candidate");
  assert(candidate.rating.sourceCount === 2, "both public rating sources were not included");
  assert(candidate.rating.ratingCount === 2000, "public rating counts were not preserved");
  assert(candidate.rating.overall > 4.1 && candidate.rating.overall < 4.4, "weighted public rating is outside source bounds");
  assert(candidate.rating.sources.some((source) => source.name === "Google Books"), "Google Books rating source is missing");
  assert(candidate.rating.sources.some((source) => source.name === "Open Library"), "Open Library rating source is missing");
  console.log(JSON.stringify({ ok: true, rating: candidate.rating }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
}
