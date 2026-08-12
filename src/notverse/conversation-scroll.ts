/* Keep the newest conversation content visible while message bubbles settle.
   This is deliberately scoped to conversation scroll regions; it does not
   change NoTVerse layout, message rendering or navigation. */

type TrackedThread = {
  count: number;
  forceUntil: number;
  resizeObserver?: ResizeObserver;
  lastObserved?: Element | null;
};

const tracked = new WeakMap<HTMLElement, TrackedThread>();

function getVisibleItems(thread: HTMLElement, selector?: string): HTMLElement[] {
  const nodes = selector ? [...thread.querySelectorAll(selector)] : [...thread.children];
  return nodes.filter((node): node is HTMLElement => {
    if (!(node instanceof HTMLElement)) return false;
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
  });
}

function pinToEnd(thread: HTMLElement): void {
  const pin = () => {
    thread.scrollTop = Math.max(0, thread.scrollHeight - thread.clientHeight);
  };
  requestAnimationFrame(pin);
  for (const delay of [40, 100, 180, 320, 520, 800]) window.setTimeout(pin, delay);
}

function watchLastItem(thread: HTMLElement, state: TrackedThread, item: Element | null): void {
  if (state.lastObserved === item) return;
  state.resizeObserver?.disconnect();
  state.lastObserved = item;
  if (!item || typeof ResizeObserver === "undefined") return;
  state.resizeObserver = new ResizeObserver(() => {
    if (Date.now() <= state.forceUntil) pinToEnd(thread);
  });
  state.resizeObserver.observe(item);
}

function updateThread(thread: HTMLElement, selector?: string): void {
  const items = getVisibleItems(thread, selector);
  const count = items.length;
  const state = tracked.get(thread) || { count: 0, forceUntil: 0 };
  const newest = items.at(-1) || null;
  const newMessage = count > state.count;

  if (newMessage) {
    state.forceUntil = Date.now() + 1200;
    pinToEnd(thread);
  }

  watchLastItem(thread, state, newest);
  state.count = count;
  tracked.set(thread, state);

  if (Date.now() <= state.forceUntil) pinToEnd(thread);
}

function forceConversationEnd(form: Element): void {
  const panel = form.closest(".companion-panel.open");
  const thread = panel?.querySelector<HTMLElement>(".chat-body")
    || form.closest(".inbox-layout")?.querySelector<HTMLElement>(".message-thread");
  if (!thread) return;
  const state = tracked.get(thread) || { count: 0, forceUntil: 0 };
  state.forceUntil = Date.now() + 1400;
  tracked.set(thread, state);
  pinToEnd(thread);
}

function refreshConversations(): void {
  const chat = document.querySelector<HTMLElement>(".companion-panel.open .chat-body");
  if (chat) updateThread(chat, ".message-row");

  const inbox = document.querySelector<HTMLElement>(".inbox-layout .message-thread");
  if (inbox) updateThread(inbox);
}

function startConversationScrollRecovery(): void {
  const root = document.getElementById("root") || document.body;
  const observer = new MutationObserver(refreshConversations);
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.matches(".companion-panel.open .chat-input, .inbox-layout main > form")) {
      forceConversationEnd(form);
    }
  }, true);

  window.addEventListener("resize", refreshConversations, { passive: true });
  window.visualViewport?.addEventListener("resize", refreshConversations, { passive: true });
  refreshConversations();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startConversationScrollRecovery, { once: true });
} else {
  startConversationScrollRecovery();
}
