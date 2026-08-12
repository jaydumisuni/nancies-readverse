import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.WORKER_URL || "http://127.0.0.1:8790";
const out = process.env.PROOF_DIR || "engineering-evidence/mobile-notes-chat";
await mkdir(out, { recursive: true });

const question = "Do you have recommendations for books I can read on gambling?";
const response = await fetch(`${baseUrl}/api/companion/help`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    question,
    companion: "Gojo",
    vibe: "Playful, confident, teasing and protective. Answer the user's real question first.",
    history: [
      { role: "companion", text: "There you are. What are we reading today?" },
      { role: "user", text: question },
    ],
  }),
});

const body = await response.json();
const answer = typeof body.answer === "string" ? body.answer.trim() : "";
const sourceMisroute = /paste (?:the |a )?link|attach (?:the |a )?file|inspect public redirects/i.test(answer);
const groundedMode = /catalogue-grounded|verified/i.test(String(body.mode || ""))
  || /verified-public-catalogue/i.test(String(body.model || ""));

// The grounded recommender may legitimately return different catalogue titles
// as public records change. Prove the response contains three concrete numbered
// title entries instead of pinning the regression test to one historical list.
const concreteTitles = [...answer.matchAll(/^\s*\d+\.\s+\*\*([^*\n]+)\*\*/gm)]
  .map((match) => match[1].trim())
  .filter(Boolean);
const uniqueTitles = [...new Set(concreteTitles)];
const genericOnly = /i (?:can|will) give you|tell me whether you prefer/i.test(answer)
  && uniqueTitles.length === 0;
const hasGroundingLanguage = /checked the titles|verified records|public book catalogues|Open Library|Google Books/i.test(answer);

const report = {
  ok: response.ok
    && Boolean(answer)
    && !sourceMisroute
    && !genericOnly
    && groundedMode
    && hasGroundingLanguage
    && uniqueTitles.length >= 3,
  status: response.status,
  mode: body.mode,
  model: body.model,
  question,
  answer,
  sourceMisroute,
  genericOnly,
  groundedMode,
  hasGroundingLanguage,
  concreteTitles: uniqueTitles,
};

await writeFile(`${out}/companion-runtime-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Companion runtime proof passed with ${uniqueTitles.length} grounded concrete titles.`);
