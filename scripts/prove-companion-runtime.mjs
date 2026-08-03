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
const relevant = /gambl|fiction|memoir|research|practical|probability|psychology|addiction|poker|beginner/i.test(answer);

const report = {
  ok: response.ok && Boolean(answer) && !sourceMisroute && relevant,
  status: response.status,
  mode: body.mode,
  model: body.model,
  question,
  answer,
  sourceMisroute,
  relevant,
};

await writeFile(`${out}/companion-runtime-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Companion runtime proof passed: ${answer}`);
