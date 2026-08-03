/* Keep full-screen interaction surfaces anchored to the visible viewport.
   Mobile browsers and focused inputs can pan the layout viewport even while
   the app body is fixed; this guard resets that pan and restores the user's
   previous Home scroll position after the surface closes. */

let restoreScrollY = 0;
let locked = false;
let correcting = false;

function shouldLock(): boolean {
  const body = document.body;
  return body.classList.contains("notverse-chat-open")
    || (body.classList.contains("notverse-notes-open") && window.matchMedia("(max-width: 760px)").matches);
}

function correctScroll(): void {
  if (correcting || window.scrollY === 0) return;
  correcting = true;
  window.scrollTo(0, 0);
  window.requestAnimationFrame(() => { correcting = false; });
}

function synchronise(): void {
  const nextLocked = shouldLock();
  if (nextLocked && !locked) {
    restoreScrollY = window.scrollY;
    locked = true;
  }

  if (nextLocked) {
    document.body.style.setProperty("--notverse-scroll-lock", "0px");
    correctScroll();
    return;
  }

  if (locked) {
    locked = false;
    const target = restoreScrollY;
    window.requestAnimationFrame(() => window.scrollTo(0, target));
  }
}

function initialise(): void {
  const observer = new MutationObserver(synchronise);
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("scroll", synchronise, { passive: true });
  window.visualViewport?.addEventListener("scroll", synchronise, { passive: true });
  window.visualViewport?.addEventListener("resize", synchronise, { passive: true });
  synchronise();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialise, { once: true });
} else {
  initialise();
}
