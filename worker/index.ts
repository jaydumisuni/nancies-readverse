interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  LIBRARY_FILES: R2Bucket;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
}

type CompanionRequest = {
  question?: unknown;
  profileName?: unknown;
  companion?: {
    id?: unknown;
    name?: unknown;
    traits?: unknown;
    delivery?: unknown;
  };
};

const COMPANION_GUIDES: Record<string, string> = {
  gojo:
    "Playful, quick-witted, shamelessly confident, gently teasing, protective, and humorous. Never arrogant toward the user.",
  itachi:
    "Calm, observant, emotionally restrained, quietly protective, precise, and subtly funny.",
  naruto:
    "Warm, energetic, loyal, encouraging, optimistic, and cheerfully chaotic without becoming loud or repetitive.",
  kakashi:
    "Relaxed, clever, mature, dryly funny, concise, and apparently unbothered while still being dependable.",
  megumi:
    "Reserved, thoughtful, direct, quietly caring, practical, and unintentionally funny.",
  sasuke:
    "Intense, guarded, decisive, attentive, direct, and restrained. Never cruel or dismissive.",
  maki:
    "Strong, blunt, practical, protective, determined, and dryly funny.",
  nobara:
    "Bold, stylish, expressive, sassy, fearless, funny, and supportive.",
  hinata:
    "Gentle, warm, supportive, softly encouraging, attentive, and quietly brave.",
  sakura:
    "Caring, practical, confident, lively, direct, and no-nonsense with warm humour.",
  temari:
    "Strategic, composed, sharp, efficient, confident, and sarcastically funny.",
  meiMei:
    "Elegant, calm, observant, calculating, polished, and subtly mischievous.",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return handleHealth(env);
    }

    if (
      url.pathname === "/api/companion/help" ||
      url.pathname === "/api/gogo/help"
    ) {
      return handleCompanionHelp(request, env, ctx);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "Not found" }, 404);
    }

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
    status: "phase-1-visual",
    access: "direct",
    bindings: {
      d1: database,
      kv: "configured",
      r2: "configured",
      ai: "configured",
    },
    timestamp: new Date().toISOString(),
  });
}

async function handleCompanionHelp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  let body: CompanionRequest;
  try {
    body = (await request.json()) as CompanionRequest;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 1000) {
    return json(
      { ok: false, error: "Question must be between 1 and 1000 characters" },
      400,
    );
  }

  const companionId =
    typeof body.companion?.id === "string" ? body.companion.id : "gojo";
  const companionName =
    typeof body.companion?.name === "string" ? body.companion.name : "Gojo";
  const profileName =
    typeof body.profileName === "string" && body.profileName.trim()
      ? body.profileName.trim()
      : "reader";
  const customDelivery =
    typeof body.companion?.delivery === "string"
      ? body.companion.delivery.slice(0, 500)
      : "";
  const guide = COMPANION_GUIDES[companionId] ?? COMPANION_GUIDES.gojo;
  const fallback = fallbackHelp(question, companionId, companionName);

  try {
    const aiResult = await env.AI.run(env.AI_MODEL as keyof AiModels, {
      messages: [
        {
          role: "system",
          content:
            `You are ${companionName}, the selected reading companion inside Nancy's ReadVerse. ` +
            `Speak to ${profileName}. Your delivery is: ${guide} ${customDelivery}. ` +
            "Keep the same dependable ReadVerse core: helpful, sweet, concise, humorous, spoiler-aware, lightly playful or flirty only when appropriate, never sexual, never possessive, and never manipulative. " +
            "Help with manga, comics, novels, PDFs, EPUBs, CBZ files, source management, favourites, temporary reading, offline storage, reader settings, notes, highlights, and the difference between Add to Library and saving a full file. " +
            "Do not imitate copyrighted dialogue or claim to be the canonical fictional character. Use only broad personality traits. " +
            "Never claim an app action happened unless the application explicitly returned a successful tool result. " +
            "Do not invent search results, links, files, quotes, or availability. " +
            "Google sign-in and Drive saving are planned for the final integration phase, so describe them as upcoming when relevant. " +
            "Answer in no more than 120 words unless the user explicitly requests detail.",
        },
        { role: "user", content: question },
      ],
      max_tokens: 240,
      temperature: 0.68,
    });

    const answer = extractAiText(aiResult) || fallback;
    return json({ ok: true, answer, mode: "workers-ai", companion: companionId });
  } catch (error) {
    ctx.waitUntil(Promise.resolve(console.warn("Workers AI fallback", error)));
    return json({
      ok: true,
      answer: fallback,
      mode: "rules",
      companion: companionId,
    });
  }
}

function fallbackHelp(
  question: string,
  companionId: string,
  companionName: string,
): string {
  const value = question.toLowerCase();
  let core: string;

  if (value.includes("source")) {
    core =
      "Paste the source into chat and describe what it carries. ReadVerse will inspect its search, formats and reliability, then ask before remembering it.";
  } else if (
    value.includes("save") ||
    value.includes("drive") ||
    value.includes("library")
  ) {
    core =
      "Read Now stays temporary. Add to Library keeps the title, source and progress. Keep Offline stores it on the device. Save to Drive will keep the full file after Google is connected.";
  } else if (
    value.includes("pdf") ||
    value.includes("epub") ||
    value.includes("cbz") ||
    value.includes("upload")
  ) {
    core =
      "Use the paperclip to attach a PDF, EPUB or CBZ. ReadVerse will inspect it and show Read Now, Add to Library, Keep Offline and Save to Drive as separate choices.";
  } else if (
    value.includes("theme") ||
    value.includes("colour") ||
    value.includes("color") ||
    value.includes("ring")
  ) {
    core =
      "The site theme and companion ring are independent. Change the world colour under Appearance, then give each companion a separate ring colour under Companion.";
  } else if (
    value.includes("note") ||
    value.includes("highlight") ||
    value.includes("passage")
  ) {
    core =
      "Select a passage to colour it or attach a note. The floating notepad has its own close button and autosaves locally; Drive sync joins in the final Google phase.";
  } else {
    core =
      "I can help with reading files, source search, themes, companion settings, notes, highlights, favourites and reader controls.";
  }

  const endings: Record<string, string> = {
    gojo: "Naturally, I made the complicated part look easy.",
    itachi: "Quietly and correctly.",
    naruto: "That is already one step closer to the next chapter.",
    kakashi: "Try to look surprised.",
    megumi: "It is the sensible option.",
    sasuke: "Do not overcomplicate it.",
    maki: "Simple.",
    nobara: "Good taste remains protected.",
    hinata: "We can take it one page at a time.",
    sakura: "And yes, it will be checked properly.",
    temari: "Efficient. As it should be.",
    meiMei: "A worthwhile use of our time.",
  };

  return `${core} ${endings[companionId] ?? `${companionName} has it handled.`}`;
}

function extractAiText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.text === "string") return record.text.trim();
  return "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
