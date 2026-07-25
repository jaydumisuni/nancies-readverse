# Nancy’s ReadVerse — Canonical Product Rules

Recovery baseline: 2026-07-25
Canonical architecture: transient-reader-v1

This file is the recovery point and source of truth for future ReadVerse work.

## Storage and ownership

1. ReadVerse must not keep permanent personal file copies in Cloudflare R2, D1, KV, the repository, or any hidden server cache.
2. A local file opened by the user remains temporary in the browser session unless the user explicitly chooses **Save file**.
3. A file fetched from a source URL is streamed or held temporarily only for the active reading session. It must not be retained after the session.
4. The only source data that may be saved without copying the reading file is the original source link, and only after the user explicitly chooses to save it.
5. Permanent files, saved source links, personal settings, companion choices, ring colours, themes, notes, highlights, reading progress and library metadata belong in the user’s Google account/Google Drive.
6. Until Google is connected, the UI must say that data is temporary. It must never claim that data was saved permanently.

## Source resolving

1. A source URL may point directly to a supported reading file or to a page containing an accessible reading-file link.
2. The resolver may remove common tracking parameters, ignore advertising links, follow safe redirects and inspect a page for legitimate PDF, EPUB, CBZ or TXT assets.
3. The resolver must not bypass authentication, DRM, paywalls, CAPTCHAs, anti-bot access controls or permissions.
4. The resolver must block local/private-network URLs and unsafe redirects.
5. A source is not considered working until the actual resolved file opens in the reader.

## Reader behaviour

1. PDF and TXT files should open inside ReadVerse when supported by the browser.
2. EPUB and CBZ must not be described as natively supported until an in-site renderer is implemented and tested.
3. **Save file** and **Save source link** are explicit, separate actions.
4. Closing a temporary item removes it from the current session and revokes local object URLs.

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
5. Temporary trigger files, duplicate workflows, archived UI payloads and patch-on-patch build scripts are not allowed.

## Definition of done

A release is not complete until the live deployed site has been tested with:

- a real local PDF that opens in the reader without uploading to Cloudflare;
- a real supported source URL that resolves and opens as a temporary stream;
- a source page containing ad/tracker links where the legitimate file is selected and ad links are ignored;
- explicit save actions that do not falsely succeed before Google is connected;
- multi-turn conversations with all twelve companions;
- desktop, tablet and mobile visual checks matching the intended design;
- confirmation that no obsolete Gogo or old ReadVerse implementation remains.
