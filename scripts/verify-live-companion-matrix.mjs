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
  assert(greeting.answer.length >= 25, `${companion}: greeting is too thin`);
  assert(!/paste (?:the |a )?link|attach (?:the |a )?file/i.test(greeting.answer), `${companion}: greeting was misrouted to source handling`);

  const history = [
    { role: "assistant", text: greeting.answer },
    { role: "user", text: question },
  ];
  const main = await ask(companion, question, history.slice(0, 1));
  assert(main.answer.length >= 90, `${companion}: main answer is too generic (${main.answer.length} characters)`);
  assert(!/paste (?:the |a )?link|attach (?:the |a )?file|inspect public redirects/i.test(main.answer), `${companion}: ordinary question was misrouted to source handling`);
  assert(!/i (?:opened|saved|uploaded|verified) (?:the |your )/i.test(main.answer), `${companion}: answer claimed an unconfirmed action`);
  const lower = main.answer.toLowerCase();
  assert(expected.some((term) => lower.includes(term)), `${companion}: answer did not address the requested topic. Expected one of ${expected.join(", ")}`);

  const followQuestion = "Why is your first conclusion or recommendation the strongest fit for what I asked?";
  const followHistory = [
    { role: "assistant", text: greeting.answer },
    { role: "user", text: question },
    { role: "assistant", text: main.answer },
  ];
  const follow = await ask(companion, followQuestion, followHistory);
  assert(follow.answer.length >= 60, `${companion}: follow-up answer is too thin`);
  assert(follow.answer !== main.answer, `${companion}: follow-up repeated the previous answer`);
  assert(!/ask me about a book|tell me more|what would you like/i.test(follow.answer), `${companion}: follow-up reset to generic conversation`);

  report.cases.push({ companion, question, greeting, main, followQuestion, follow });
}

assert(greetings.size >= 8, `companion greetings are not distinct enough (${greetings.size}/12 unique)`);
report.checks = [
  "all twelve companions answer a greeting naturally",
  "all twelve answer the actual topic rather than source-upload instructions",
  "main answers contain topic-relevant substance",
  "follow-ups use conversation history instead of resetting",
  "no companion claims an unconfirmed save, open, upload or verification",
  "companion voices produce at least eight distinct greetings",
];
report.ok = true;
await writeFile(`${output}/companion-matrix.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, companions: report.cases.length, uniqueGreetings: greetings.size, checks: report.checks }, null, 2));
