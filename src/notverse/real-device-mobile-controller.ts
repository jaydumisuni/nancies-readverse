export {};

/*
 * Single mobile viewport/state authority.
 *
 * CSS owns geometry. This controller publishes visualViewport metrics and the
 * compatibility state classes consumed by old and new CSS layers. It never
 * transforms surfaces, fixes body scroll position, or chases keyboard offsets.
 * Conversation scroll ownership lives in conversation-scroll.ts.
 */

const mobileViewport = window.matchMedia("(max-width: 760px)");
const root = document.documentElement;
const body = document.body;

const STATE_CLASSES = [
  "notverse-chat-open",
  "notverse-notes-open",
  "notverse-comments-open",
  "notverse-replies-open",
  "notverse-activity-open",
  "notverse-mobile-surface-open",
] as const;

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

function clearViewportMetrics() {
  for (const property of [
    "--notverse-mobile-vv-top",
    "--notverse-mobile-vv-left",
    "--notverse-mobile-vv-width",
    "--notverse-mobile-vv-height",
    "--notverse-viewport-top",
    "--notverse-viewport-height",
  ]) root.style.removeProperty(property);
}

function publishViewport() {
  if (!mobileViewport.matches) {
    clearViewportMetrics();
    return;
  }

  const viewport = window.visualViewport;
  const top = Math.max(0, viewport?.offsetTop ?? 0);
  const left = Math.max(0, viewport?.offsetLeft ?? 0);
  const width = Math.max(1, Math.min(viewport?.width ?? window.innerWidth, window.innerWidth));
  const height = Math.max(1, Math.min(viewport?.height ?? window.innerHeight, window.innerHeight));

  /* New real-device contract. */
  root.style.setProperty("--notverse-mobile-vv-top", `${top}px`);
  root.style.setProperty("--notverse-mobile-vv-left", `${left}px`);
  root.style.setProperty("--notverse-mobile-vv-width", `${width}px`);
  root.style.setProperty("--notverse-mobile-vv-height", `${height}px`);

  /* Compatibility metrics for older adaptive CSS. They intentionally resolve
     from the same browser measurement so there is still only one JS owner. */
  root.style.setProperty("--notverse-viewport-top", `${top}px`);
  root.style.setProperty("--notverse-viewport-height", `${height}px`);
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

function toggleState(className: typeof STATE_CLASSES[number], active: boolean) {
  body.classList.toggle(className, active);
  root.classList.toggle(className, active);
}

function clearState() {
  for (const className of STATE_CLASSES) {
    body.classList.remove(className);
    root.classList.remove(className);
  }
}

function syncSurfaceState() {
  if (!mobileViewport.matches) {
    clearState();
    setMobileNavBlocked(false);
    publishViewport();
    return;
  }

  const chat = document.querySelector<HTMLElement>(".companion-panel.open");
  const notes = document.querySelector<HTMLElement>(".notes-experience");
  const commentsBackdrop = document.querySelector<HTMLElement>(".replies-backdrop");
  const comments = document.querySelector<HTMLElement>(".replies-drawer");
  const activity = document.querySelector<HTMLElement>(".activity-backdrop");

  const chatOpen = Boolean(chat);
  const notesOpen = Boolean(notes);
  const commentsOpen = Boolean(commentsBackdrop && comments);
  const activityOpen = Boolean(activity);
  const inboxThreadOpen = body.classList.contains("notverse-inbox-thread-open");
  const mobileSurfaceOpen = chatOpen || commentsOpen || activityOpen || inboxThreadOpen;

  toggleState("notverse-chat-open", chatOpen);
  toggleState("notverse-notes-open", notesOpen);
  toggleState("notverse-comments-open", commentsOpen);
  // Compatibility alias for older selectors while user-facing copy is Comment.
  toggleState("notverse-replies-open", commentsOpen);
  toggleState("notverse-activity-open", activityOpen);
  toggleState("notverse-mobile-surface-open", mobileSurfaceOpen);
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
