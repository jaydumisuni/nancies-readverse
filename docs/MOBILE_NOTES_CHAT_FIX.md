# NoTVerse mobile Notes and companion correction

This change is intentionally limited to three verified failures reported on 2026-08-03:

1. Notes must fit the mobile viewport without document scrolling because vertical gestures flip Notes.
2. Companion chat must self-adjust to the viewport, keep the composer reachable and hide visual scrollbars while preserving internal history scrolling.
3. Companion answers must respond to the actual question. Recommendation requests must never be misclassified as source-link requests because the word `read` contains `ad`.

## Release gates

- No production deployment before strict build and visual desktop/mobile proof.
- Mobile Notes document height must equal viewport height.
- Mobile companion composer must remain inside the safe viewport.
- Mobile navigation must leave the screen while companion chat is open.
- Chat history may scroll internally, but no scrollbar track may be visible.
- The gambling recommendation regression must return a recommendation-oriented answer rather than “Paste the link directly.”
