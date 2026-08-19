# Final NoTVerse 10-for-2 gate

This document records the canonical completion gate for the current NoTVerse product. It is a proof record, not an instruction to keep a temporary proof branch alive.

## Ten product fronts

1. Swipe-only setup.
2. Six-part navigation.
3. Home.
4. Search and discovery.
5. Notes and page flipping.
6. Library.
7. Functional persistent Inbox messaging.
8. Me / personal notebook state.
9. Companion and reader flow.
10. Exact NoTVerse identity and cleanup.

## Two proof gates

1. Strict architecture, TypeScript, Worker, production-build, ownership, and HTTPS-policy verification.
2. Fresh browser interaction/proof with inspectable evidence across Chromium and WebKit, including mobile keyboard/Comments/navigation behavior and the applicable desktop product boundaries.

## Release rule

No deployment is accepted merely because source or CI is green. The exact frozen candidate must pass the applicable proof gates, then the deployed public site must be reconciled back to that candidate.

For the current production line this includes:

- white physical Note paper;
- compact Activity control;
- Comments type/send/keyboard-down/Back with navigation visible before the first tap;
- no navigation/composer visual overlap;
- Chat/Inbox mobile viewport correctness;
- Notes social loop and desktop Comments proof;
- Worker/companion runtime proof;
- live HTTPS assets matching canonical production output;
- public HTTP permanently redirecting to HTTPS.

Temporary shadow/proof branches and private construction helpers are disposable. Canonical `main` must contain everything required to reproduce the proven system from a clean environment.
