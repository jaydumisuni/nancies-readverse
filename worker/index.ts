interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  LIBRARY_FILES: R2Bucket;
  AI: Ai;
  APP_NAME: string;
  AI_MODEL: string;
  GOOGLE_AUTH_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_ALLOWED_EMAILS?: string;
}

type OAuthState = {
  returnTo: string;
  createdAt: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type AuthSession = {
  userId: string;
  email: string;
  name: string;
  picture: string;
  createdAt: string;
};

const OAUTH_STATE_PREFIX = "google_oauth_state:";
const AUTH_SESSION_PREFIX = "readverse_auth_session:";
const AUTH_COOKIE = "readverse_session";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return handleHealth(env);
    }

    if (url.pathname === "/api/auth/google/status") {
      return handleGoogleStatus(request, env);
    }

    if (url.pathname === "/api/auth/google/start") {
      return handleGoogleStart(request, env);
    }

    if (url.pathname === "/api/auth/google/callback") {
      return handleGoogleCallback(request, env);
    }

    if (url.pathname === "/api/auth/session") {
      return handleAuthSession(request, env);
    }

    if (url.pathname === "/api/auth/logout") {
      return handleLogout(request, env);
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

  const auth = googleAuthStatus(env);

  return json({
    ok: true,
    app: env.APP_NAME,
    status: "phase-0-open",
    access: "direct",
    auth: {
      provider: "google",
      enabled: auth.enabled,
      configured: auth.configured,
    },
    bindings: {
      d1: database,
      kv: "configured",
      r2: "configured",
      ai: "configured",
    },
    timestamp: new Date().toISOString(),
  });
}

function handleGoogleStatus(request: Request, env: Env): Response {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  return json({ ok: true, ...googleAuthStatus(env) });
}

async function handleGoogleStart(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const status = googleAuthStatus(env);
  if (!status.enabled) {
    return json(
      {
        ok: false,
        error: "Google signup is prepared but not enabled yet.",
        code: "GOOGLE_AUTH_DISABLED",
      },
      503,
    );
  }

  if (!status.configured || !env.GOOGLE_CLIENT_ID) {
    return json(
      {
        ok: false,
        error: "Google signup is enabled but its Cloudflare secrets are incomplete.",
        code: "GOOGLE_AUTH_NOT_CONFIGURED",
      },
      503,
    );
  }

  const requestUrl = new URL(request.url);
  const state = randomToken(32);
  const stateRecord: OAuthState = {
    returnTo: safeReturnTo(requestUrl.searchParams.get("returnTo")),
    createdAt: new Date().toISOString(),
  };

  await env.SESSION_KV.put(`${OAUTH_STATE_PREFIX}${state}`, JSON.stringify(stateRecord), {
    expirationTtl: OAUTH_STATE_TTL_SECONDS,
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(request, env),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    include_granted_scopes: "true",
  }).toString();

  return redirect(authUrl.toString());
}

async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const requestUrl = new URL(request.url);
  const status = googleAuthStatus(env);

  if (!status.enabled) {
    return authErrorRedirect(requestUrl, "google_auth_disabled");
  }

  if (!status.configured || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return authErrorRedirect(requestUrl, "google_auth_not_configured");
  }

  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    return authErrorRedirect(requestUrl, providerError);
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code || !state) {
    return authErrorRedirect(requestUrl, "missing_code_or_state");
  }

  const stateKey = `${OAUTH_STATE_PREFIX}${state}`;
  const storedState = await env.SESSION_KV.get(stateKey);
  await env.SESSION_KV.delete(stateKey);

  if (!storedState) {
    return authErrorRedirect(requestUrl, "invalid_or_expired_state");
  }

  let stateRecord: OAuthState;
  try {
    stateRecord = JSON.parse(storedState) as OAuthState;
  } catch {
    return authErrorRedirect(requestUrl, "invalid_state_record");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(request, env),
      grant_type: "authorization_code",
    }).toString(),
  });

  const tokenBody = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenBody.access_token) {
    console.warn("Google token exchange failed", tokenBody.error, tokenBody.error_description);
    return authErrorRedirect(requestUrl, "token_exchange_failed");
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenBody.access_token}` },
  });
  const googleUser = (await userResponse.json()) as GoogleUserInfo;

  if (
    !userResponse.ok ||
    !googleUser.sub ||
    !googleUser.email ||
    googleUser.email_verified !== true
  ) {
    return authErrorRedirect(requestUrl, "google_profile_not_verified");
  }

  const email = googleUser.email.trim().toLowerCase();
  if (!allowedGoogleEmails(env).has(email)) {
    return authErrorRedirect(requestUrl, "account_not_allowed");
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?")
    .bind(googleUser.sub)
    .first<{ id: string }>();
  const userId = existing?.id ?? crypto.randomUUID();
  const name = googleUser.name?.trim() || email.split("@")[0] || "Reader";
  const picture = googleUser.picture?.trim() || "";

  await env.DB.prepare(
    `INSERT INTO users (
      id, google_sub, email, display_name, avatar_url, created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(google_sub) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      updated_at = CURRENT_TIMESTAMP,
      last_login_at = CURRENT_TIMESTAMP`,
  )
    .bind(userId, googleUser.sub, email, name, picture)
    .run();

  const sessionToken = randomToken(32);
  const session: AuthSession = {
    userId,
    email,
    name,
    picture,
    createdAt: new Date().toISOString(),
  };

  await env.SESSION_KV.put(`${AUTH_SESSION_PREFIX}${sessionToken}`, JSON.stringify(session), {
    expirationTtl: AUTH_SESSION_TTL_SECONDS,
  });

  const destination = new URL(safeReturnTo(stateRecord.returnTo), requestUrl.origin).toString();
  return redirect(destination, {
    "set-cookie": sessionCookie(sessionToken, requestUrl.protocol === "https:"),
  });
}

async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const requestUrl = new URL(request.url);
  const token = readCookie(request, AUTH_COOKIE);
  if (!token) {
    return json({
      ok: true,
      authenticated: false,
      authEnabled: googleAuthStatus(env).enabled,
    });
  }

  const storedSession = await env.SESSION_KV.get(`${AUTH_SESSION_PREFIX}${token}`);
  if (!storedSession) {
    return json(
      {
        ok: true,
        authenticated: false,
        authEnabled: googleAuthStatus(env).enabled,
      },
      200,
      { "set-cookie": clearSessionCookie(requestUrl.protocol === "https:") },
    );
  }

  try {
    const session = JSON.parse(storedSession) as AuthSession;
    return json({
      ok: true,
      authenticated: true,
      authEnabled: googleAuthStatus(env).enabled,
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        picture: session.picture,
      },
    });
  } catch {
    await env.SESSION_KV.delete(`${AUTH_SESSION_PREFIX}${token}`);
    return json(
      { ok: true, authenticated: false, authEnabled: googleAuthStatus(env).enabled },
      200,
      { "set-cookie": clearSessionCookie(requestUrl.protocol === "https:") },
    );
  }
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const requestUrl = new URL(request.url);
  const token = readCookie(request, AUTH_COOKIE);
  if (token) {
    await env.SESSION_KV.delete(`${AUTH_SESSION_PREFIX}${token}`);
  }

  return json(
    { ok: true, authenticated: false },
    200,
    { "set-cookie": clearSessionCookie(requestUrl.protocol === "https:") },
  );
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

function googleAuthStatus(env: Env) {
  const clientIdConfigured = Boolean(env.GOOGLE_CLIENT_ID?.trim());
  const clientSecretConfigured = Boolean(env.GOOGLE_CLIENT_SECRET?.trim());
  const allowlistConfigured = allowedGoogleEmails(env).size > 0;

  return {
    enabled: env.GOOGLE_AUTH_ENABLED?.trim().toLowerCase() === "true",
    configured: clientIdConfigured && clientSecretConfigured && allowlistConfigured,
    clientIdConfigured,
    clientSecretConfigured,
    allowlistConfigured,
    redirectUriConfigured: Boolean(env.GOOGLE_REDIRECT_URI?.trim()),
    scopes: ["openid", "email", "profile"],
  };
}

function googleRedirectUri(request: Request, env: Env): string {
  const configured = env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;
  return new URL("/api/auth/google/callback", request.url).toString();
}

function allowedGoogleEmails(env: Env): Set<string> {
  return new Set(
    (env.GOOGLE_ALLOWED_EMAILS ?? "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function safeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 500 || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function authErrorRedirect(requestUrl: URL, code: string): Response {
  const destination = new URL("/", requestUrl.origin);
  destination.searchParams.set("auth_error", code.slice(0, 100));
  return redirect(destination.toString());
}

function redirect(location: string, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({
    location,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });

  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    headers.set(key, value);
  }

  return new Response(null, { status: 302, headers });
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

function sessionCookie(token: string, secure: boolean): string {
  return [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${AUTH_SESSION_TTL_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function clearSessionCookie(secure: boolean): string {
  return [
    `${AUTH_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
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

function json(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });

  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    headers.set(key, value);
  }

  return new Response(JSON.stringify(body), { status, headers });
}
