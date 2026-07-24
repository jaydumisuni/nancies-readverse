interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  LIBRARY_FILES: R2Bucket;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return handleHealth(env);
    }

    if (url.pathname === "/api/gogo/help") {
      return handleGogoHelp(request, env, ctx);
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
    status: "phase-0",
    bindings: {
      d1: database,
      kv: "configured",
      r2: "configured",
      ai: "configured",
    },
    timestamp: new Date().toISOString(),
  });
}

async function handleGogoHelp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  if (!question || question.length > 1000) {
    return json({ ok: false, error: "Question must be between 1 and 1000 characters" }, 400);
  }

  const fallback = fallbackHelp(question);

  try {
    const aiResult = await env.AI.run(env.AI_MODEL as keyof AiModels, {
      messages: [
        {
          role: "system",
          content:
            "You are Gogo, Nancy's mature anime-style reading companion inside Nancy's ReadVerse. " +
            "Be sweet, warm, playful, lightly flirty, concise, and never sexual or possessive. " +
            "Help with using ReadVerse, reading formats, sources, favourites, library records, temporary reading, saved files, and spoiler-safe navigation. " +
            "Never claim an app action happened unless the application result explicitly confirms it. " +
            "This endpoint provides guidance only; do not invent search results or links.",
        },
        { role: "user", content: question },
      ],
      max_tokens: 220,
      temperature: 0.65,
    });

    const answer = extractAiText(aiResult) || fallback;
    return json({ ok: true, answer, mode: "workers-ai" });
  } catch (error) {
    ctx.waitUntil(Promise.resolve(console.warn("Workers AI fallback", error)));
    return json({ ok: true, answer: fallback, mode: "rules" });
  }
}

function fallbackHelp(question: string): string {
  const value = question.toLowerCase();

  if (value.includes("source")) {
    return "Paste the source into my chat and tell me what it carries, such as manga or novels. I’ll inspect it, show what it can do, and ask before remembering it.";
  }
  if (value.includes("save") || value.includes("keep")) {
    return "Use Save File only when you want the full book kept in ReadVerse. Add to Library keeps its record and progress without storing the whole file.";
  }
  if (value.includes("favourite") || value.includes("favorite")) {
    return "Tap the heart or ask me to favourite it. I’ll keep the title, cover, source, and your progress even when the file itself stays temporary.";
  }
  if (value.includes("manga") || value.includes("right-to-left")) {
    return "Open Reader settings and choose Right-to-left or Vertical manga. I’ll remember the choice for that series, pretty reader.";
  }
  if (value.includes("library")) {
    return "Add to Library remembers the title, edition, source, progress, and notes. The actual file stays temporary unless you separately choose Save File.";
  }

  return "I can help you add sources, inspect a book link, continue reading, manage favourites, or explain the reader. Tell me what you’re trying to do and I’ll point you there.";
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
