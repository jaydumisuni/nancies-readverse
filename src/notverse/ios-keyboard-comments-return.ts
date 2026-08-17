export {};

/*
 * Mobile Comments follows the same physical application tree as Inbox.
 *
 * React still owns the Comments state. On phones only, move the portal root
 * from document.body into the existing NoTVerse main shell while it is open.
 * Before React closes the portal, put that root back in document.body so the
 * portal unmounts from its canonical container. This removes the separate body
 * compositor tree from the iOS keyboard cycle without changing desktop layout.
 *
 * The old Comments Send pointer-down handler deliberately prevented focus from
 * leaving the input. Inbox does not do that. Stop only that pointer-down React
 * handler at the Send button itself; the normal click still submits the reply
 * and the browser keeps its native focus/keyboard behavior.
 */

const mobile = window.matchMedia("(max-width: 760px)");
let scheduled = 0;

function commentsRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".replies-backdrop");
}

function notesHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".main-shell.notverse-shell");
}

function neutraliseSendPointerDown(root: HTMLElement): void {
  const button = root.querySelector<HTMLButtonElement>(".replies-drawer > form > button");
  if (!button || button.dataset.notverseInboxParity === "true") return;

  button.dataset.notverseInboxParity = "true";
  button.addEventListener("pointerdown", (event) => {
    /* Do not preventDefault: native focus/keyboard behavior must match Inbox.
       Stop propagation so React's delegated onPointerDown submit handler does
       not run. The existing onClick still performs the single submit. */
    event.stopPropagation();
  }, true);
}

function hostCommentsInsideApp(): void {
  if (!mobile.matches) return;
  const root = commentsRoot();
  const host = notesHost();
  if (!root || !host) return;

  neutraliseSendPointerDown(root);

  if (root.parentElement === host) return;
  host.appendChild(root);
  root.dataset.notverseMobileHost = "main-shell";
  window.dispatchEvent(new Event("notverse:surface-state-changed"));
}

function restorePortalContainer(): void {
  const root = commentsRoot();
  if (!root || root.parentElement === document.body) return;
  document.body.appendChild(root);
  delete root.dataset.notverseMobileHost;
}

function scheduleHost(): void {
  if (scheduled) return;
  scheduled = window.requestAnimationFrame(() => {
    scheduled = 0;
    hostCommentsInsideApp();
  });
}

/* Restore the portal to its React container synchronously before the existing
 * React onClick closes it. No wait/replay/visualViewport interception. */
document.addEventListener("click", (event) => {
  if (!mobile.matches) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".mobile-comments-back, .comments-close-desktop")) return;
  restorePortalContainer();
}, true);

const observer = new MutationObserver(scheduleHost);
observer.observe(document.body, { subtree: true, childList: true });

mobile.addEventListener("change", () => {
  if (!mobile.matches) restorePortalContainer();
  else scheduleHost();
});

window.addEventListener("pagehide", restorePortalContainer, { passive: true });
window.addEventListener("notverse:surface-state-changed", scheduleHost);

scheduleHost();

/* Production deploy marker: 2026-08-17 structural Inbox parity. */
