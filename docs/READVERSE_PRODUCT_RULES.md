# Nancy’s ReadVerse — Canonical Product Rules

Recovery baseline: 2026-07-28
Canonical architecture: local-first-google-owned-v2

This file is the recovery point and source of truth for future ReadVerse work.

## Storage and ownership

1. ReadVerse must not keep permanent personal file copies in Cloudflare R2, D1, KV, the repository, or any hidden server cache.
2. A local file opened by the user remains temporary unless the user explicitly chooses **Save offline** or **Save to Drive**.
3. A file fetched from a source URL is streamed or held temporarily for reading. It must not be retained by Cloudflare after the request.
4. **Add to Library** saves metadata, source, reader mode and progress. It does not silently save the full file.
5. **Save offline** stores the selected file in IndexedDB on that device. **Save to Drive** stores the complete file in the user’s Nancy’s ReadVerse Google Drive folder.
6. Permanent source links, personal settings, companion choices, ring colours, themes, notes, highlights, bookmarks, reading progress and library metadata sync to the user’s Google account/Google Drive.
7. Before Google is connected, durable local data may be kept in the browser. The UI must distinguish local/offline storage from Google Drive storage.
8. Cloudflare KV is used only for encrypted short-lived OAuth sessions and state. It is not a personal library or reading-file store.

## Source resolving

1. A source URL may point directly to a supported reading file or to a page containing an accessible reading-file link.
2. The resolver may remove common tracking parameters, ignore advertising links, follow safe redirects and inspect a page for legitimate PDF, EPUB, CBZ or TXT assets.
3. The resolver must not bypass authentication, DRM, paywalls, CAPTCHAs, anti-bot access controls or permissions.
4. The resolver must block local/private-network URLs and unsafe redirects.
5. A source is not considered working until the actual resolved file opens in the reader.
6. The companion must show verified details, ask before preparing, show preparation stages, and explain exact failures with a useful next action.

## Reader behaviour

1. PDF pages remain faithful to the original document and render inside the physical ReadVerse book experience.
2. EPUB uses a native paginated in-site reader, CBZ uses a native comic/manga reader, and TXT uses a native physical text-book reader.
3. Book, comic, manga, magazine and document modes preserve the ReadVerse reading identity while respecting the source file.
4. **Add to Library**, **Save offline** and **Save to Drive** are explicit, separate actions.
5. Reader page, progress, mode, bookmarks, highlights and notes persist locally and sync to Google Drive when connected.
6. Offline files are stored only after explicit consent and can reopen without the original source connection.
7. Closing a temporary item revokes temporary object URLs that were not saved offline.

## Google account and recovery

1. Google OAuth uses the web-server authorization-code flow, encrypted token storage and the least-privilege `drive.file` scope.
2. Refresh tokens and session records must never be committed to the public repository or exposed to the browser.
3. The app creates one **Nancy’s ReadVerse** folder in the user’s Google Drive.
4. Cross-device state uses a versioned `readverse-state.json` file and last-write timestamp recovery.
5. Full files use resumable Drive upload when saved.
6. If Google credentials are not configured, the interface reports that clearly and local/offline reading remains usable.

## Companion behaviour

1. There are twelve companions with distinct voices: Gojo, Itachi, Naruto, Kakashi, Megumi, Sasuke, Maki, Nobara, Hinata, Sakura, Temari and Mei Mei.
2. Every conversation request includes recent conversation history so personality remains consistent across multiple turns.
3. Companion responses must remain helpful, concise, spoiler-aware and honest.
4. A companion must never claim an upload, source resolution, save, Google sync or reader action succeeded without a confirmed result from the application.
5. Companion behaviour must be tested with multi-turn conversations for all twelve companions before release.

## Branding and cleanup

1. The canonical brand is **Nancy’s** with **READVERSE** below it in smaller text on mobile.
2. Gogo names, routes, files, database tables, workflows and assets are obsolete and must not be reintroduced.
3. When a new implementation replaces an old one, the old implementation is deleted in the same change.
4. There must be one canonical frontend, one canonical Worker implementation and one deployment pipeline.
5. Temporary trigger files, duplicate workflows, archived UI payloads and patch-on-patch build scripts are not allowed in the merged result.

## Definition of done

A release is not complete until the live deployed site has been tested with:

- a real local PDF that opens in the physical reader without uploading to Cloudflare;
- real EPUB, CBZ and TXT files in their native physical readers;
- a real supported source URL that resolves, asks for confirmation, prepares and opens as a temporary stream;
- a source page containing ad/tracker links where the legitimate file is selected and ad links are ignored;
- Add to Library with durable progress updates;
- Save offline with IndexedDB proof and offline reopening;
- Google status, OAuth start, state sync and Drive file-upload tests, with secrets kept outside the repository;
- multi-turn conversations with all twelve companions;
- desktop, tablet and mobile visual checks matching the intended design;
- confirmation that no obsolete Gogo or old ReadVerse implementation remains.
