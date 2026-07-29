interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  SOCIAL_KV: KVNamespace;
  SOCIAL_AUTH_SECRET: string;
  ENVIRONMENT?: string;
  AI?: Ai;
}

type AuthClaims = { sub: string; email?: string; name?: string; exp: number };
type JsonRecord = Record<string, unknown>;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, app: "NoTVerse Social", status: "isolated", timestamp: new Date().toISOString() });
    if (!url.pathname.startsWith("/v1/")) return json({ ok: false, error: "Not found" }, 404);

    const auth = await authenticate(request, env);
    if (auth instanceof Response) return auth;
    await ensureAccount(auth, env);

    try {
      if (url.pathname === "/v1/profile") return profileRoute(request, auth, env);
      if (url.pathname === "/v1/notes") return notesRoute(request, auth, env, url);
      if (/^\/v1\/notes\/[^/]+$/.test(url.pathname)) return noteRoute(request, auth, env, decodeURIComponent(url.pathname.split("/")[3]));
      if (/^\/v1\/notes\/[^/]+\/replies$/.test(url.pathname)) return repliesRoute(request, auth, env, decodeURIComponent(url.pathname.split("/")[3]));
      if (/^\/v1\/notes\/[^/]+\/reactions$/.test(url.pathname)) return reactionsRoute(request, auth, env, decodeURIComponent(url.pathname.split("/")[3]));
      if (/^\/v1\/notes\/[^/]+\/save$/.test(url.pathname)) return saveNoteRoute(request, auth, env, decodeURIComponent(url.pathname.split("/")[3]));
      if (url.pathname === "/v1/notebooks") return notebooksRoute(request, auth, env);
      if (/^\/v1\/notebooks\/[^/]+\/join$/.test(url.pathname)) return joinNotebookRoute(request, auth, env, decodeURIComponent(url.pathname.split("/")[3]));
      if (url.pathname === "/v1/presence") return presenceRoute(request, auth, env, url);
      if (url.pathname === "/v1/inbox") return inboxRoute(request, auth, env);
      if (url.pathname === "/v1/messages") return messagesRoute(request, auth, env);
      if (/^\/v1\/ratings\/[^/]+$/.test(url.pathname)) return ratingsRoute(request, env, decodeURIComponent(url.pathname.split("/")[3]));
      if (url.pathname === "/v1/media") return mediaRoute(request, auth, env, url);
      if (url.pathname === "/v1/notifications") return notificationsRoute(request, auth, env);
      if (url.pathname === "/v1/reports") return reportsRoute(request, auth, env);
      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      console.error("NoTVerse social error", error);
      return json({ ok: false, error: error instanceof Error ? error.message : "Social service failed" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function profileRoute(request: Request, auth: AuthClaims, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const profile = await env.DB.prepare(`SELECT a.id, a.email, p.display_name AS displayName, p.nickname, p.bio, p.avatar_key AS avatarKey, p.pronouns, p.birthday, p.gender, p.favourite_genres AS favouriteGenres, p.reading_visibility AS readingVisibility, p.allow_followers AS allowFollowers, p.allow_message_requests AS allowMessageRequests FROM accounts a LEFT JOIN profiles p ON p.account_id=a.id WHERE a.id=?`).bind(auth.sub).first();
    return json({ ok: true, profile: profile ? parseProfile(profile) : null });
  }
  if (request.method !== "PUT") return methodNotAllowed();
  const body = await readJson(request, 64_000);
  const displayName = text(body.displayName, 80) || auth.name || auth.email?.split("@")[0] || "Reader";
  await env.DB.prepare(`INSERT INTO profiles(account_id,display_name,nickname,bio,avatar_key,pronouns,birthday,gender,favourite_genres,reading_visibility,allow_followers,allow_message_requests,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(account_id) DO UPDATE SET display_name=excluded.display_name,nickname=excluded.nickname,bio=excluded.bio,avatar_key=excluded.avatar_key,pronouns=excluded.pronouns,birthday=excluded.birthday,gender=excluded.gender,favourite_genres=excluded.favourite_genres,reading_visibility=excluded.reading_visibility,allow_followers=excluded.allow_followers,allow_message_requests=excluded.allow_message_requests,updated_at=CURRENT_TIMESTAMP`)
    .bind(auth.sub, displayName, text(body.nickname, 80), text(body.bio, 500), text(body.avatarKey, 220), text(body.pronouns, 80), text(body.birthday, 20), text(body.gender, 40), JSON.stringify(stringArray(body.favouriteGenres, 30, 80)), enumValue(body.readingVisibility, ["reading","book","approximate","private"], "approximate"), boolInt(body.allowFollowers, true), boolInt(body.allowMessageRequests, true)).run();
  await invalidate(env, `profile:${auth.sub}`);
  return json({ ok: true });
}

async function notesRoute(request: Request, auth: AuthClaims, env: Env, url: URL): Promise<Response> {
  if (request.method === "GET") {
    const view = url.searchParams.get("view") || "for-you";
    const bookId = url.searchParams.get("book");
    const notebookId = url.searchParams.get("notebook");
    const cursor = Math.max(0, Number(url.searchParams.get("cursor") || 0));
    const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") || 12)));
    const clauses = ["n.deleted_at IS NULL"];
    const values: unknown[] = [];
    if (view === "saved") { clauses.push("EXISTS(SELECT 1 FROM saved_notes s WHERE s.note_id=n.id AND s.account_id=?)"); values.push(auth.sub); }
    else if (view === "books") { clauses.push("n.book_id IN (SELECT json_extract(value,'$.id') FROM json_each(COALESCE((SELECT payload FROM social_library WHERE account_id=?),'[]'))) "); values.push(auth.sub); }
    else if (view === "following") { clauses.push("n.author_id IN (SELECT followed_id FROM follows WHERE follower_id=?)"); values.push(auth.sub); }
    else { clauses.push("(n.visibility='public' OR n.author_id=? OR (n.visibility='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followed_id=n.author_id)))"); values.push(auth.sub, auth.sub); }
    if (bookId) { clauses.push("n.book_id=?"); values.push(bookId); }
    if (notebookId) { clauses.push("n.notebook_id=?"); values.push(notebookId); }
    const rows = await env.DB.prepare(`SELECT n.*, p.display_name AS authorName, p.avatar_key AS authorAvatar, nb.name AS notebookName, b.canonical_title AS bookTitle, EXISTS(SELECT 1 FROM saved_notes s WHERE s.note_id=n.id AND s.account_id=?) AS savedByMe FROM notes n JOIN profiles p ON p.account_id=n.author_id LEFT JOIN notebooks nb ON nb.id=n.notebook_id LEFT JOIN books b ON b.id=n.book_id WHERE ${clauses.join(" AND ")} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`).bind(auth.sub, ...values, limit, cursor).all();
    return json({ ok: true, notes: rows.results.map(parseNote), nextCursor: rows.results.length === limit ? cursor + limit : null });
  }
  if (request.method !== "POST") return methodNotAllowed();
  const body = await readJson(request, 150_000);
  const id = crypto.randomUUID();
  const noteBody = text(body.body, 12_000);
  if (!noteBody) return json({ ok: false, error: "Note text is required" }, 400);
  const visibility = enumValue(body.visibility, ["private","followers","public","notebook","direct"], "private");
  await env.DB.prepare(`INSERT INTO notes(id,author_id,notebook_id,book_id,note_type,body,visibility,chapter,volume,page,spoiler_scope,spoiler_boundary,image_key,tags) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, auth.sub, text(body.notebookId, 80), text(body.bookId, 120), enumValue(body.noteType, ["Thought","Reaction","Review","Theory","Question","Recommendation","Quote","Reading update"], "Thought"), noteBody, visibility, text(body.chapter, 80), text(body.volume, 80), text(body.page, 80), text(body.spoilerScope, 120) || "No spoilers", text(body.spoilerBoundary, 180), text(body.imageKey, 260), JSON.stringify(stringArray(body.tags, 20, 60))).run();
  await invalidate(env, "notes:public", body.bookId ? `notes:book:${body.bookId}` : "");
  return json({ ok: true, id }, 201);
}

async function noteRoute(request: Request, auth: AuthClaims, env: Env, id: string): Promise<Response> {
  const note = await env.DB.prepare(`SELECT * FROM notes WHERE id=? AND deleted_at IS NULL`).bind(id).first();
  if (!note) return json({ ok: false, error: "Note not found" }, 404);
  if (request.method === "GET") return json({ ok: true, note: parseNote(note) });
  if (String(note.author_id) !== auth.sub) return json({ ok: false, error: "Only the author can change this Note" }, 403);
  if (request.method === "DELETE") {
    await env.DB.prepare(`UPDATE notes SET deleted_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    return json({ ok: true });
  }
  if (request.method !== "PATCH") return methodNotAllowed();
  const body = await readJson(request, 150_000);
  const nextBody = text(body.body, 12_000) || String(note.body);
  await env.DB.prepare(`UPDATE notes SET body=?, visibility=?, spoiler_scope=?, spoiler_boundary=?, tags=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nextBody, enumValue(body.visibility, ["private","followers","public","notebook","direct"], String(note.visibility)), text(body.spoilerScope, 120) || String(note.spoiler_scope), text(body.spoilerBoundary, 180), JSON.stringify(stringArray(body.tags, 20, 60)), id).run();
  return json({ ok: true });
}

async function repliesRoute(request: Request, auth: AuthClaims, env: Env, noteId: string): Promise<Response> {
  const note = await env.DB.prepare(`SELECT id FROM notes WHERE id=? AND deleted_at IS NULL`).bind(noteId).first();
  if (!note) return json({ ok: false, error: "Note not found" }, 404);
  if (request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT r.id,r.body,r.spoiler_scope AS spoilerScope,r.created_at AS createdAt,p.display_name AS authorName,p.avatar_key AS authorAvatar FROM replies r JOIN profiles p ON p.account_id=r.author_id WHERE r.note_id=? AND r.deleted_at IS NULL ORDER BY r.created_at`).bind(noteId).all();
    return json({ ok: true, replies: rows.results });
  }
  if (request.method !== "POST") return methodNotAllowed();
  const body = await readJson(request, 80_000);
  const replyBody = text(body.body, 6000);
  if (!replyBody) return json({ ok: false, error: "Reply text is required" }, 400);
  const id = crypto.randomUUID();
  const batch = [
    env.DB.prepare(`INSERT INTO replies(id,note_id,author_id,body,spoiler_scope) VALUES(?,?,?,?,?)`).bind(id, noteId, auth.sub, replyBody, text(body.spoilerScope, 120) || "No spoilers"),
    env.DB.prepare(`UPDATE notes SET reply_count=reply_count+1 WHERE id=?`).bind(noteId),
  ];
  await env.DB.batch(batch);
  return json({ ok: true, id }, 201);
}

async function reactionsRoute(request: Request, auth: AuthClaims, env: Env, noteId: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const body = await readJson(request, 20_000);
  const reaction = enumValue(body.reaction, ["heart","laugh","think","fire","wow"], "heart");
  const existing = await env.DB.prepare(`SELECT 1 FROM reactions WHERE note_id=? AND account_id=? AND reaction=?`).bind(noteId, auth.sub, reaction).first();
  if (existing) {
    await env.DB.batch([env.DB.prepare(`DELETE FROM reactions WHERE note_id=? AND account_id=? AND reaction=?`).bind(noteId, auth.sub, reaction), env.DB.prepare(`UPDATE notes SET reaction_count=MAX(0,reaction_count-1) WHERE id=?`).bind(noteId)]);
    return json({ ok: true, active: false });
  }
  await env.DB.batch([env.DB.prepare(`INSERT INTO reactions(note_id,account_id,reaction) VALUES(?,?,?)`).bind(noteId, auth.sub, reaction), env.DB.prepare(`UPDATE notes SET reaction_count=reaction_count+1 WHERE id=?`).bind(noteId)]);
  return json({ ok: true, active: true });
}

async function saveNoteRoute(request: Request, auth: AuthClaims, env: Env, noteId: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const existing = await env.DB.prepare(`SELECT 1 FROM saved_notes WHERE account_id=? AND note_id=?`).bind(auth.sub, noteId).first();
  if (existing) {
    await env.DB.prepare(`DELETE FROM saved_notes WHERE account_id=? AND note_id=?`).bind(auth.sub, noteId).run();
    return json({ ok: true, saved: false });
  }
  await env.DB.prepare(`INSERT INTO saved_notes(account_id,note_id) VALUES(?,?)`).bind(auth.sub, noteId).run();
  return json({ ok: true, saved: true });
}

async function notebooksRoute(request: Request, auth: AuthClaims, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT n.*, p.display_name AS ownerName, (SELECT COUNT(*) FROM notebook_members m WHERE m.notebook_id=n.id) AS members FROM notebooks n JOIN profiles p ON p.account_id=n.owner_id WHERE n.type='public' OR n.owner_id=? OR EXISTS(SELECT 1 FROM notebook_members m WHERE m.notebook_id=n.id AND m.account_id=?) ORDER BY n.updated_at DESC LIMIT 40`).bind(auth.sub, auth.sub).all();
    return json({ ok: true, notebooks: rows.results });
  }
  if (request.method !== "POST") return methodNotAllowed();
  const body = await readJson(request, 80_000);
  const name = text(body.name, 120);
  if (!name) return json({ ok: false, error: "Notebook name is required" }, 400);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO notebooks(id,owner_id,name,description,type,cover_key,rules) VALUES(?,?,?,?,?,?,?)`).bind(id, auth.sub, name, text(body.description, 1000), enumValue(body.type, ["public","private","invite-only"], "private"), text(body.coverKey, 240), text(body.rules, 4000)),
    env.DB.prepare(`INSERT INTO notebook_members(notebook_id,account_id,role) VALUES(?,?,'owner')`).bind(id, auth.sub),
  ]);
  return json({ ok: true, id }, 201);
}

async function joinNotebookRoute(request: Request, auth: AuthClaims, env: Env, notebookId: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const notebook = await env.DB.prepare(`SELECT type FROM notebooks WHERE id=?`).bind(notebookId).first();
  if (!notebook) return json({ ok: false, error: "Notebook not found" }, 404);
  if (String(notebook.type) !== "public") return json({ ok: false, error: "This Notebook requires an invitation" }, 403);
  await env.DB.prepare(`INSERT OR IGNORE INTO notebook_members(notebook_id,account_id,role) VALUES(?,?,'member')`).bind(notebookId, auth.sub).run();
  return json({ ok: true });
}

async function presenceRoute(request: Request, auth: AuthClaims, env: Env, url: URL): Promise<Response> {
  if (request.method === "PUT") {
    const body = await readJson(request, 30_000);
    const visibility = enumValue(body.visibility, ["reading","book","approximate","private"], "private");
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    await env.DB.prepare(`INSERT INTO reading_presence(account_id,book_id,visibility,chapter_bucket,volume_bucket,updated_at,expires_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(account_id) DO UPDATE SET book_id=excluded.book_id,visibility=excluded.visibility,chapter_bucket=excluded.chapter_bucket,volume_bucket=excluded.volume_bucket,updated_at=CURRENT_TIMESTAMP,expires_at=excluded.expires_at`).bind(auth.sub, text(body.bookId, 120), visibility, visibility === "approximate" ? text(body.chapterBucket, 60) : null, visibility === "approximate" ? text(body.volumeBucket, 60) : null, expires).run();
    await env.SOCIAL_KV.put(`presence:${auth.sub}`, JSON.stringify({ bookId: body.bookId, visibility, chapterBucket: body.chapterBucket, volumeBucket: body.volumeBucket, expiresAt: expires }), { expirationTtl: 900 });
    return json({ ok: true, expiresAt: expires });
  }
  if (request.method !== "GET") return methodNotAllowed();
  const bookId = url.searchParams.get("book");
  if (!bookId) return json({ ok: true, readers: [] });
  const rows = await env.DB.prepare(`SELECT rp.account_id AS id,p.display_name AS name,p.avatar_key AS avatar,rp.chapter_bucket AS chapterBucket,rp.volume_bucket AS volumeBucket FROM reading_presence rp JOIN profiles p ON p.account_id=rp.account_id WHERE rp.book_id=? AND rp.expires_at>CURRENT_TIMESTAMP AND rp.visibility<>'private' AND rp.account_id<>? ORDER BY CASE WHEN rp.visibility='approximate' THEN 0 ELSE 1 END,rp.updated_at DESC LIMIT 20`).bind(bookId, auth.sub).all();
  return json({ ok: true, readers: rows.results.slice(0, 4), additional: Math.max(0, rows.results.length - 4) });
}

async function inboxRoute(request: Request, auth: AuthClaims, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed();
  const rows = await env.DB.prepare(`SELECT c.id,c.updated_at AS updatedAt,(SELECT m.body FROM messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS preview,(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.created_at>COALESCE(cm.last_read_at,'1970-01-01') AND m.sender_id<>?) AS unread FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.account_id=? WHERE cm.blocked=0 ORDER BY c.updated_at DESC LIMIT 50`).bind(auth.sub, auth.sub).all();
  return json({ ok: true, threads: rows.results });
}

async function messagesRoute(request: Request, auth: AuthClaims, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const body = await readJson(request, 80_000);
  const conversationId = text(body.conversationId, 80);
  if (!conversationId) return json({ ok: false, error: "Conversation is required" }, 400);
  const member = await env.DB.prepare(`SELECT 1 FROM conversation_members WHERE conversation_id=? AND account_id=? AND blocked=0`).bind(conversationId, auth.sub).first();
  if (!member) return json({ ok: false, error: "Conversation access denied" }, 403);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO messages(id,conversation_id,sender_id,body,shared_note_id,shared_book_id,shared_notebook_id) VALUES(?,?,?,?,?,?,?)`).bind(id, conversationId, auth.sub, text(body.body, 8000), text(body.sharedNoteId, 80), text(body.sharedBookId, 120), text(body.sharedNotebookId, 80)),
    env.DB.prepare(`UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(conversationId),
  ]);
  return json({ ok: true, id }, 201);
}

async function ratingsRoute(request: Request, env: Env, bookId: string): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed();
  const rows = await env.DB.prepare(`SELECT source_name AS sourceName,source_book_id AS sourceBookId,rating,rating_count AS ratingCount,edition_match AS editionMatch,collected_at AS collectedAt FROM rating_sources WHERE book_id=? AND collected_at>datetime('now','-30 days')`).bind(bookId).all();
  if (rows.results.length < 3 || !rows.results.some((row) => String(row.sourceName).toLowerCase() === "goodreads")) {
    return json({ ok: true, available: false, reason: "Three approved edition-matched rating sources, including Goodreads, are not connected for this title.", sources: rows.results });
  }
  let weighted = 0;
  let weight = 0;
  for (const row of rows.results) {
    const count = Math.max(1, Number(row.ratingCount));
    const confidence = Math.max(0, Math.min(1, Number(row.editionMatch)));
    const sourceWeight = Math.log10(count + 10) * confidence;
    weighted += Number(row.rating) * sourceWeight;
    weight += sourceWeight;
  }
  return json({ ok: true, available: true, overall: weight ? Number((weighted / weight).toFixed(2)) : null, ratingCount: rows.results.reduce((sum, row) => sum + Number(row.ratingCount), 0), sources: rows.results });
}

async function mediaRoute(request: Request, auth: AuthClaims, env: Env, url: URL): Promise<Response> {
  if (request.method === "GET") {
    const key = url.searchParams.get("key");
    if (!key || !key.startsWith(`${auth.sub}/`)) return json({ ok: false, error: "Media access denied" }, 403);
    const object = await env.MEDIA.get(key);
    if (!object) return json({ ok: false, error: "Media not found" }, 404);
    return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private,max-age=3600", etag: object.etag } });
  }
  if (request.method !== "POST") return methodNotAllowed();
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("image/")) return json({ ok: false, error: "Only small social images are accepted" }, 415);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 5 * 1024 * 1024) return json({ ok: false, error: "Image is larger than 5 MB" }, 413);
  const blob = await request.blob();
  if (!blob.size || blob.size > 5 * 1024 * 1024) return json({ ok: false, error: "Invalid image size" }, 400);
  const extension = type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "img";
  const key = `${auth.sub}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  await env.MEDIA.put(key, blob.stream(), { httpMetadata: { contentType: type }, customMetadata: { owner: auth.sub, purpose: text(url.searchParams.get("purpose"), 40) || "note-image" } });
  return json({ ok: true, key }, 201);
}

async function notificationsRoute(request: Request, auth: AuthClaims, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed();
  const rows = await env.DB.prepare(`SELECT id,actor_id AS actorId,type,entity_id AS entityId,payload,read_at AS readAt,created_at AS createdAt FROM notifications WHERE account_id=? ORDER BY created_at DESC LIMIT 60`).bind(auth.sub).all();
  return json({ ok: true, notifications: rows.results.map((row) => ({ ...row, payload: safeJson(String(row.payload || "{}")) })) });
}

async function reportsRoute(request: Request, auth: AuthClaims, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const body = await readJson(request, 50_000);
  const entityType = enumValue(body.entityType, ["note","reply","profile","notebook","message"], "note");
  const entityId = text(body.entityId, 100);
  const reason = text(body.reason, 120);
  if (!entityId || !reason) return json({ ok: false, error: "Report target and reason are required" }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO reports(id,reporter_id,entity_type,entity_id,reason,details) VALUES(?,?,?,?,?,?)`).bind(id, auth.sub, entityType, entityId, reason, text(body.details, 1500)).run();
  return json({ ok: true, id }, 201);
}

async function authenticate(request: Request, env: Env): Promise<AuthClaims | Response> {
  const testUser = request.headers.get("x-notverse-test-user");
  if (testUser && env.ENVIRONMENT !== "production") return { sub: testUser, email: `${testUser}@test.invalid`, name: "Test Reader", exp: Math.floor(Date.now() / 1000) + 3600 };
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !env.SOCIAL_AUTH_SECRET) return json({ ok: false, error: "Authentication required" }, 401);
  try {
    const [payloadPart, signaturePart] = token.split(".");
    if (!payloadPart || !signaturePart) throw new Error("Malformed token");
    const expected = await sign(payloadPart, env.SOCIAL_AUTH_SECRET);
    if (!constantTimeEqual(signaturePart, expected)) throw new Error("Invalid signature");
    const claims = JSON.parse(new TextDecoder().decode(fromBase64(payloadPart))) as AuthClaims;
    if (!claims.sub || claims.exp * 1000 < Date.now()) throw new Error("Expired token");
    return claims;
  } catch {
    return json({ ok: false, error: "Invalid or expired session" }, 401);
  }
}

async function ensureAccount(auth: AuthClaims, env: Env): Promise<void> {
  await env.DB.prepare(`INSERT INTO accounts(id,email) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,updated_at=CURRENT_TIMESTAMP`).bind(auth.sub, auth.email || `${auth.sub}@notverse.local`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO profiles(account_id,display_name) VALUES(?,?)`).bind(auth.sub, auth.name || auth.email?.split("@")[0] || "Reader").run();
}

function parseProfile(row: JsonRecord): JsonRecord {
  return { ...row, favouriteGenres: safeJson(String(row.favouriteGenres || "[]")), allowFollowers: Boolean(row.allowFollowers), allowMessageRequests: Boolean(row.allowMessageRequests) };
}
function parseNote(row: JsonRecord): JsonRecord {
  return { ...row, tags: safeJson(String(row.tags || "[]")), savedByMe: Boolean(row.savedByMe) };
}
function safeJson(value: string): unknown { try { return JSON.parse(value); } catch { return null; } }
async function readJson(request: Request, limit: number): Promise<JsonRecord> {
  const raw = await request.text();
  if (raw.length > limit) throw new Error("Request is too large");
  try { return JSON.parse(raw) as JsonRecord; } catch { throw new Error("Invalid JSON body"); }
}
function text(value: unknown, limit: number): string | null { return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null; }
function stringArray(value: unknown, maxItems: number, maxLength: number): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems) : []; }
function enumValue<T extends string>(value: unknown, choices: readonly T[], fallback: T): T { return typeof value === "string" && choices.includes(value as T) ? value as T : fallback; }
function boolInt(value: unknown, fallback: boolean): number { return typeof value === "boolean" ? Number(value) : Number(fallback); }
function methodNotAllowed(): Response { return json({ ok: false, error: "Method not allowed" }, 405); }
function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS }); }
async function invalidate(env: Env, ...keys: string[]): Promise<void> { await Promise.all(keys.filter(Boolean).map((key) => env.SOCIAL_KV.delete(key))); }
async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}
function toBase64(value: Uint8Array): string { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64(value: string): Uint8Array { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4); return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)); }
function constantTimeEqual(left: string, right: string): boolean { if (left.length !== right.length) return false; let result = 0; for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index); return result === 0; }
