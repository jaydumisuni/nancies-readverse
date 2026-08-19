# NoTVerse — Canonical Product Rules

Recovery baseline: 2026-08-19  
Canonical architecture: local-first-google-owned-v2

This file is the recovery point and source of truth for future **NoTVerse** product work. Historical repository/file identifiers may still contain `readverse`, but they do not redefine the visible product identity.

## Storage and ownership

1. NoTVerse must not keep permanent personal file copies in Cloudflare R2, D1, KV, the repository, or any hidden server cache unless a separately owned service explicitly requires and documents that storage.
2. A local file opened by the user remains temporary unless the user explicitly chooses **Save offline** or **Save to Drive**.
3. A file fetched from a source URL is streamed or held temporarily for reading. It must not be silently retained by Cloudflare after the request.
4. **Add to Library** saves metadata, source, reader mode, and progress. It does not silently save the complete source file.
5. **Save offline** stores the selected file in IndexedDB on that device. **Save to Drive** stores the complete file in the user's **NoTVerse** Google Drive folder.
6. Permanent source links, personal settings, companion choices, ring colours, themes, notes, highlights, bookmarks, reading progress, and library metadata may sync to the user's Google account/Google Drive when Google is connected.
7. Before Google is connected, durable local data may be kept in the browser. The UI must distinguish local/offline storage from Google Drive storage.
8. Cloudflare KV is used only for encrypted short-lived OAuth sessions/state where configured. It is not a personal library or reading-file store.

## Source resolving

1. A source URL may point directly to a supported reading file or to a page containing an accessible reading-file link.
2. The resolver may remove common tracking parameters, ignore advertising links, follow safe redirects, and inspect a page for legitimate PDF, EPUB, CBZ, or TXT assets.
3. The resolver must not bypass authentication, DRM, paywalls, CAPTCHAs, anti-bot access controls, or permissions.
4. The resolver must block local/private-network URLs and unsafe redirects.
5. A source is not considered working until the actual resolved file opens in the reader.
6. The companion must show verified details, ask before preparing where required, show preparation stages, and explain exact failures with a useful next action.

## Reader behaviour

1. PDF pages remain faithful to the original document and render inside the physical NoTVerse reading experience.
2. EPUB uses a native paginated in-site reader, CBZ uses a native comic/manga reader, and TXT uses a native physical text-book reader.
3. Book, comic, manga, magazine, and document modes preserve the NoTVerse reading identity while respecting the source file.
4. **Add to Library**, **Save offline**, and **Save to Drive** are explicit, separate actions.
5. Reader page, progress, mode, bookmarks, highlights, and notes persist locally and may sync to Google Drive when connected.
6. Offline files are stored only after explicit consent and can reopen without the original source connection.
7. Closing a temporary item revokes temporary object URLs that were not saved offline.

## Google account and recovery

1. Google OAuth uses the web-server authorization-code flow, encrypted token storage, and the least-privilege `drive.file` scope.
2. Refresh tokens and session records must never be committed to the public repository or exposed to the browser.
3. The app creates one **NoTVerse** folder in the user's Google Drive.
4. Cross-device state uses the versioned canonical `notverse-state.json` file and last-write timestamp recovery.
5. Full files use resumable Drive upload when saved.
6. If Google credentials are not configured, the interface reports that clearly and local/offline reading remains usable.

## Companion behaviour

1. There are twelve approved companions with distinct voices: Gojo, Itachi, Naruto, Kakashi, Megumi, Sasuke, Maki, Nobara, Hinata, Sakura, Temari, and Mei Mei.
2. Every conversation request includes the recent context required for personality/continuity within the supported conversation contract.
3. Companion responses must remain helpful, concise, spoiler-aware, and honest.
4. A companion must never claim an upload, source resolution, save, Google sync, or reader action succeeded without a confirmed result from the application.
5. Recommendation requests must not be misrouted as source-link requests.

## Notes and social behaviour

1. Notes are physical notebook pages flipped vertically; they are not an endless social-card feed.
2. The Note paper is a true light-only white physical-paper surface inside the dark application shell.
3. Activity is the compact approved header control, not a replacement text-labelled pseudo-button.
4. Comments use in-tree React ownership and native form submission.
5. On mobile, keyboard open/close and Comments return must not destroy/recreate the bottom navigation compositor.
6. Social data belongs in the isolated `social-worker` service; copied reading books never belong in its R2 bucket.

## Branding and cleanup

1. The exact canonical visible product name is **NoTVerse**.
2. The exact origin line is **Created for Nancy. Shared with the world.**
3. Gogo naming/routes and superseded Nancy's ReadVerse/READVERSE visible identity are obsolete and must not be reintroduced as current product branding.
4. Historical repository names, internal identifiers, or migration-era names may remain only where they are still required technical identifiers and do not leak as current product identity.
5. When a new implementation replaces an old one, the old implementation is removed from the active runtime/authority graph in the same correction.
6. There must be one canonical frontend, one canonical Worker entry path, and one canonical deployment authority.
7. Temporary diagnostic/shadow machinery is never product authority and must not be required by a clean clone.

## Web and deployment security

1. Canonical public origin: `https://notverse.1ink.online/`.
2. Plain HTTP requests for `notverse.1ink.online` permanently redirect to the exact HTTPS destination before application/static handling.
3. Local/CI HTTP hosts may remain available for deterministic proof and must not be forced through the public-host redirect policy.
4. A successful repository build is not deployment proof. The live HTTPS asset graph must match the frozen canonical production build.

## Engineering authority

1. `.ttg/project-policy.yaml` is the repository-local pointer to the canonical `ttg.tenfold.v1` execution standard in `jaydumisuni/OS-playbook`.
2. Work follows **Understand → Build → Review → Freeze → Prove → Ship**.
3. Substantial work uses distinct evidence obligations and independent review rather than duplicate parallel opinions.
4. Tests and execution confirm/prove engineering; they do not replace source recovery, ownership analysis, or review.
5. Only the exact frozen/proven candidate may be promoted through canonical authority.

## Definition of done

A release is not complete until the frozen canonical candidate has evidence for the applicable product fronts, including:

- a real local supported reading file opening without silent Cloudflare retention;
- supported source URL resolution through the safe resolver path;
- Add to Library with durable metadata/progress;
- explicit Save offline behavior and offline reopening where applicable;
- Google status/OAuth/state sync/Drive upload behavior when configured, with secrets outside the repository;
- companion conversation and recommendation routing;
- Chromium and WebKit mobile Chat, Comments, Inbox, keyboard, Notes, Activity, and navigation behavior;
- desktop Comments and primary desktop/tablet/mobile layout checks;
- strict build/Worker verification from canonical source;
- live HTTPS asset identity matching the frozen build;
- live HTTP → HTTPS redirect proof;
- confirmation that superseded product/runtime owners are not part of the active graph.

NoTVerse is complete only when the repository alone can reproduce the proven system from a clean environment without private construction scaffolding.
