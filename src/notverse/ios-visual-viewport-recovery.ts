export {};

/* iOS Safari visual viewport recovery for mobile conversation surfaces.
   Fixed surfaces stay at the layout-viewport origin, but their bottom edge
   tracks visualViewport.offsetTop + visualViewport.height. This preserves
   Safari's native focus pan without turning offsetTop into a dead gap below
   the composer. */

const mobileViewport = window.matchMedia("(max-width: 760px)");
const rootElement = document.documentElement;

type VisualBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
  visibleHeight: number;
  bottom: number;
  keyboardInset: number;
};

function readVisualBounds(): VisualBounds {
  const viewport = window.visualViewport;
  const layoutWidth = Math.max(1, window.innerWidth);
  const layoutHeight = Math.max(1, window.innerHeight);
  const top = Math.max(
    0,
    Math.min(layoutHeight - 1, Math.round(viewport?.offsetTop ?? 0)),
  );
  const left = Math.max(
    0,
    Math.min(layoutWidth - 1, Math.round(viewport?.offsetLeft ?? 0)),
  );
  const visibleWidth = Math.max(
    1,
    Math.min(layoutWidth, Math.round(viewport?.width ?? layoutWidth)),
  );
  const visibleHeight = Math.max(
    1,
    Math.min(layoutHeight, Math.round(viewport?.height ?? layoutHeight)),
  );
  const right = Math.max(1, Math.min(layoutWidth, left + visibleWidth));
  const bottom = Math.max(1, Math.min(layoutHeight, top + visibleHeight));

  /* The fixed surface stays at top:0/left:0. Therefore its width/height are
     the visible right/bottom coordinates, not visualViewport.width/height
     alone. This is the key distinction when Safari pans the visual viewport. */
  return {
    top: 0,
    left: 0,
    width: right,
    height: bottom,
    visibleHeight,
    bottom,
    keyboardInset: Math.max(0, layoutHeight - bottom),
  };
}

function setViewportVariables(bounds: VisualBounds): void {
  rootElement.style.setProperty("--notverse-vv-top", "0px");
  rootElement.style.setProperty("--notverse-vv-left", "0px");
  rootElement.style.setProperty("--notverse-vv-width", `${bounds.width}px`);
  rootElement.style.setProperty("--notverse-vv-height", `${bounds.height}px`);
  rootElement.style.setProperty("--notverse-vv-visible-height", `${bounds.visibleHeight}px`);
  rootElement.style.setProperty("--notverse-vv-bottom", `${bounds.bottom}px`);
  rootElement.style.setProperty("--notverse-keyboard-inset", `${bounds.keyboardInset}px`);

  /* Older polish layers consume these variables too. Keep them aligned with
     the same surface geometry so no earlier rule reintroduces the gap. */
  rootElement.style.setProperty("--notverse-viewport-top", "0px");
  rootElement.style.setProperty("--notverse-viewport-height", `${bounds.height}px`);
}

function resizeVisibleChatEditor(bounds: VisualBounds): void {
  const editor = document.querySelector<HTMLTextAreaElement>(
    ".companion-panel.open textarea.chat-composer-editor",
  );
  if (!editor) return;

  editor.style.setProperty("height", "auto", "important");
  editor.style.setProperty("max-height", "none", "important");
  const contentHeight = editor.scrollHeight;
  const cap = Math.min(
    124,
    Math.max(72, Math.floor(bounds.visibleHeight * 0.22)),
  );
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
  backdrop.style.setProperty("height", `${bounds.height}px`, "important");
}

function syncInbox(bounds: VisualBounds): void {
  const inbox = document.querySelector<HTMLElement>(".inbox-view");
  const input = document.querySelector<HTMLInputElement>(
    ".inbox-layout main > form input",
  );
  const editing = Boolean(inbox && input && document.activeElement === input);
  document.body.classList.toggle("notverse-inbox-keyboard", editing);

  if (!editing) return;

  inbox?.style.setProperty("width", `${bounds.width}px`, "important");
  inbox?.style.setProperty("height", `${bounds.height}px`, "important");
  inbox?.style.setProperty("max-height", `${bounds.height}px`, "important");
}

function syncKeyboardState(bounds: VisualBounds): void {
  const active = document.activeElement;
  const ownsComposer = active instanceof Element && Boolean(
    active.closest(
      ".companion-panel.open .chat-input, .replies-drawer, .inbox-layout main > form",
    ),
  );
  document.body.classList.toggle(
    "notverse-keyboard-open",
    ownsComposer && bounds.keyboardInset >= 48,
  );
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
  for (const property of ["top", "left", "width", "height"]) {
    backdrop?.style.removeProperty(property);
  }

  const inbox = document.querySelector<HTMLElement>(".inbox-view");
  for (const property of ["width", "height", "max-height"]) {
    inbox?.style.removeProperty(property);
  }
}

function syncVisibleViewport(): void {
  if (!mobileViewport.matches) {
    clearRecoveryOverrides();
    document.body.classList.remove(
      "notverse-replies-open",
      "notverse-replies-keyboard",
      "notverse-inbox-keyboard",
      "notverse-keyboard-open",
    );
    document.querySelector<HTMLElement>(
      ".mobile-nav.notverse-mobile-nav",
    )?.style.removeProperty("display");
    return;
  }

  const bounds = readVisualBounds();
  setViewportVariables(bounds);
  syncKeyboardState(bounds);
  syncChatPanel(bounds);
  syncReplies(bounds);
  syncInbox(bounds);
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

/* visualViewport.scroll is Safari's native focus pan. Do not move the surface
   top to offsetTop. We only use offsetTop when deriving the visible bottom. */
window.visualViewport?.addEventListener("scroll", settleVisibleViewport, { passive: true });

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(
    ".companion-panel.open .chat-input, .replies-drawer, .inbox-layout main > form",
  )) {
    settleVisibleViewport();
  }
}, true);

document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(
    ".companion-panel.open .chat-input, .replies-drawer, .inbox-layout main > form",
  )) {
    settleVisibleViewport();
  }
}, true);

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.matches(
    ".companion-panel.open textarea.chat-composer-editor",
  )) return;
  resizeVisibleChatEditor(readVisualBounds());
});

syncVisibleViewport();
