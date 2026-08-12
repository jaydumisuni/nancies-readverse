/* iOS Safari visualViewport recovery for modal conversation surfaces.
   The app already owns the approved layouts; this module only supplies the
   visible viewport bounds that Safari changes while browser chrome/keyboard
   animate and keeps modal surfaces synchronized through those transitions. */

const mobileViewport = window.matchMedia("(max-width: 760px)");
const rootElement = document.documentElement;

type VisualBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function readVisualBounds(): VisualBounds {
  const viewport = window.visualViewport;
  const top = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
  const left = Math.max(0, Math.round(viewport?.offsetLeft ?? 0));
  const width = Math.max(1, Math.round(viewport?.width ?? window.innerWidth));
  const availableLayoutHeight = Math.max(1, window.innerHeight - top);
  const height = Math.max(
    1,
    Math.min(availableLayoutHeight, Math.round(viewport?.height ?? window.innerHeight)),
  );
  return { top, left, width, height };
}

function setViewportVariables(bounds: VisualBounds): void {
  rootElement.style.setProperty("--notverse-vv-top", `${bounds.top}px`);
  rootElement.style.setProperty("--notverse-vv-left", `${bounds.left}px`);
  rootElement.style.setProperty("--notverse-vv-width", `${bounds.width}px`);
  rootElement.style.setProperty("--notverse-vv-height", `${bounds.height}px`);

  /* Keep the older variables accurate because existing polish layers consume
     them too. */
  rootElement.style.setProperty("--notverse-viewport-top", `${bounds.top}px`);
  rootElement.style.setProperty("--notverse-viewport-height", `${bounds.height}px`);
}

function pinNewestChatMessage(): void {
  const thread = document.querySelector<HTMLElement>(".companion-panel.open .chat-body");
  if (!thread) return;
  requestAnimationFrame(() => {
    thread.scrollTop = Math.max(0, thread.scrollHeight - thread.clientHeight);
  });
}

function syncChatPanel(bounds: VisualBounds): void {
  const panel = document.querySelector<HTMLElement>(".companion-panel.open");
  const nav = document.querySelector<HTMLElement>(".mobile-nav.notverse-mobile-nav");

  if (!panel) {
    nav?.style.removeProperty("display");
    return;
  }

  panel.style.setProperty("position", "fixed", "important");
  panel.style.setProperty("z-index", "7000", "important");
  panel.style.setProperty("top", `${bounds.top}px`, "important");
  panel.style.setProperty("left", `${bounds.left}px`, "important");
  panel.style.setProperty("right", "auto", "important");
  panel.style.setProperty("bottom", "auto", "important");
  panel.style.setProperty("width", `${bounds.width}px`, "important");
  panel.style.setProperty("max-width", `${bounds.width}px`, "important");
  panel.style.setProperty("height", `${bounds.height}px`, "important");
  panel.style.setProperty("max-height", `${bounds.height}px`, "important");
  panel.style.setProperty("transform", "none", "important");

  /* This inline fallback is intentional: the supplied iPhone captures proved
     a class-only hide can lose the race while Safari is moving the viewport. */
  nav?.style.setProperty("display", "none", "important");
  pinNewestChatMessage();
}

function syncReplies(bounds: VisualBounds): void {
  const backdrop = document.querySelector<HTMLElement>(".replies-backdrop");
  const replyInput = document.querySelector<HTMLInputElement>(".replies-drawer input");
  const repliesOpen = Boolean(backdrop);
  const replyFocused = Boolean(replyInput && document.activeElement === replyInput);

  document.body.classList.toggle("notverse-replies-open", repliesOpen);
  document.body.classList.toggle("notverse-replies-keyboard", repliesOpen && replyFocused);

  if (!backdrop) return;

  backdrop.style.setProperty("top", `${bounds.top}px`, "important");
  backdrop.style.setProperty("left", `${bounds.left}px`, "important");
  backdrop.style.setProperty("width", `${bounds.width}px`, "important");
}

function syncVisibleViewport(): void {
  if (!mobileViewport.matches) {
    document.body.classList.remove("notverse-replies-open", "notverse-replies-keyboard");
    document.querySelector<HTMLElement>(".mobile-nav.notverse-mobile-nav")?.style.removeProperty("display");
    return;
  }

  const bounds = readVisualBounds();
  setViewportVariables(bounds);
  syncChatPanel(bounds);
  syncReplies(bounds);
}

function settleVisibleViewport(): void {
  syncVisibleViewport();
  for (const delay of [40, 100, 180, 320, 520, 800]) {
    window.setTimeout(syncVisibleViewport, delay);
  }
}

const host = document.getElementById("root") || document.body;
const observer = new MutationObserver(syncVisibleViewport);
observer.observe(host, {
  attributes: true,
  attributeFilter: ["class"],
  childList: true,
  subtree: true,
});

window.addEventListener("resize", settleVisibleViewport, { passive: true });
window.addEventListener("orientationchange", settleVisibleViewport, { passive: true });
window.visualViewport?.addEventListener("resize", settleVisibleViewport, { passive: true });
window.visualViewport?.addEventListener("scroll", settleVisibleViewport, { passive: true });

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".companion-panel.open .chat-input, .replies-drawer")) {
    settleVisibleViewport();
  }
}, true);

document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".companion-panel.open .chat-input, .replies-drawer")) {
    settleVisibleViewport();
  }
}, true);

syncVisibleViewport();
