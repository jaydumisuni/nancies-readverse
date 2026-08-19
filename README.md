# NoTVerse

**Created for Nancy. Shared with the world.**

NoTVerse is a polished, mobile-first reading universe for comics, manga, graphic novels, light novels, novels, PDFs, EPUBs, CBZ archives, TXT files, and other supported reading sources.

The canonical product name is **NoTVerse**. The repository name is historical and does not redefine product identity.

## Product surfaces

NoTVerse uses six primary navigation areas:

- Home
- Search
- Notes
- Library
- Inbox
- Me

Notes use physical notebook-paper presentation and page-style vertical flipping rather than an endless social-card feed. The mobile layout is one product design across browsers; compatibility work may account for engine behavior, but it must not create separate visual products.

## Companions

The approved companion roster is:

Gojo, Itachi, Naruto, Kakashi, Megumi, Sasuke, Maki, Nobara, Hinata, Sakura, Temari, and Mei Mei.

Companions assist with discovery, reading, sources, organisation, settings, and spoiler-aware conversation. They must not claim that a save, upload, sync, source resolution, or reader action succeeded unless the application confirms it.

## Storage model

NoTVerse is local-first with optional Google ownership and recovery:

- temporary reading files are not silently retained by Cloudflare;
- **Add to Library** stores metadata/progress, not an implicit permanent file copy;
- **Save offline** explicitly stores a selected file on the current device;
- **Save to Drive** explicitly stores a selected file in the user's **NoTVerse** Google Drive folder;
- Google account state uses the canonical `notverse-state.json` recovery file;
- Cloudflare KV is limited to short-lived encrypted session/state duties where configured.

## Canonical engineering rule

This repository follows `.ttg/project-policy.yaml`, which points to `ttg.tenfold.v1` in `jaydumisuni/OS-playbook`.

Substantial work follows:

**Understand → Build → Review → Freeze → Prove → Ship**

Temporary construction or diagnostic machinery is never product authority merely because it helped build or prove the system.

## Production

Canonical public site: `https://notverse.1ink.online/`

The public HTTP hostname must permanently redirect to HTTPS before application/static handling. A release is not complete merely because the repository builds; the frozen candidate must also satisfy the repository verification gates and live-production proof.
