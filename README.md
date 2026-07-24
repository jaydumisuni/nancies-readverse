# Nancy's ReadVerse

A private, mobile-first reading universe for comics, manga, graphic novels, light novels, novels, and general books.

## Architecture

- React + TypeScript + Vite frontend
- Cloudflare Worker API and static assets in one deployment
- D1 for library records, favourites, sources, and reading progress
- KV for private device sessions and temporary job state
- R2 only for files Nancy explicitly chooses to save
- Workers AI for Gogo's conversational help, with deterministic fallbacks

## Current phase

Phase 0 provides:

- A polished black ReadVerse shell
- A short `/dev-xxxxx` invitation route
- Secure HttpOnly device sessions
- `/api/health` and `/api/session`
- A first Gogo help endpoint
- Initial D1 schema
- Placeholder location for approved Gogo artwork

## Important security note

This repository was public when the scaffold was created. Keep secrets out of GitHub and change the repository to **Private** before adding deployment credentials or private assets.

Never commit:

- `INVITE_CODE`
- Cloudflare API tokens
- account IDs
- source login cookies
- private source credentials

## Local setup

```bash
npm install
npm run dev
```

For local invite testing, open any route such as:

```text
http://localhost:5173/dev-test1
```

Local development accepts a temporary invite path. Production requires the `INVITE_CODE` Worker secret.

## Cloudflare deployment

1. Change this repository to Private.
2. In Cloudflare, open **Workers & Pages**, create an application, and import this GitHub repository.
3. Use these Workers Builds settings:

```text
Worker name: nancies-readverse
Production branch: main
Build command: npm run build
Deploy command: npx wrangler deploy
Non-production branch deploy command: npx wrangler versions upload
Root directory: /
```

4. Add the Worker secret after the first Worker exists:

```bash
npx wrangler secret put INVITE_CODE
```

Use a value such as `dev-k7m4q`.

5. Apply the D1 migration after the first resource provisioning/deployment:

```bash
npx wrangler d1 migrations apply DB --remote
```

Cloudflare's current Wrangler can provision the declared D1, KV, and R2 bindings automatically during development or deployment.

## Gogo artwork

The scaffold intentionally contains no copied character artwork. Approved artwork should later be placed under `public/gogo/` using the asset names documented there.
