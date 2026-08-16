export {};

/*
 * Mobile surface authority.
 *
 * The previous controller tried to correct Safari focus-pan by repeatedly
 * transforming already-fixed surfaces. On a real iPhone that created a second
 * geometry owner: Safari moved the visual viewport while this controller moved
 * Chat/Comments again, exposing Home and pushing composers off-screen.
 *
 * This controller only publishes the browser's visual viewport dimensions and
 * open-surface state. CSS owns layout. No surface receives an inline transform,
 * top/left correction, or synthetic width from JavaScript.
 */

const mobileViewport = window.matchMedia("(max-width: 760px)");
const root = document.documentElement;
const body = document.body;

const SURFACE_SELECTOR = [
  ".companion-panel.open",
  ".replies-backdrop",
  ".activity-backdrop",
  ".note-modal-backdrop",
].join(",");

function clearLegacyInlineGeometry(node: Element | null) {
  if (!(node instanceof HTMLElement)) return;
  for (const property of [
    "position",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "width",
    "maxWidth",
    "height",
    "maxHeight",
    "transform",
    "translate",
  ] as const) {
    node.style.removeProperty(property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`));
  }
}

function publishViewport() {
  if (!mobileViewport.matches) {
    root.style.removeProperty("--notverse-mobile-vv-top");
    root.style.removeProperty("--notverse-mobile-vv-left");
    root.style.removeProperty("--notverse-mobile-vv-width");
    root.style.removeProperty("--notverse-mobile-vv-height");
    return;
  }

  const viewport = window.visualViewport;
  const top = Math.max(0, viewport?.offsetTop ?? 0);
  const left = Math.max(0, viewport?.offsetLeft ?? 0);
  const width = Math.max(1, Math.min(viewport?.width ?? window.innerWidth, window.innerWidth));
  const height = Math.max(1, Math.min(viewport?.height ?? window.innerHeight, window.innerHeight));

  root.style.setProperty("--notverse-mobile-vv-top", `${top}px`);
  root.style.setProperty("--notverse-mobile-vv-left", `${left}px`);
  root.style.setProperty("--notverse-mobile-vv-width", `${width}px`);
  root.style.setProperty("--notverse-mobile-vv-height", `${height}px`);
}

function setMobileNavBlocked(blocked: boolean) {
  const nav = document.querySelector<HTMLElement>(".mobile-nav.notverse-mobile-nav");
  if (!nav) return;
  if (blocked) {
    nav.setAttribute("inert", "");
    nav.setAttribute("aria-hidden", "true");
    return;
  }
  nav.removeAttribute("inert");
  nav.removeAttribute("aria-hidden");
}

function syncSurfaceState() {
  if (!mobileViewport.matches) {
    for (const className of [
      "notverse-chat-open",
      "notverse-comments-open",
      "notverse-replies-open",
      "notverse-activity-open",
      "notverse-mobile-surface-open",
    ]) body.classList.remove(className);
    setMobileNavBlocked(false);
    publishViewport();
    return;
  }

  const chat = document.querySelector<HTMLElement>(".companion-panel.open");
  const commentsBackdrop = document.querySelector<HTMLElement>(".replies-backdrop");
  const comments = document.querySelector<HTMLElement>(".replies-drawer");
  const activity = document.querySelector<HTMLElement>(".activity-backdrop");

  const chatOpen = Boolean(chat);
  const commentsOpen = Boolean(commentsBackdrop && comments);
  const activityOpen = Boolean(activity);
  const inboxThreadOpen = body.classList.contains("notverse-inbox-thread-open");
  const mobileSurfaceOpen = chatOpen || commentsOpen || activityOpen || inboxThreadOpen;

  body.classList.toggle("notverse-chat-open", chatOpen);
  body.classList.toggle("notverse-comments-open", commentsOpen);
  // Kept only for compatibility with older selectors while user-facing copy is Comment.
  body.classList.toggle("notverse-replies-open", commentsOpen);
  body.classList.toggle("notverse-activity-open", activityOpen);
  body.classList.toggle("notverse-mobile-surface-open", mobileSurfaceOpen);
  setMobileNavBlocked(mobileSurfaceOpen);

  clearLegacyInlineGeometry(chat);
  clearLegacyInlineGeometry(commentsBackdrop);
  clearLegacyInlineGeometry(comments);
  clearLegacyInlineGeometry(activity);
  publishViewport();
}

let scheduled = 0;
function scheduleSync() {
  if (scheduled) return;
  scheduled = window.requestAnimationFrame(() => {
    scheduled = 0;
    syncSurfaceState();
  });
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["class"],
});

window.addEventListener("resize", scheduleSync, { passive: true });
window.addEventListener("orientationchange", scheduleSync, { passive: true });
window.addEventListener("focusin", scheduleSync, true);
window.addEventListener("focusout", scheduleSync, true);
window.addEventListener("notverse:surface-state-changed", syncSurfaceState);
mobileViewport.addEventListener("change", scheduleSync);
window.visualViewport?.addEventListener("resize", scheduleSync, { passive: true });
window.visualViewport?.addEventListener("scroll", scheduleSync, { passive: true });

syncSurfaceState();
