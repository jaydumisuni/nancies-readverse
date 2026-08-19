# NoTVerse — Approved UI Baseline

This document records the canonical visible NoTVerse product. Backend, runtime, storage, and compatibility work must connect to these surfaces without redesigning them accidentally.

## Identity

- Product name: **NoTVerse**
- Origin line: **Created for Nancy. Shared with the world.**
- Mature dark shell with the approved neon/accent language.
- One product design across desktop and mobile browsers; browser-specific compatibility behavior must not create browser-specific visual products.

## Primary surfaces

1. Home and greeting hierarchy.
2. Search and discovery.
3. Physical Notes workspace.
4. Library and reader entry.
5. Persistent Inbox messaging.
6. Me / personal notebook state.
7. Companion card and companion chat.
8. Reader, fullscreen, bookmarks, highlights, and notes.
9. Settings and the approved twelve-companion roster.
10. Six-part mobile bottom navigation: Home, Search, Notes, Library, Inbox, Me.

## Notes mobile contract

- Note paper is a true light-only white physical-paper surface inside the dark application shell.
- Notes use vertical page-style flipping rather than an endless social-card feed.
- Activity is a compact 44×44 header control with its unread indicator; no fake text-labelled replacement button.
- Comments use the application tree and native form submission.
- Opening/closing the software keyboard must not destroy/recreate the bottom navigation compositor.
- While Comments is open, the navigation may remain mounted/painted underneath the opaque Comments surface but must be inert and must not overlap the Comments composer visually.
- Returning from Comments must reveal the navigation before the user's first tap.

## Compatibility rule

WebKit, Chromium, and other engines may require different internal handling for viewport, safe-area, keyboard, or compositor behavior. Those differences belong to compatibility mechanics only. Spacing, paper colour, controls, navigation identity, and the visible product contract remain shared.

## Change rule

When a new implementation becomes canonical, the superseded implementation must not remain as a competing runtime/layout owner. Visual work is accepted only after code review plus inspectable browser evidence against the frozen candidate.
