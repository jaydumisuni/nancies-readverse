import { readFile } from "node:fs/promises";

const worker = await readFile("worker/index.ts", "utf8");
const app = await readFile("src/App.tsx", "utf8");
const config = await readFile("wrangler.jsonc", "utf8");
const rules = await readFile("docs/READVERSE_PRODUCT_RULES.md", "utf8");

const failures = [];
const forbidden = [
  ["worker", worker, "LIBRARY_FILES"],
  ["worker", worker, "DB.prepare"],
  ["worker", worker, "/api/library/upload"],
  ["worker", worker, "/api/library/import-url"],
  ["worker", worker, "/api/gogo/"],
  ["app", app, "localStorage"],
  ["app", app, "/api/library/upload"],
  ["app", app, "/api/library/import-url"],
  ["config", config, "r2_buckets"],
  ["config", config, "d1_databases"],
  ["config", config, "kv_namespaces"],
];
for (const [where, text, token] of forbidden) {
  if (text.includes(token)) failures.push(`${where} still contains forbidden token: ${token}`);
}

const required = [
  ["worker", worker, "/api/source/resolve"],
  ["worker", worker, "/api/source/stream"],
  ["worker", worker, "temporary-stream"],
  ["worker", worker, "normalizeHistory"],
  ["app", app, "URL.createObjectURL"],
  ["app", app, "URL.revokeObjectURL"],
  ["app", app, "No copy was uploaded to Cloudflare"],
  ["app", app, "Google Drive is not connected yet"],
  ["rules", rules, "Canonical Product Rules"],
];
for (const [where, text, token] of required) {
  if (!text.includes(token)) failures.push(`${where} is missing required token: ${token}`);
}

for (const name of ["Gojo", "Itachi", "Naruto", "Kakashi", "Megumi", "Sasuke", "Maki", "Nobara", "Hinata", "Sakura", "Temari", "Mei Mei"]) {
  if (!worker.includes(`${name}:`) && !worker.includes(`"${name}":`)) failures.push(`worker personality missing: ${name}`);
  if (!app.includes(`name: "${name}"`)) failures.push(`app companion missing: ${name}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Canonical transient-storage architecture verified.");
