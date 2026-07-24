# Nancy's ReadVerse — Google signup staging

Google signup is implemented as a server-side OAuth 2.0 flow in the ReadVerse Worker, but it remains disabled until the application testing is complete.

## Isolation rule

Use a dedicated OAuth client for `jaydumisuni/nancies-readverse` and store its values only in the separate Cloudflare account that owns the `nancies-readverse` Worker. Do not reuse Hunter's Google client ID, client secret, callback URLs, sessions, or Cloudflare account.

## Current deployed origin

```text
https://nancies-readverse.pharrtechnolgiescoltd.workers.dev
```

## Google OAuth client

Create a **Web application** OAuth client named `Nancy's ReadVerse Web`.

Use only these scopes for signup:

- `openid`
- `email`
- `profile`

Do not add Google Drive scopes to the signup client flow. Drive access will be connected later as a separate, explicit permission step.

### Authorized JavaScript origins

```text
https://nancies-readverse.pharrtechnolgiescoltd.workers.dev
http://localhost:5173
```

### Authorized redirect URIs

```text
https://nancies-readverse.pharrtechnolgiescoltd.workers.dev/api/auth/google/callback
http://localhost:5173/api/auth/google/callback
```

The production URI must exactly match the domain used by the Worker. If a custom domain is added later, add its callback URI to the same OAuth client before switching traffic.

## Cloudflare Worker secrets

Store these values on the `nancies-readverse` Worker in its own Cloudflare account:

```text
GOOGLE_CLIENT_ID=<Google web client ID>
GOOGLE_CLIENT_SECRET=<Google web client secret>
GOOGLE_REDIRECT_URI=https://nancies-readverse.pharrtechnolgiescoltd.workers.dev/api/auth/google/callback
GOOGLE_ALLOWED_EMAILS=<comma-separated approved Google accounts>
GOOGLE_AUTH_ENABLED=false
```

`GOOGLE_ALLOWED_EMAILS` is required. An empty allowlist keeps every account blocked even if the enable flag is changed accidentally.

## Prepared Worker routes

```text
GET  /api/auth/google/status
GET  /api/auth/google/start
GET  /api/auth/google/callback
GET  /api/auth/session
POST /api/auth/logout
```

While `GOOGLE_AUTH_ENABLED` is absent or `false`, `/api/auth/google/start` returns `GOOGLE_AUTH_DISABLED`, the frontend uses direct mode, and the current ReadVerse experience remains unchanged.

## Activation sequence

After all other ReadVerse testing is complete:

1. Merge the staged Google-auth pull request.
2. Apply the remote D1 migration with `npx wrangler d1 migrations apply DB --remote` from the separate ReadVerse Cloudflare account, or deploy with `npm run deploy`.
3. Confirm `/api/auth/google/status` reports `configured: true` and `enabled: false`.
4. Change only the Worker secret below:

```text
GOOGLE_AUTH_ENABLED=true
```

The frontend will then replace direct mode with the Google sign-in gate automatically. No additional UI commit is required.

## Storage

- D1 stores approved Google user records.
- KV stores short-lived OAuth state and HttpOnly login sessions.
- The session cookie is `readverse_session`, `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS.
