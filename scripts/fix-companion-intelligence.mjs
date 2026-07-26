import { readFile, writeFile } from "node:fs/promises";

const appPath = "src/App.tsx";
const workerPath = "worker/index.ts";

let app = await readFile(appPath, "utf8");
let worker = await readFile(workerPath, "utf8");

const askStart = app.indexOf("  async function askCompanion(event: FormEvent<HTMLFormElement>) {");
const askEnd = app.indexOf("\n  function chooseMood", askStart);
if (askStart < 0 || askEnd < 0) throw new Error("askCompanion block was not found");

const askReplacement = `  async function askCompanion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || sending) return;

    const userMessage: ChatMessage = {
      id: uid("user"),
      role: "user",
      text: cleanQuestion,
      time: timeNow(),
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setSending(true);

    const lower = cleanQuestion.toLowerCase();
    const directUrl = extractFirstHttpUrl(cleanQuestion);
    const previousUrl = !directUrl && isSourceFollowUp(cleanQuestion)
      ? lastSourceUrl(messages)
      : null;
    const sourceCandidate = directUrl ?? previousUrl;

    if (sourceCandidate) {
      setSearching(true);
      try {
        const response = await fetch("/api/source/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: sourceCandidate }),
        });
        const body = (await response.json()) as ResolveSourceResponse;
        if (!response.ok || !body.ok || !body.source) {
          throw new Error(body.error || "ReadVerse could not resolve that source.");
        }
        const source = body.source;
        setReaderSource({
          id: uid("source"),
          title: source.title,
          url: source.streamUrl,
          format: source.format,
          sourceUrl: source.sourceUrl,
        });
        setReaderOpen(true);
        setSourceDialogOpen(false);
        setSourceUrl("");
        setMessages((current) => [
          ...current,
          {
            id: uid("source-reply"),
            role: "companion",
            text: characterise(
              companion,
              \`I tested the link, found “\${source.title}”, and opened the verified \${source.format.toUpperCase()} temporarily. Nothing was saved permanently.\`,
            ),
            time: timeNow(),
          },
        ]);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "ReadVerse could not resolve that source.";
        setMessages((current) => [
          ...current,
          {
            id: uid("source-blocked"),
            role: "companion",
            text: characterise(
              companion,
              \`I tested the link instead of guessing. It stopped here: \${reason} I did not open or save anything.\`,
            ),
            time: timeNow(),
          },
        ]);
      } finally {
        setSearching(false);
        setSending(false);
      }
      return;
    }

    if (lower.includes("open reader") || lower.includes("continue reading")) {
      setReaderOpen(true);
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: characterise(
            companion,
            "Reader opened. Your page was exactly where you left it.",
          ),
          time: timeNow(),
        },
      ]);
      setSending(false);
      return;
    }
    if (lower.includes("setting") || lower.includes("change theme")) {
      setSettingsOpen(true);
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: characterise(
            companion,
            "Settings are open. Try not to spend twenty minutes choosing between two nearly identical shades. I will notice.",
          ),
          time: timeNow(),
        },
      ]);
      setSending(false);
      return;
    }

    try {
      const response = await fetch("/api/companion/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: cleanQuestion,
          companion: companion.name,
          vibe: \`\${companion.traits.join(", ")}. \${companion.delivery}\`,
          history: messages.slice(-12).map((message) => ({
            role: message.role === "companion" ? "assistant" : "user",
            text: message.text,
          })),
        }),
      });
      const body = (await response.json()) as { answer?: string; error?: string };
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text:
            body.answer ??
            body.error ??
            characterise(companion, "That thought escaped. Ask me once more."),
          time: timeNow(),
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: localFallback(cleanQuestion, companion, messages),
          time: timeNow(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }
`;
app = app.slice(0, askStart) + askReplacement + app.slice(askEnd);

const fallbackStart = app.indexOf("function localFallback(question: string, companion: Companion)");
const fallbackEnd = app.indexOf("\nfunction ProfileAvatar", fallbackStart);
if (fallbackStart < 0 || fallbackEnd < 0) throw new Error("localFallback block was not found");

const fallbackReplacement = `function extractFirstHttpUrl(value: string): string | null {
  const match = value.match(/https?:\\/\\/[^\\s<>\"']+/i);
  return match ? match[0].replace(/[),.;!?]+$/, "") : null;
}

function lastSourceUrl(messages: ChatMessage[]): string | null {
  for (const message of [...messages].reverse()) {
    const url = extractFirstHttpUrl(message.text);
    if (url) return url;
  }
  return null;
}

function isSourceFollowUp(value: string) {
  return /^(?:ok(?:ay)?[,.!]?\\s*)?(?:let me have it|open it|test it|try it|check it|read it|go ahead|proceed|yes|do it)[.!?]*$/i.test(value.trim());
}

function localFallback(question: string, companion: Companion, history: ChatMessage[] = []) {
  const value = question.trim().toLowerCase();
  if (/^(hi|hey|hello|yo|sup|good morning|good afternoon|good evening)[.!?]*$/.test(value)) {
    return characterise(companion, "Hey. I am here. Talk to me normally or drop a reading link and I will test it.");
  }
  if (/how are you|you good|what's up|whats up/.test(value)) {
    return characterise(companion, "I am good—and paying attention. What is on your mind?");
  }
  if (/^(thanks|thank you|nice|cool|great|perfect)[.!?]*$/.test(value)) {
    return characterise(companion, "You are welcome. Keep going.");
  }
  if (/what can you do|help me|capable/.test(value)) {
    return characterise(companion, "I can hold a normal conversation, test a public reading link, explain the exact blocker when one fails, open verified files, search your reading options and control the reader.");
  }
  if (extractFirstHttpUrl(question)) {
    return characterise(companion, "I found the link. I will test the actual source and either open the verified reading file or tell you the exact point where it failed.");
  }
  if (value.includes("source") || value.includes("link") || value.includes("url")) {
    return characterise(companion, "Paste the link directly into chat. I will inspect redirects and public file candidates, then open a verified reading file or report the exact blocker.");
  }
  if (value.includes("save") || value.includes("drive")) {
    return characterise(companion, "Read Now stays temporary. Add to Library keeps the record and progress. Save to Drive will keep the full file after Google is connected.");
  }
  if (value.includes("pdf") || value.includes("upload")) {
    return characterise(companion, "Attach the file or paste its public link. I will test it first, then open it in the reader.");
  }
  if (value.includes("theme") || value.includes("colour") || value.includes("color")) {
    return characterise(companion, "Theme colour and companion ring colour are separate. Settings lets you change either without forcing the other to follow.");
  }
  const previous = [...history].reverse().find((message) => message.role === "user" && message.text.trim());
  if (previous) {
    return characterise(companion, "I am following the conversation. Say what you want me to do next, and I will act on the last clear request instead of resetting to a generic help line.");
  }
  return characterise(companion, "I am listening. Talk to me normally, ask about a book, or paste a source for me to test.");
}
`;
app = app.slice(0, fallbackStart) + fallbackReplacement + app.slice(fallbackEnd);

const handlerStart = worker.indexOf("async function handleCompanion(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {");
const handlerEnd = worker.indexOf("\nasync function resolveSourceRequest", handlerStart);
if (handlerStart < 0 || handlerEnd < 0) throw new Error("handleCompanion block was not found");

const handlerReplacement = `async function handleCompanion(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: CompanionBody;
  try { body = await request.json() as CompanionBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";
  const customVibe = typeof body.vibe === "string" ? body.vibe.slice(0, 180) : "";
  if (!question || question.length > 1200) return json({ ok: false, error: "Question must be between 1 and 1200 characters" }, 400);

  const history = normalizeHistory(body.history);
  const personality = personalityGuides[companion] ?? personalityGuides.Gojo;
  const deterministic = quickConversation(question, companion, history);
  if (deterministic) return json({ ok: true, answer: deterministic, mode: "conversation-router", companion });
  const fallback = conversationalFallback(question, companion, history);

  try {
    const result = await env.AI.run(env.AI_MODEL as keyof AiModels, {
      messages: [
        {
          role: "system",
          content:
            \`You are the \${companion}-inspired reading companion selected in Nancy's ReadVerse. \` +
            \`Use only broad personality traits: \${personality}. \${customVibe}. \` +
            "Maintain the same voice across the whole conversation. Do not claim to be the canonical copyrighted character, quote catchphrases, or reproduce copyrighted dialogue. " +
            "Hold a normal human conversation first. Reply naturally to greetings, jokes, acknowledgements and follow-up messages. Use the recent conversation to resolve words like it, that, yes and go ahead. Do not reset to a generic product description. " +
            "When the user supplies a source URL, the client tests it; do not pretend you tested it yourself. Never claim that a file opened, a source resolved, a setting saved, or a Google action completed unless the client supplied a confirmed result. " +
            "ReadVerse keeps fetched files temporary. Permanent files, settings, notes and progress belong in the user's Google account only after explicit consent. " +
            "Do not provide instructions to defeat DRM, paywalls, authentication, CAPTCHAs or access controls. Only mention this restriction when it is actually relevant; never inject it into greetings or ordinary conversation. " +
            "Be concise, useful, spoiler-aware, context-aware and honest. Avoid repeating the same sentence structure or signature line in consecutive replies.",
        },
        ...history,
        { role: "user", content: question },
      ],
      max_tokens: 360,
      temperature: 0.78,
    });
    return json({ ok: true, answer: extractText(result) || fallback, mode: "workers-ai", companion });
  } catch (error) {
    ctx.waitUntil(Promise.resolve(console.warn("Workers AI fallback", error)));
    return json({ ok: true, answer: fallback, mode: "rules", companion });
  }
}
`;
worker = worker.slice(0, handlerStart) + handlerReplacement + worker.slice(handlerEnd);

const readingStart = worker.indexOf("function readingAnswer(question: string): string {");
const readingEnd = worker.indexOf("\nfunction detectFormat", readingStart);
if (readingStart < 0 || readingEnd < 0) throw new Error("readingAnswer block was not found");

const conversationReplacement = `function companionFlourish(companion: string, line: string): string {
  const endings: Record<string, string> = {
    Gojo: " I was paying attention. Try not to look too surprised.",
    Itachi: " Quietly. Properly.",
    Naruto: " We have this.",
    Kakashi: " Efficient enough to be suspicious.",
    Megumi: " No unnecessary noise.",
    Sasuke: " That is the direct answer.",
    Maki: " Simple.",
    Nobara: " Standards maintained.",
    Hinata: " We can take it one step at a time.",
    Sakura: " Clear and checked.",
    Temari: " Efficient, as it should be.",
    "Mei Mei": " Worth the time.",
  };
  return line + (endings[companion] ?? "");
}

function quickConversation(
  question: string,
  companion: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string | null {
  const value = question.trim().toLowerCase();
  if (/^(hi|hey|hello|yo|sup|good morning|good afternoon|good evening)[.!?]*$/.test(value)) {
    return companionFlourish(companion, "Hey. I am here. How are you, and what are we doing today?");
  }
  if (/how are you|you good|what(?:'s| is) up/.test(value)) {
    return companionFlourish(companion, "I am good. More importantly, I am following the conversation. What is on your mind?");
  }
  if (/^(thanks|thank you|nice|cool|great|perfect)[.!?]*$/.test(value)) {
    return companionFlourish(companion, "You are welcome. Keep going.");
  }
  if (/what can you do|what are you capable of/.test(value)) {
    return companionFlourish(companion, "I can chat normally, help choose what to read, inspect a public source through ReadVerse, explain exact failures, and control the reading workflow.");
  }
  if (/^(yes|yeah|yep|okay|ok|go ahead|continue|do it)[.!?]*$/.test(value) && history.length) {
    return companionFlourish(companion, "I have the context. The client will carry out the last clear action; if it needs a link or file, I will ask for only that missing piece.");
  }
  return null;
}

function conversationalFallback(
  question: string,
  companion: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const value = question.toLowerCase();
  if (/upload|file|pdf|epub|cbz/.test(value)) {
    return companionFlourish(companion, "Attach the file or paste its public link. ReadVerse will test it before opening it temporarily.");
  }
  if (/link|source|url|ad/.test(value)) {
    return companionFlourish(companion, "Paste the link directly. ReadVerse will inspect public redirects and file candidates, then open a verified file or report the exact blocker.");
  }
  if (/save|drive|setting|note|progress/.test(value)) {
    return companionFlourish(companion, "Temporary reading works now. Permanent saving waits for an explicit Google action, so the app will not pretend it saved anything.");
  }
  if (history.length) {
    return companionFlourish(companion, "I am following. Tell me the next action in plain words and I will keep the current context instead of starting over.");
  }
  return companionFlourish(companion, "Talk to me normally. Ask about a book, tell me what mood you want, or paste a source for ReadVerse to test.");
}
`;
worker = worker.slice(0, readingStart) + conversationReplacement + worker.slice(readingEnd);

worker = worker.replace(
  'throw new Error("No accessible PDF, EPUB, CBZ or TXT file was found. Protected, login-only, DRM, CAPTCHA and paywalled sources are not bypassed.");',
  'throw new Error("No public PDF, EPUB, CBZ or TXT file was exposed by that page. It may require a login, a browser challenge, or a download action the server cannot verify.");',
);

await writeFile(appPath, app, "utf8");
await writeFile(workerPath, worker, "utf8");
console.log("Installed context-aware conversation and automatic source testing.");
