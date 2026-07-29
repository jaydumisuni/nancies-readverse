type PlatformEnv = {
  SESSION_KV?: KVNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  TOKEN_ENCRYPTION_KEY?: string;
};

type SessionRecord = {
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  folderId?: string;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
};

const SESSION_COOKIE = "readverse_session";
const SESSION_TTL = 60 * 60 * 24 * 45;
const FOLDER_NAME = "NoTVerse";
const STATE_FILE = "notverse-state.json";
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

export async function handlePlatformRoute(request: Request, env: PlatformEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/google") && !url.pathname.startsWith("/api/sync/") && !url.pathname.startsWith("/api/drive/")) return null;

  if (url.pathname === "/api/auth/google/status") return accountStatus(request, env);
  if (url.pathname === "/api/auth/google/start") return beginGoogle(request, env);
  if (url.pathname === "/api/auth/google/callback") return finishGoogle(request, env);
  if (url.pathname === "/api/auth/google/logout") return logoutGoogle(request, env);
  if (url.pathname === "/api/sync/state") return syncState(request, env);
  if (url.pathname === "/api/drive/save-source") return saveSourceToDrive(request, env);
  if (url.pathname === "/api/drive/upload") return uploadToDrive(request, env);
  return platformJson({ ok: false, error: "Not found" }, 404);
}

function isConfigured(env: PlatformEnv): boolean {
  return Boolean(env.SESSION_KV && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

async function accountStatus(request: Request, env: PlatformEnv): Promise<Response> {
  if (!isConfigured(env)) return platformJson({ configured: false, connected: false });
  const session = await readSession(request, env);
  return platformJson(session
    ? { configured: true, connected: true, email: session.record.email, name: session.record.name, picture: session.record.picture }
    : { configured: true, connected: false });
}

async function beginGoogle(request: Request, env: PlatformEnv): Promise<Response> {
  if (!isConfigured(env)) return platformJson({ ok: false, error: "Google OAuth secrets are not configured" }, 503);
  const state = randomToken(24);
  const origin = new URL(request.url).origin;
  const redirectUri = env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;
  await env.SESSION_KV!.put(`oauth:${state}`, JSON.stringify({ redirectUri, createdAt: Date.now() }), { expirationTtl: 600 });
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  target.searchParams.set("redirect_uri", redirectUri);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", SCOPES);
  target.searchParams.set("access_type", "offline");
  target.searchParams.set("prompt", "consent");
  target.searchParams.set("include_granted_scopes", "true");
  target.searchParams.set("state", state);
  return Response.redirect(target.toString(), 302);
}

async function finishGoogle(request: Request, env: PlatformEnv): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const stored = state && env.SESSION_KV ? await env.SESSION_KV.get(`oauth:${state}`, "json") as { redirectUri?: string } | null : null;
  if (!isConfigured(env) || !stored?.redirectUri || !code) return Response.redirect(`${origin}/?google=error`, 302);
  await env.SESSION_KV!.delete(`oauth:${state}`);

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: stored.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const token = await tokenResponse.json() as TokenResponse & { error?: string };
    if (!tokenResponse.ok || !token.access_token || !token.refresh_token) throw new Error(token.error || "Google did not return a refresh token");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json() as { email?: string; name?: string; picture?: string };
    if (!profileResponse.ok || !profile.email) throw new Error("Google profile verification failed");

    const sessionId = randomToken(32);
    const record: SessionRecord = {
      email: profile.email,
      name: profile.name || profile.email.split("@")[0],
      picture: profile.picture,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + Math.max(60, token.expires_in - 60) * 1000,
    };
    await writeSession(sessionId, record, env);
    return new Response(null, {
      status: 302,
      headers: {
        location: `${origin}/?google=connected`,
        "set-cookie": `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.warn("Google callback failed", error);
    return Response.redirect(`${origin}/?google=error`, 302);
  }
}

async function logoutGoogle(request: Request, env: PlatformEnv): Promise<Response> {
  if (request.method !== "POST") return platformJson({ ok: false, error: "Method not allowed" }, 405);
  const id = cookieValue(request, SESSION_COOKIE);
  if (id && env.SESSION_KV) await env.SESSION_KV.delete(`session:${id}`);
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

async function syncState(request: Request, env: PlatformEnv): Promise<Response> {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const token = await validAccessToken(session.id, session.record, env);
  const folderId = await ensureFolder(token, session.id, session.record, env);
  const existing = await findDriveFile(token, STATE_FILE, folderId);

  if (request.method === "GET") {
    if (!existing) return platformJson({ ok: true });
    const response = await googleRequest(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`, token);
    if (!response.ok) return platformJson({ ok: false, error: `Drive returned HTTP ${response.status}` }, 502);
    const snapshot = await response.json();
    return platformJson({ ok: true, snapshot, updatedAt: existing.modifiedTime });
  }
  if (request.method !== "PUT") return platformJson({ ok: false, error: "Method not allowed" }, 405);

  const raw = await request.text();
  if (raw.length > 2_000_000) return platformJson({ ok: false, error: "The sync snapshot is too large" }, 413);
  let body: { snapshot?: unknown };
  try { body = JSON.parse(raw); }
  catch { return platformJson({ ok: false, error: "Invalid sync snapshot" }, 400); }
  if (!body.snapshot || typeof body.snapshot !== "object") return platformJson({ ok: false, error: "Missing sync snapshot" }, 400);
  const payload = JSON.stringify(body.snapshot);
  if (existing) {
    const response = await googleRequest(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id,name,modifiedTime`, token, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    const file = await response.json() as { modifiedTime?: string; error?: { message?: string } };
    if (!response.ok) return platformJson({ ok: false, error: file.error?.message || "Drive sync failed" }, 502);
    return platformJson({ ok: true, updatedAt: file.modifiedTime || new Date().toISOString() });
  }
  const created = await multipartDriveUpload(token, {
    name: STATE_FILE,
    mimeType: "application/json",
    parents: [folderId],
    appProperties: { readverse: "state" },
  }, new Blob([payload], { type: "application/json" }));
  return platformJson({ ok: true, updatedAt: created.modifiedTime || new Date().toISOString() });
}

async function saveSourceToDrive(request: Request, env: PlatformEnv): Promise<Response> {
  if (request.method !== "POST") return platformJson({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  let body: { sourceUrl?: string; title?: string; format?: string };
  try { body = await request.json() as typeof body; }
  catch { return platformJson({ ok: false, error: "Invalid source request" }, 400); }
  if (!body.sourceUrl || !body.title) return platformJson({ ok: false, error: "Missing source details" }, 400);
  const source = new URL(body.sourceUrl, new URL(request.url).origin);
  if (source.origin !== new URL(request.url).origin && !isPublicHttpUrl(source)) return platformJson({ ok: false, error: "Private source URLs are not allowed" }, 400);
  const response = await fetch(source.toString(), { headers: { accept: "application/pdf,application/epub+zip,application/zip,text/plain,*/*" } });
  if (!response.ok || !response.body) return platformJson({ ok: false, error: `The reading source returned HTTP ${response.status}` }, 422);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 80 * 1024 * 1024) return platformJson({ ok: false, error: "The source file is larger than 80 MB" }, 413);
  const blob = await response.blob();
  return saveBlobForSession(session, env, blob, body.title, body.format || extensionOf(body.title));
}

async function uploadToDrive(request: Request, env: PlatformEnv): Promise<Response> {
  if (request.method !== "POST") return platformJson({ ok: false, error: "Method not allowed" }, 405);
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "ReadVerse file").slice(0, 180);
  const format = (url.searchParams.get("format") || extensionOf(name)).slice(0, 12);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 80 * 1024 * 1024) return platformJson({ ok: false, error: "The upload is larger than 80 MB" }, 413);
  const blob = await request.blob();
  if (!blob.size) return platformJson({ ok: false, error: "The uploaded file is empty" }, 400);
  return saveBlobForSession(session, env, blob, name, format);
}

async function saveBlobForSession(session: { id: string; record: SessionRecord }, env: PlatformEnv, blob: Blob, title: string, format: string): Promise<Response> {
  const token = await validAccessToken(session.id, session.record, env);
  const folderId = await ensureFolder(token, session.id, session.record, env);
  const name = withExtension(title, format);
  const file = await resumableDriveUpload(token, {
    name,
    parents: [folderId],
    appProperties: { readverse: "book", format },
  }, blob, blob.type || mimeForFormat(format));
  return platformJson({ ok: true, id: file.id, name: file.name, webViewLink: file.webViewLink });
}

async function requireSession(request: Request, env: PlatformEnv): Promise<{ id: string; record: SessionRecord } | Response> {
  if (!isConfigured(env)) return platformJson({ ok: false, error: "Google connection is not configured" }, 503);
  const session = await readSession(request, env);
  return session || platformJson({ ok: false, error: "Connect Google Drive first" }, 401);
}

async function readSession(request: Request, env: PlatformEnv): Promise<{ id: string; record: SessionRecord } | null> {
  const id = cookieValue(request, SESSION_COOKIE);
  if (!id || !env.SESSION_KV || !env.TOKEN_ENCRYPTION_KEY) return null;
  const encrypted = await env.SESSION_KV.get(`session:${id}`);
  if (!encrypted) return null;
  try { return { id, record: JSON.parse(await decrypt(encrypted, env.TOKEN_ENCRYPTION_KEY)) as SessionRecord }; }
  catch { await env.SESSION_KV.delete(`session:${id}`); return null; }
}

async function writeSession(id: string, record: SessionRecord, env: PlatformEnv): Promise<void> {
  await env.SESSION_KV!.put(`session:${id}`, await encrypt(JSON.stringify(record), env.TOKEN_ENCRYPTION_KEY!), { expirationTtl: SESSION_TTL });
}

async function validAccessToken(id: string, record: SessionRecord, env: PlatformEnv): Promise<string> {
  if (record.expiresAt > Date.now() + 30_000) return record.accessToken;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: record.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const token = await response.json() as TokenResponse & { error?: string };
  if (!response.ok || !token.access_token) throw new Error(token.error || "Google session refresh failed");
  record.accessToken = token.access_token;
  record.expiresAt = Date.now() + Math.max(60, token.expires_in - 60) * 1000;
  await writeSession(id, record, env);
  return record.accessToken;
}

async function ensureFolder(token: string, sessionId: string, record: SessionRecord, env: PlatformEnv): Promise<string> {
  if (record.folderId) return record.folderId;
  const query = encodeURIComponent(`name='${FOLDER_NAME.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const response = await googleRequest(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name)&pageSize=10`, token);
  const result = await response.json() as { files?: Array<{ id: string }> };
  let folderId = result.files?.[0]?.id;
  if (!folderId) {
    const create = await googleRequest("https://www.googleapis.com/drive/v3/files?fields=id,name", token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", appProperties: { readverse: "root" } }),
    });
    const folder = await create.json() as { id?: string; error?: { message?: string } };
    if (!create.ok || !folder.id) throw new Error(folder.error?.message || "ReadVerse Drive folder could not be created");
    folderId = folder.id;
  }
  record.folderId = folderId;
  await writeSession(sessionId, record, env);
  return folderId;
}

async function findDriveFile(token: string, name: string, folderId: string): Promise<{ id: string; modifiedTime?: string } | null> {
  const query = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`);
  const response = await googleRequest(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=10`, token);
  const result = await response.json() as { files?: Array<{ id: string; modifiedTime?: string }> };
  return result.files?.[0] || null;
}

async function resumableDriveUpload(token: string, metadata: Record<string, unknown>, blob: Blob, mimeType: string): Promise<{ id: string; name: string; webViewLink?: string }> {
  const start = await googleRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink", token, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": mimeType,
      "x-upload-content-length": String(blob.size),
    },
    body: JSON.stringify(metadata),
  });
  const location = start.headers.get("location");
  if (!start.ok || !location) throw new Error("Google Drive did not create an upload session");
  const upload = await fetch(location, { method: "PUT", headers: { "content-type": mimeType, "content-length": String(blob.size) }, body: blob });
  const file = await upload.json() as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } };
  if (!upload.ok || !file.id) throw new Error(file.error?.message || "Google Drive upload failed");
  return { id: file.id, name: file.name || String(metadata.name || "ReadVerse file"), webViewLink: file.webViewLink };
}

async function multipartDriveUpload(token: string, metadata: Record<string, unknown>, blob: Blob): Promise<{ id: string; modifiedTime?: string }> {
  const boundary = `readverse_${randomToken(12)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const response = await googleRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime", token, {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const file = await response.json() as { id?: string; modifiedTime?: string; error?: { message?: string } };
  if (!response.ok || !file.id) throw new Error(file.error?.message || "Google Drive file creation failed");
  return { id: file.id, modifiedTime: file.modifiedTime };
}

function googleRequest(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function encrypt(value: string, secret: string): Promise<string> {
  const ivBuffer = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuffer);
  crypto.getRandomValues(iv);
  const secretBytes = new TextEncoder().encode(secret);
  const secretBuffer = new ArrayBuffer(secretBytes.byteLength);
  new Uint8Array(secretBuffer).set(secretBytes);
  const digest = await crypto.subtle.digest("SHA-256", secretBuffer);
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const encoded = new TextEncoder().encode(value);
  const plainBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(plainBuffer).set(encoded);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBuffer }, key, plainBuffer);
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string, secret: string): Promise<string> {
  const [ivPart, dataPart] = value.split(".");
  if (!ivPart || !dataPart) throw new Error("Invalid encrypted session");
  const secretBytes = new TextEncoder().encode(secret);
  const secretBuffer = new ArrayBuffer(secretBytes.byteLength);
  new Uint8Array(secretBuffer).set(secretBytes);
  const digest = await crypto.subtle.digest("SHA-256", secretBuffer);
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const ivBytes = fromBase64(ivPart);
  const ivBuffer = new ArrayBuffer(ivBytes.byteLength);
  new Uint8Array(ivBuffer).set(ivBytes);
  const dataBytes = fromBase64(dataPart);
  const dataBuffer = new ArrayBuffer(dataBytes.byteLength);
  new Uint8Array(dataBuffer).set(dataBytes);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuffer }, key, dataBuffer);
  return new TextDecoder().decode(decrypted);
}

function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function randomToken(bytes: number): string { return toBase64(crypto.getRandomValues(new Uint8Array(bytes))); }
function cookieValue(request: Request, name: string): string | null {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function platformJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
function extensionOf(name: string): string { return name.toLowerCase().split(".").pop() || "pdf"; }
function withExtension(name: string, format: string): string { return name.toLowerCase().endsWith(`.${format.toLowerCase()}`) ? name : `${name}.${format.toLowerCase()}`; }
function mimeForFormat(format: string): string {
  return ({ pdf: "application/pdf", epub: "application/epub+zip", cbz: "application/vnd.comicbook+zip", txt: "text/plain;charset=utf-8" } as Record<string, string>)[format.toLowerCase()] || "application/octet-stream";
}
function isPublicHttpUrl(url: URL): boolean {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return Boolean(host) && host !== "localhost" && !host.endsWith(".local") && !/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) && host !== "::1";
}
