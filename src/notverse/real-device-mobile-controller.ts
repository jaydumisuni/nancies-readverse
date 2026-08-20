export {};

/*
 * Single viewport/state authority.
 *
 * CSS owns geometry. On phones this controller publishes visualViewport metrics
 * and all mobile surface classes. Above the phone breakpoint it preserves only
 * the legacy root Chat/Notes compatibility classes that adaptive desktop CSS
 * consumes; body-level mobile locks are always cleared. It never transforms
 * surfaces or fixes body scroll position.
 *
 * Safari note: fixed mobile surfaces stay anchored at the layout-viewport
 * origin. Their bottom edge follows visualViewport.offsetTop +
 * visualViewport.height. Safari also animates its keyboard/browser chrome over
 * several frames, so viewport values are re-sampled briefly after relevant
 * resize/scroll/focus transitions instead of freezing the first intermediate
 * measurement.
 *
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
  const layoutWidth = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
  const layoutHeight = Math.max(1, window.innerHeight);
  const visualTop = Math.max(
    0,
    Math.min(layoutHeight - 1, Math.round(viewport?.offsetTop ?? 0)),
  );
  const visualHeight = Math.max(
    1,
    Math.min(layoutHeight, Math.round(viewport?.height ?? layoutHeight)),
  );
  const visibleBottom = Math.max(
    1,
    Math.min(layoutHeight, visualTop + visualHeight),
  );

  /* Fixed mobile surfaces remain at layout top:0. Their height is the current
     visible bottom coordinate. This preserves Safari's native focus pan while
     keeping the composer above the keyboard/browser chrome. */
  root.style.setProperty("--notverse-mobile-vv-top", "0px");
  root.style.setProperty("--notverse-mobile-vv-left", "0px");
  root.style.setProperty("--notverse-mobile-vv-width", `${layoutWidth}px`);
  root.style.setProperty("--notverse-mobile-vv-height", `${visibleBottom}px`);

  /* Compatibility metrics for older adaptive CSS resolve from the same single
     measurement authority. */
  root.style.setProperty("--notverse-viewport-top", "0px");
  root.style.setProperty("--notverse-viewport-height", `${visibleBottom}px`);
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

function syncDesktopCompatibilityState() {
  const chatOpen = Boolean(document.querySelector(".companion-panel.open"));
  const notesOpen = Boolean(document.querySelector(".notes-experience"));

  /* The pre-consolidation runtime left these two compatibility states on the
     root at desktop widths while the mobile controller removed body locks. Keep
     that effective contract without retaining two JS state publishers. */
  for (const className of STATE_CLASSES) body.classList.remove(className);
  root.classList.toggle("notverse-chat-open", chatOpen);
  root.classList.toggle("notverse-notes-open", notesOpen);
  for (const className of [
    "notverse-comments-open",
    "notverse-replies-open",
    "notverse-activity-open",
    "notverse-mobile-surface-open",
  ] as const) root.classList.remove(className);

  setMobileNavBlocked(false);
  clearViewportMetrics();
}

function syncSurfaceState() {
  if (!mobileViewport.matches) {
    syncDesktopCompatibilityState();
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

let settleFrame = 0;
let settleUntil = 0;

function settleFrameLoop() {
  settleFrame = 0;
  syncSurfaceState();
  if (performance.now() < settleUntil) {
    settleFrame = window.requestAnimationFrame(settleFrameLoop);
  }
}

function settleSync(duration = 520) {
  syncSurfaceState();
  settleUntil = Math.max(settleUntil, performance.now() + duration);
  if (!settleFrame) settleFrame = window.requestAnimationFrame(settleFrameLoop);
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["class"],
});

window.addEventListener("resize", () => settleSync(520), { passive: true });
window.addEventListener("orientationchange", () => settleSync(700), { passive: true });
window.addEventListener("focusin", () => settleSync(900), true);
window.addEventListener("focusout", () => settleSync(700), true);
window.addEventListener("notverse:surface-state-changed", () => settleSync(520));
mobileViewport.addEventListener("change", () => settleSync(520));
window.visualViewport?.addEventListener("resize", () => settleSync(520), { passive: true });
window.visualViewport?.addEventListener("scroll", () => settleSync(520), { passive: true });

syncSurfaceState();
