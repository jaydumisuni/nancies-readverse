import { mkdir, writeFile } from "node:fs/promises";

const baseURL = (process.env.NOTVERSE_URL || "").replace(/\/$/, "");
const output = process.env.PROOF_DIR || "engineering-evidence/production-polish-live";
if (!baseURL) throw new Error("NOTVERSE_URL is required");
await mkdir(output, { recursive: true });

const cases = [
  ["Gojo", "Recommend three books about decision-making under uncertainty and explain why each is useful.", ["decision", "uncertainty", "probability", "poker"]],
  ["Itachi", "Compare 1984 and Brave New World without spoilers. What different danger does each examine?", ["1984", "brave new world", "control", "freedom"]],
  ["Naruto", "I have lost my reading motivation. Give me a realistic way to restart without forcing a huge goal.", ["reading", "small", "minutes", "chapter"]],
  ["Kakashi", "I half remember a literary novel about a butler looking back on his life and missed choices. What might it be?", ["remains of the day", "ishiguro", "butler"]],
  ["Megumi", "Explain the difference between a manga chapter, volume and omnibus so a beginner can buy the right thing.", ["chapter", "volume", "omnibus"]],
  ["Sasuke", "Recommend a concise book about discipline that is not empty motivational hype, and explain the trade-off.", ["discipline", "habit", "practice"]],
  ["Maki", "Which research methods book is most useful for someone designing their first mixed-methods study, and why?", ["research", "methods", "qualitative", "quantitative"]],
  ["Nobara", "Recommend three readable books on fashion history that connect clothing to power and identity.", ["fashion", "clothing", "identity", "dress"]],
  ["Hinata", "Suggest a gentle novel for someone processing grief, but avoid anything relentlessly bleak.", ["grief", "gentle", "novel"]],
  ["Sakura", "What should I read to understand sleep scientifically without drifting into wellness misinformation?", ["sleep", "science", "research"]],
  ["Temari", "Compare principled negotiation with hard bargaining. When does each approach fail?", ["negotiation", "bargaining", "interest", "position"]],
  ["Mei Mei", "Recommend books on pricing professional services and explain which one gives the fastest practical return.", ["pricing", "value", "services", "business"]],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function ask(companion, question, history = []) {
  const response = await fetch(`${baseURL}/api/companion/help`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companion, question, history }),
  });
  const body = await response.json();
  assert(response.ok && body.ok && typeof body.answer === "string", `${companion}: companion request failed (${response.status}) ${JSON.stringify(body)}`);
  return { answer: body.answer.trim(), mode: body.mode, model: body.model };
}

const report = { ok: false, baseURL, generatedAt: new Date().toISOString(), cases: [], checks: [] };
const greetings = new Set();

for (const [companion, question, expected] of cases) {
  const greeting = await ask(companion, "Hi");
  greetings.add(greeting.answer);
  assert(greeting.answer.length >= 25, `${companion}: greeting is too thin: ${JSON.stringify(greeting)}`);
  assert(!/paste (?:the |a )?link|attach (?:the |a )?file/i.test(greeting.answer), `${companion}: greeting was misrouted to source handling: ${JSON.stringify(greeting)}`);

  const main = await ask(companion, question, [{ role: "assistant", text: greeting.answer }]);
  assert(main.mode !== "contextual-rules", `${companion}: substantive answer fell back to deterministic rules instead of live companion intelligence: ${JSON.stringify(main)}`);
  assert(typeof main.model === "string" && main.model.length > 0, `${companion}: substantive answer did not report a live AI model: ${JSON.stringify(main)}`);
  assert(main.answer.length >= 90, `${companion}: main answer is too generic (${main.answer.length} characters): ${JSON.stringify(main)}`);
  assert(!/paste (?:the |a )?link|attach (?:the |a )?file|inspect public redirects/i.test(main.answer), `${companion}: ordinary question was misrouted to source handling: ${JSON.stringify(main)}`);
  assert(!/i (?:opened|saved|uploaded|verified) (?:the |your )/i.test(main.answer), `${companion}: answer claimed an unconfirmed action: ${JSON.stringify(main)}`);
  const lower = main.answer.toLowerCase();
  assert(expected.some((term) => lower.includes(term)), `${companion}: answer did not address the requested topic. Expected one of ${expected.join(", ")}. Actual: ${JSON.stringify(main)}`);

  const followQuestion = "Why is your first conclusion or recommendation the strongest fit for what I asked?";
  const followHistory = [
    { role: "assistant", text: greeting.answer },
    { role: "user", text: question },
    { role: "assistant", text: main.answer },
  ];
  const follow = await ask(companion, followQuestion, followHistory);
  assert(follow.mode !== "contextual-rules", `${companion}: follow-up fell back to deterministic rules instead of using conversation intelligence: ${JSON.stringify(follow)}`);
  assert(typeof follow.model === "string" && follow.model.length > 0, `${companion}: follow-up did not report a live AI model: ${JSON.stringify(follow)}`);
  assert(follow.answer.length >= 60, `${companion}: follow-up answer is too thin: ${JSON.stringify(follow)}`);
  assert(follow.answer !== main.answer, `${companion}: follow-up repeated the previous answer: ${JSON.stringify(follow)}`);
  assert(!/ask me about a book|tell me more|what would you like|try that question again/i.test(follow.answer), `${companion}: follow-up reset to generic conversation: ${JSON.stringify(follow)}`);

  report.cases.push({ companion, question, greeting, main, followQuestion, follow });
  await writeFile(`${output}/companion-matrix-partial.json`, `${JSON.stringify(report, null, 2)}\n`);
}

assert(greetings.size >= 8, `companion greetings are not distinct enough (${greetings.size}/12 unique)`);
report.checks = [
  "all twelve companions answer a greeting naturally",
  "all twelve substantive turns use live AI rather than deterministic fallback",
  "all twelve answer the actual topic rather than source-upload instructions",
  "main answers contain topic-relevant substance",
  "follow-ups use conversation history instead of resetting",
  "no companion claims an unconfirmed save, open, upload or verification",
  "companion voices produce at least eight distinct greetings",
];
report.ok = true;
await writeFile(`${output}/companion-matrix.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, companions: report.cases.length, uniqueGreetings: greetings.size, checks: report.checks }, null, 2));
