export {};

/*
 * Real-device mobile viewport controller.
 *
 * iOS can pan the rendered document when the software keyboard opens even
 * while scrollTop remains zero. visualViewport.offsetTop can also be stale for
 * the first frames of that transition. Do not chase offsetTop. Instead:
 *   1. size conversation surfaces to visualViewport.height;
 *   2. keep their layout width locked to the device viewport;
 *   3. measure the surface's actual rendered rect and compensate browser pan;
 *   4. let only the message history scroll.
 */

const mobileViewport = window.matchMedia("(max-width: 760px)");
const rootElement = document.documentElement;

type Correction = { x: number; y: number };
const corrections = new WeakMap<HTMLElement, Correction>();

let settleFrame = 0;
let settleUntil = 0;

function layoutWidth(): number {
  return Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth));
}

function layoutHeight(): number {
  return Math.max(1, Math.round(window.innerHeight));
}

function visibleHeight(): number {
  const viewportHeight = Math.round(window.visualViewport?.height || window.innerHeight);
  return Math.max(1, Math.min(layoutHeight(), viewportHeight));
}

function writeViewportVariables(height: number): void {
  const width = layoutWidth();
  rootElement.style.setProperty("--notverse-vv-top", "0px");
  rootElement.style.setProperty("--notverse-vv-left", "0px");
  rootElement.style.setProperty("--notverse-vv-width", `${width}px`);
  rootElement.style.setProperty("--notverse-vv-height", `${height}px`);
  rootElement.style.setProperty("--notverse-vv-visible-height", `${height}px`);
  rootElement.style.setProperty("--notverse-vv-bottom", `${height}px`);
  rootElement.style.setProperty("--notverse-viewport-top", "0px");
  rootElement.style.setProperty("--notverse-viewport-height", `${height}px`);
}

function setSurfaceTransform(surface: HTMLElement, correction: Correction): void {
  surface.style.setProperty(
    "transform",
    `translate3d(${correction.x.toFixed(2)}px, ${correction.y.toFixed(2)}px, 0)`,
    "important",
  );
}

function anchorRenderedSurface(surface: HTMLElement): void {
  if (!surface.isConnected) return;

  let correction = corrections.get(surface) || { x: 0, y: 0 };

  /* getBoundingClientRect() forces the layout transform to be resolved now.
     Correct the measured render in the same JavaScript turn so Safari never
     needs a later viewport event to finish anchoring the composer. */
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rect = surface.getBoundingClientRect();
    const deltaX = Math.abs(rect.left) > 0.25 ? -rect.left : 0;
    const deltaY = Math.abs(rect.top) > 0.25 ? -rect.top : 0;
    if (!deltaX && !deltaY) break;

    correction = {
      x: Math.max(-240, Math.min(240, correction.x + deltaX)),
      y: Math.max(-320, Math.min(320, correction.y + deltaY)),
    };
    corrections.set(surface, correction);
    setSurfaceTransform(surface, correction);
  }
}

function prepareSurface(surface: HTMLElement, height: number): void {
  const width = layoutWidth();
  surface.style.setProperty("position", "fixed", "important");
  surface.style.setProperty("top", "0px", "important");
  surface.style.setProperty("left", "0px", "important");
  surface.style.setProperty("right", "auto", "important");
  surface.style.setProperty("bottom", "auto", "important");
  surface.style.setProperty("width", `${width}px`, "important");
  surface.style.setProperty("max-width", `${width}px`, "important");
  surface.style.setProperty("height", `${height}px`, "important");
  surface.style.setProperty("max-height", `${height}px`, "important");
  surface.style.setProperty("overflow", "hidden", "important");

  const correction = corrections.get(surface) || { x: 0, y: 0 };
  corrections.set(surface, correction);
  setSurfaceTransform(surface, correction);
  anchorRenderedSurface(surface);
}

function clearSurface(surface: HTMLElement | null): void {
  if (!surface) return;
  corrections.delete(surface);
  for (const property of [
    "position",
    "top",
    "left",
    "right",
    "bottom",
    "width",
    "max-width",
    "height",
    "max-height",
    "overflow",
    "transform",
  ]) {
    surface.style.removeProperty(property);
  }
}

function activeOwner(): "chat" | "replies" | "inbox" | null {
  const active = document.activeElement;
  if (!(active instanceof Element)) return null;
  if (active.closest(".companion-panel.open .chat-input")) return "chat";
  if (active.closest(".replies-drawer")) return "replies";
  if (active.closest(".inbox-layout main > form")) return "inbox";
  return null;
}

function pinEnd(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
}

function syncChat(height: number): void {
  const panel = document.querySelector<HTMLElement>(".companion-panel.open");
  const nav = document.querySelector<HTMLElement>(".mobile-nav.notverse-mobile-nav");
  if (!panel) {
    nav?.style.removeProperty("display");
    return;
  }
  panel.style.setProperty("z-index", "7000", "important");
  prepareSurface(panel, height);
  nav?.style.setProperty("display", "none", "important");
  pinEnd(".companion-panel.open .chat-body");
}

function syncReplies(height: number): void {
  const backdrop = document.querySelector<HTMLElement>(".replies-backdrop");
  const input = document.querySelector<HTMLInputElement>(".replies-drawer input");
  const open = Boolean(backdrop);
  const focused = Boolean(input && document.activeElement === input);

  document.body.classList.toggle("notverse-replies-open", open);
  document.body.classList.toggle("notverse-replies-keyboard", open && focused);
  if (!backdrop) return;

  backdrop.style.setProperty("z-index", "4000", "important");
  prepareSurface(backdrop, height);
  if (focused) pinEnd(".replies-list");
}

function syncInbox(height: number): void {
  const input = document.querySelector<HTMLInputElement>(".inbox-layout main > form input");
  const focused = Boolean(input && document.activeElement === input);
  document.body.classList.toggle("notverse-inbox-keyboard", focused);

  const shell = document.querySelector<HTMLElement>(".main-shell.notverse-shell");
  if (!focused || !shell) {
    if (!focused) clearSurface(shell);
    return;
  }

  prepareSurface(shell, height);
  pinEnd(".inbox-layout .message-thread");
}

function syncKeyboardClass(height: number): void {
  const ownsComposer = activeOwner() !== null;
  const inset = Math.max(0, layoutHeight() - height);
  document.body.classList.toggle("notverse-keyboard-open", ownsComposer && inset >= 48);
}

function sync(): void {
  if (!mobileViewport.matches) {
    document.body.classList.remove(
      "notverse-replies-open",
      "notverse-replies-keyboard",
      "notverse-inbox-keyboard",
      "notverse-keyboard-open",
    );
    clearSurface(document.querySelector<HTMLElement>(".companion-panel.open"));
    clearSurface(document.querySelector<HTMLElement>(".replies-backdrop"));
    clearSurface(document.querySelector<HTMLElement>(".main-shell.notverse-shell"));
    document.querySelector<HTMLElement>(".mobile-nav.notverse-mobile-nav")?.style.removeProperty("display");
    return;
  }

  const height = visibleHeight();
  writeViewportVariables(height);
  syncKeyboardClass(height);
  syncChat(height);
  syncReplies(height);
  syncInbox(height);
}

function settleLoop(): void {
  settleFrame = 0;
  sync();
  if (performance.now() < settleUntil) {
    settleFrame = window.requestAnimationFrame(settleLoop);
  }
}

function settle(duration = 650): void {
  sync();
  settleUntil = Math.max(settleUntil, performance.now() + duration);
  if (!settleFrame) settleFrame = window.requestAnimationFrame(settleLoop);
}

const host = document.getElementById("root") || document.body;
const observer = new MutationObserver(() => settle(220));
observer.observe(host, {
  attributes: true,
  attributeFilter: ["class"],
  childList: true,
  subtree: true,
});

window.addEventListener("resize", () => settle(800), { passive: true });
window.addEventListener("orientationchange", () => settle(900), { passive: true });
window.visualViewport?.addEventListener("resize", () => settle(800), { passive: true });
window.visualViewport?.addEventListener("scroll", () => settle(800), { passive: true });

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".companion-panel.open .chat-input, .replies-drawer, .inbox-layout main > form")) {
    settle(1100);
  }
}, true);

document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".companion-panel.open .chat-input, .replies-drawer, .inbox-layout main > form")) {
    settle(850);
  }
}, true);

sync();
