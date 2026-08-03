# NoTVerse mobile Notes and companion regression v2

## Recovered failures

- The companion surface did not consistently occupy the usable viewport.
- Browser scrollbar tracks remained visible beside chat.
- Mobile Notes allowed document scrolling even though vertical swipes are reserved for page flipping.
- The Note footer could sit behind the six-tab navigation.
- A request for gambling book recommendations was misclassified as a source-link request because the old fallback matched `link` inside `gambling`.

## Frozen correction

- Render the companion panel through a React portal into `document.body`.
- Size the companion panel from the visual viewport and keep the composer inside the usable screen.
- Keep chat history internally scrollable while hiding the visual scrollbar track.
- Lock mobile Notes to the space above navigation and reserve vertical gestures for Note flipping.
- Route recommendation requests through catalogue discovery before generic companion fallback.

## Proof

The exact generated production client passed:

- Desktop chat at 1366 × 768.
- Tablet chat at 820 × 1024 without squeezing the Home layout.
- Mobile Notes at 360 × 640 and 390 × 844 with the full Note footer above navigation.
- Swipe-forward movement from Note 1/3 to 2/3.
- Mobile companion chat at 390 × 844 and after a resize to 390 × 520.
- Catalogue-backed recommendations for `Do you have recommendations for books I can read on gambling?` without invoking the generic source-link fallback.

Verified source commit: `9f905c94c1ff4bc7bb7c9c4ca4e7be2e1f25fbfb`

Proof run: `30860817161`
