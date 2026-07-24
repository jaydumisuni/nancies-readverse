interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  LIBRARY_FILES: R2Bucket;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
  SESSION_TTL_SECONDS: string;
  INVITE_CODE?: string;
}

type SessionRecord = {
  createdAt: string;
  userAgent: string;
};

const SESSION_COOKIE = "nrv_session";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return handleHealth(env);
    }

    if (url.pathname === "/api/session") {
      return handleSession(request, env);
    }

    if (url.pathname === "/api/gogo/help") {
      return handleGogoHelp(request, env, ctx);
    }

    if (url.pathname.startsWith("/dev-")) {
      return claimInvite(request, env, url);
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
    inviteConfigured: Boolean(env.INVITE_CODE),
    timestamp: new Date().toISOString(),
  });
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const session = await readSession(request, env);

  if (!session) {
    return json({ authenticated: false }, 401);
  }

  return json({
    authenticated: true,
    app: env.APP_NAME,
    createdAt: session.createdAt,
  });
}

async function claimInvite(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const suppliedCode = url.pathname.slice(1);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const valid = isLocal
    ? suppliedCode.startsWith("dev-")
    : Boolean(env.INVITE_CODE) && (await secureEqual(suppliedCode, env.INVITE_CODE ?? ""));

  if (!valid) {
    return new Response("This ReadVerse invitation is invalid or has expired.", {
      status: env.INVITE_CODE || isLocal ? 404 : 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const token = createSessionToken();
  const sessionKey = `session:${await sha256(token)}`;
  const ttl = normaliseTtl(env.SESSION_TTL_SECONDS);
  const record: SessionRecord = {
    createdAt: new Date().toISOString(),
    userAgent: request.headers.get("user-agent") ?? "unknown",
  };

  await env.SESSION_KV.put(sessionKey, JSON.stringify(record), {
    expirationTtl: ttl,
  });

  const secure = url.protocol === "https:" ? "Secure; " : "";
  const headers = new Headers({ location: "/" });
  headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; ${secure}SameSite=Strict; Max-Age=${ttl}`,
  );

  return new Response(null, { status: 302, headers });
}

async function handleGogoHelp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const session = await readSession(request, env);
  if (!session) {
    return json({ ok: false, error: "Private session required" }, 401);
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

async function readSession(request: Request, env: Env): Promise<SessionRecord | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;

  const value = await env.SESSION_KV.get(`session:${await sha256(token)}`);
  if (!value) return null;

  try {
    return JSON.parse(value) as SessionRecord;
  } catch {
    return null;
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

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${crypto.randomUUID()}.${random}`;
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Bytes(left), sha256Bytes(right)]);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

async function sha256(value: string): Promise<string> {
  const bytes = await sha256Bytes(value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function normaliseTtl(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 3600 ? parsed : 2_592_000;
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
