export {};

/*
 * iOS/WebKit keyboard handoff for Comments -> Notes.
 *
 * The mobile Send control intentionally keeps the comment input focused so a
 * reader can send more than one reply without reopening the keyboard. On iOS,
 * closing the Comments portal while that keyboard/visualViewport transition is
 * still unwinding can leave bottom-positioned layers with stale paint state.
 *
 * Do not move any application surface here. The mobile viewport controller and
 * CSS remain the geometry owners. This module only sequences the existing Back
 * click after focus is released and the visual viewport has recovered.
 */

const mobile = window.matchMedia("(max-width: 760px)");
const viewport = window.visualViewport;
let restingViewportHeight = viewport?.height ?? window.innerHeight;
let replayingBack = false;

function activeTextControl(): HTMLInputElement | HTMLTextAreaElement | null {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
}

function commentsInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("body.notverse-comments-open .replies-drawer input");
}

function keyboardDelta(): number {
  if (!viewport) return 0;
  return Math.max(0, restingViewportHeight - viewport.height);
}

function keyboardLikelyVisible(): boolean {
  return keyboardDelta() > 80;
}

function updateRestingViewportHeight(): void {
  if (!viewport || !mobile.matches) return;
  const input = commentsInput();
  const textControlFocused = Boolean(activeTextControl());

  /* Keyboard recovery is not monotonic on iOS: WebKit may publish one or more
     intermediate heights before the visual viewport returns to its real resting
     size. Never lower the baseline during that animation. A smaller value could
     make Back release the Comments portal several paint frames too early. */
  if (!input && !textControlFocused) {
    restingViewportHeight = Math.max(restingViewportHeight, viewport.height);
    return;
  }

  if (!textControlFocused && viewport.height > restingViewportHeight) {
    restingViewportHeight = viewport.height;
  }
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

async function waitForKeyboardRecovery(timeoutMs = 700): Promise<void> {
  if (!viewport || !keyboardLikelyVisible()) {
    await nextPaint();
    return;
  }

  const started = performance.now();
  let stableFrames = 0;

  await new Promise<void>((resolve) => {
    const check = () => {
      const recovered = viewport.height >= restingViewportHeight - 4;
      stableFrames = recovered ? stableFrames + 1 : 0;
      if (stableFrames >= 2 || performance.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      window.requestAnimationFrame(check);
    };
    window.requestAnimationFrame(check);
  });

  await nextPaint();
}

async function handleCommentsBack(event: MouseEvent): Promise<void> {
  if (replayingBack || !mobile.matches) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>(".mobile-comments-back");
  if (!button || !document.body.classList.contains("notverse-comments-open")) return;

  const input = commentsInput();
  const mustHandoff = Boolean(input && document.activeElement === input) || keyboardLikelyVisible();
  if (!mustHandoff) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  input?.blur();
  await waitForKeyboardRecovery();

  /* Ensure the canonical mobile controller publishes the recovered viewport
     before React removes the Comments portal and reveals Notes/navigation. */
  window.dispatchEvent(new Event("notverse:surface-state-changed"));
  await nextPaint();

  replayingBack = true;
  try {
    button.click();
  } finally {
    replayingBack = false;
  }
}

document.addEventListener("click", (event) => { void handleCommentsBack(event); }, true);
window.visualViewport?.addEventListener("resize", updateRestingViewportHeight, { passive: true });
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    restingViewportHeight = window.visualViewport?.height ?? window.innerHeight;
  }, 250);
}, { passive: true });

updateRestingViewportHeight();
