# NoTVerse verification baseline

Canonical source only. No private helper, shadow workspace, stale branch, or local-only patch may be required for the proven product to work.

## Build and architecture gates

- `npm run build` passes from canonical source.
- Architecture, TypeScript, Worker, mobile-authority, companion-conversation, public-rating, guided-discovery, finished-product, NoTVerse, social-worker, and HTTPS policy verification remain green.
- The canonical Cloudflare Worker is named `notverse`, with its workers.dev production route explicitly enabled.
- The built Worker proves the canonical public HTTP request returns a permanent redirect to the same HTTPS URL.
- Local/CI HTTP hosts remain usable for deterministic proof.

## Browser interaction gates

Fresh generated production output must pass both Chromium and WebKit evidence for:

- Chat, Comments, and Inbox native mobile screens;
- mobile keyboard open/close geometry;
- Comments type/send/keyboard-down/Back with the bottom navigation already visibly painted before the first tap;
- the Comments backdrop remaining the painted top surface while the covered navigation stays inert and on its stable compositor layer;
- white physical Note paper and the compact Activity control;
- visible mobile touch targets, Notes gestures, Search, and six-part navigation;
- Notes social loop, real comments, persistence, Activity, sharing, and My Notes;
- desktop Comments containment and submission;
- companion/Worker recommendation routing.

Browser proof must include screenshots or equivalent inspectable evidence. A green assertion alone is insufficient when visual composition is part of the requirement.

## Product and storage gates

- Exact visible product identity is **NoTVerse**.
- Exact origin line is **Created for Nancy. Shared with the world.**
- No obsolete Gogo identity or route is reintroduced.
- A real local reading file opens without being silently uploaded to Cloudflare.
- Supported source URLs resolve through the approved safe resolver path.
- Add to Library stores library metadata/progress without silently retaining the full source file.
- Save offline and Save to Drive remain explicit user actions.
- Google state/Drive behavior uses the NoTVerse folder and canonical `notverse-state.json` state file when Google is configured.
- Companion chat remains functional and truthful about unavailable or unconfirmed actions.

## Live-production gate

For `https://notverse.pharrtechnolgiescoltd.workers.dev/`:

- HTTPS serves the exact canonical production asset graph and `/api/health` reports `app: NoTVerse`.
- Plain HTTP redirects permanently to the exact HTTPS destination before static/application handling.
- The live Comments keyboard/Back sequence preserves the stable navigation compositor and restores navigation before the first tap.
- Live mobile behavior must match the frozen browser evidence rather than merely matching repository source.

A release is complete only when the repository alone can reproduce the proven result from a clean environment and the deployed site matches that result.
