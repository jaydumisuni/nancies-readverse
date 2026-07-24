interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  LIBRARY_FILES: R2Bucket;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
}

type CompanionBody = {
  question?: unknown;
  companion?: unknown;
  vibe?: unknown;
};

const personalityGuides: Record<string, string> = {
  Gojo: "playful, quick-witted, shamelessly confident, gently teasing and protective",
  Itachi: "calm, observant, emotionally restrained, precise and quietly protective",
  Naruto: "warm, energetic, loyal, encouraging and cheerfully chaotic",
  Kakashi: "relaxed, clever, mature, concise and dryly funny",
  Megumi: "reserved, thoughtful, direct, practical and quietly caring",
  Sasuke: "intense, guarded, decisive, restrained and attentive",
  Maki: "strong, blunt, practical, protective and dryly funny",
  Nobara: "bold, stylish, expressive, sassy, fearless and supportive",
  Hinata: "gentle, warm, attentive, softly encouraging and quietly brave",
  Sakura: "caring, practical, confident, lively and no-nonsense",
  Temari: "strategic, composed, sharp, efficient and sarcastically funny",
  "Mei Mei": "elegant, calm, observant, calculating and subtly mischievous",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return handleHealth(env);
    if (url.pathname === "/api/companion/help" || url.pathname === "/api/gogo/help") {
      return handleCompanion(request, env, ctx);
    }
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleHealth(env: Env): Promise<Response> {
  let database = "unknown";
  try {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    database = result?.ok === 1 ? "ready" : "unavailable";
  } catch {
    database = "unavailable";
  }
  return json({
    ok: true,
    app: env.APP_NAME,
    status: "phase-2-experience",
    access: "direct",
    bindings: { d1: database, kv: "configured", r2: "configured", ai: "configured" },
    timestamp: new Date().toISOString(),
  });
}

async function handleCompanion(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: CompanionBody;
  try { body = await request.json() as CompanionBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";
  const customVibe = typeof body.vibe === "string" ? body.vibe.slice(0, 180) : "";
  if (!question || question.length > 1000) return json({ ok: false, error: "Question must be between 1 and 1000 characters" }, 400);

  const personality = personalityGuides[companion] ?? personalityGuides.Gojo;
  const fallback = fallbackHelp(question, companion);
  try {
    const result = await env.AI.run(env.AI_MODEL as keyof AiModels, {
      messages: [
        {
          role: "system",
          content:
            `You are the ${companion}-inspired reading companion selected inside Nancy's ReadVerse. ` +
            `Use broad personality traits only: ${personality}. ${customVibe}. ` +
            "Do not quote, impersonate, or claim to be the canonical copyrighted character. " +
            "Keep ReadVerse's dependable core: warm, helpful, concise, humorous, spoiler-aware, lightly playful when appropriate, never sexual, possessive, cruel or manipulative. " +
            "Help with PDFs, EPUBs, CBZ files, reader controls, themes, individual avatar ring colours, notes, highlights, temporary reading, offline storage, sources and library choices. " +
            "Never claim an app action succeeded without an explicit result. Google sign-in and Drive sync are not connected yet. Keep replies below 120 words unless detail is requested.",
        },
        { role: "user", content: question },
      ],
      max_tokens: 240,
      temperature: 0.68,
    });
    return json({ ok: true, answer: extractText(result) || fallback, mode: "workers-ai", companion });
  } catch (error) {
    ctx.waitUntil(Promise.resolve(console.warn("Workers AI fallback", error)));
    return json({ ok: true, answer: fallback, mode: "rules", companion });
  }
}

function fallbackHelp(question: string, companion: string): string {
  const value = question.toLowerCase();
  let answer = "I can help with reading files, source search, themes, companion settings, notes, highlights, favourites and reader controls.";
  if (value.includes("pdf") || value.includes("epub") || value.includes("cbz") || value.includes("upload")) {
    answer = "Use the plus button in chat to attach a PDF, EPUB or CBZ. ReadVerse will keep Read Now, Add to Library, Keep Offline and Save to Drive as separate choices.";
  } else if (value.includes("theme") || value.includes("color") || value.includes("colour") || value.includes("ring")) {
    answer = "The site theme and avatar ring are independent. Change the world colour in Appearance, then give every companion its own ring colour.";
  } else if (value.includes("note") || value.includes("highlight") || value.includes("passage")) {
    answer = "Open the reader, tap the highlighted passage, then use the notepad. Notes and highlights autosave locally now; Google Drive sync joins later.";
  } else if (value.includes("save") || value.includes("drive") || value.includes("library")) {
    answer = "Read Now stays temporary. Add to Library keeps metadata and progress. Keep Offline stays on the device. Save to Drive will keep the full file after Google is connected.";
  }
  const endings: Record<string, string> = {
    Gojo: "Naturally, I made the complicated part look easy.", Itachi: "Quietly and correctly.", Naruto: "One step closer to the next chapter.", Kakashi: "Try to look surprised.", Megumi: "It is the sensible option.", Sasuke: "Do not overcomplicate it.", Maki: "Simple.", Nobara: "Good taste remains protected.", Hinata: "One page at a time.", Sakura: "And yes, it will be checked properly.", Temari: "Efficient. As it should be.", "Mei Mei": "A worthwhile use of our time.",
  };
  return `${answer} ${endings[companion] ?? "Handled."}`;
}

function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.text === "string") return record.text.trim();
  return "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
