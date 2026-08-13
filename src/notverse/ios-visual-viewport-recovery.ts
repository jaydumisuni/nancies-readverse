export {};

/* iOS Safari visual viewport recovery for modal conversation surfaces.
   Fixed overlays stay anchored to the layout viewport origin while their
   height follows the visual viewport. Safari is allowed to pan its visual
   viewport for focused controls without the app applying that offset twice. */

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
  const width = Math.max(
    1,
    Math.min(window.innerWidth, Math.round(viewport?.width ?? window.innerWidth)),
  );
  const height = Math.max(
    1,
    Math.min(window.innerHeight, Math.round(viewport?.height ?? window.innerHeight)),
  );

  /* A fixed overlay is already positioned in layout-viewport coordinates.
     Adding visualViewport.offsetTop/offsetLeft here double-applies Safari's
     native focus pan and was the real-iPhone failure mode. */
  return { top: 0, left: 0, width, height };
}

function setViewportVariables(bounds: VisualBounds): void {
  rootElement.style.setProperty("--notverse-vv-top", "0px");
  rootElement.style.setProperty("--notverse-vv-left", "0px");
  rootElement.style.setProperty("--notverse-vv-width", `${bounds.width}px`);
  rootElement.style.setProperty("--notverse-vv-height", `${bounds.height}px`);

  /* Keep the older variables accurate because existing polish layers consume
     them too. */
  rootElement.style.setProperty("--notverse-viewport-top", "0px");
  rootElement.style.setProperty("--notverse-viewport-height", `${bounds.height}px`);
}

function resizeVisibleChatEditor(bounds: VisualBounds): void {
  const editor = document.querySelector<HTMLTextAreaElement>(
    ".companion-panel.open textarea.chat-composer-editor",
  );
  if (!editor) return;

  /* production-polish.css historically promoted every non-empty draft to
     42dvh with !important. Neutralise that rule before measuring content, then
     cap the editor by both content and the currently visible viewport. */
  editor.style.setProperty("height", "auto", "important");
  editor.style.setProperty("max-height", "none", "important");
  const contentHeight = editor.scrollHeight;
  const cap = Math.min(124, Math.max(72, Math.floor(bounds.height * 0.22)));
  const next = Math.max(44, Math.min(contentHeight, cap));

  editor.style.setProperty("height", `${next}px`, "important");
  editor.style.setProperty("max-height", `${cap}px`, "important");
  editor.style.setProperty(
    "overflow-y",
    contentHeight > cap ? "auto" : "hidden",
    "important",
  );
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
  panel.style.setProperty("top", "0px", "important");
  panel.style.setProperty("left", "0px", "important");
  panel.style.setProperty("right", "auto", "important");
  panel.style.setProperty("bottom", "auto", "important");
  panel.style.setProperty("width", `${bounds.width}px`, "important");
  panel.style.setProperty("max-width", `${bounds.width}px`, "important");
  panel.style.setProperty("height", `${bounds.height}px`, "important");
  panel.style.setProperty("max-height", `${bounds.height}px`, "important");
  panel.style.setProperty("transform", "none", "important");

  /* Inline fallback remains intentional because Safari can repaint app chrome
     while the keyboard animates. */
  nav?.style.setProperty("display", "none", "important");
  resizeVisibleChatEditor(bounds);
}

function syncReplies(bounds: VisualBounds): void {
  const backdrop = document.querySelector<HTMLElement>(".replies-backdrop");
  const replyInput = document.querySelector<HTMLInputElement>(".replies-drawer input");
  const repliesOpen = Boolean(backdrop);
  const replyFocused = Boolean(replyInput && document.activeElement === replyInput);

  document.body.classList.toggle("notverse-replies-open", repliesOpen);
  document.body.classList.toggle("notverse-replies-keyboard", repliesOpen && replyFocused);

  if (!backdrop) return;

  backdrop.style.setProperty("top", "0px", "important");
  backdrop.style.setProperty("left", "0px", "important");
  backdrop.style.setProperty("width", `${bounds.width}px`, "important");
}

function clearRecoveryOverrides(): void {
  const panel = document.querySelector<HTMLElement>(".companion-panel.open");
  for (const property of [
    "position",
    "z-index",
    "top",
    "left",
    "right",
    "bottom",
    "width",
    "max-width",
    "height",
    "max-height",
    "transform",
  ]) {
    panel?.style.removeProperty(property);
  }

  const backdrop = document.querySelector<HTMLElement>(".replies-backdrop");
  for (const property of ["top", "left", "width"]) {
    backdrop?.style.removeProperty(property);
  }
}

function syncVisibleViewport(): void {
  if (!mobileViewport.matches) {
    clearRecoveryOverrides();
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

/* Do not follow visualViewport.scroll. On iOS that event is the browser's
   native focus pan; repositioning a fixed overlay from that offset creates the
   double-pan seen in the supplied real-device recording. */

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

/* The legacy composer enhancer runs on the textarea itself. This bubbling
   listener executes afterwards and restores the content-driven !important
   height, so the old 42dvh CSS rule can never win after an edit. */
document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.matches(".companion-panel.open textarea.chat-composer-editor")) return;
  resizeVisibleChatEditor(readVisualBounds());
});

syncVisibleViewport();
