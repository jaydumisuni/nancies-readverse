import { mkdir, writeFile } from "node:fs/promises";

const baseURL = (process.env.NOTVERSE_URL || "").replace(/\/$/, "");
const output = process.env.PROOF_DIR || "engineering-evidence/production-polish-live";
if (!baseURL) throw new Error("NOTVERSE_URL is required");
await mkdir(output, { recursive: true });

const response = await fetch(`${baseURL}/api/discovery/search`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "Pride and Prejudice Jane Austen ISBN 9780141439518" }),
});
const body = await response.json();
if (!response.ok || !body.ok || !Array.isArray(body.candidates) || !body.candidates.length) {
  throw new Error(`Live public catalogue search failed: ${response.status} ${JSON.stringify(body)}`);
}
const rated = body.candidates.find((candidate) => candidate.rating?.overall && candidate.rating?.ratingCount > 0);
if (!rated) throw new Error(`Live discovery returned no public rating: ${JSON.stringify(body.candidates)}`);
if (!Array.isArray(rated.rating.sources) || !rated.rating.sources.length) throw new Error("Live rating did not preserve its public source records");
if (rated.rating.sources.some((source) => !source.name || !source.sourceId || source.ratingCount <= 0)) throw new Error("A live rating source is missing its identifier or rating count");

const report = {
  ok: true,
  query: body.query,
  title: rated.title,
  authors: rated.authors,
  rating: rated.rating,
  providers: body.providers,
  generatedAt: new Date().toISOString(),
};
await writeFile(`${output}/public-rating-live.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
