/* Runtime viewport and conversation recovery for NoTVerse.
   This module preserves the approved React structure while adding reliable
   viewport state classes, mobile composer polish and a catalogue-backed
   recommendation fallback. */

type CompanionRequestBody = {
  question?: unknown;
  companion?: unknown;
  history?: unknown;
};

type DiscoveryCandidate = {
  title?: unknown;
  authors?: unknown;
  year?: unknown;
  description?: unknown;
};

type DiscoveryPayload = {
  candidates?: unknown;
};

const nativeFetch = window.fetch.bind(window);
const rootElement = document.documentElement;
let lockedScrollY = 0;
let viewportLocked = false;
let lastChatMessageCount = 0;
let lastInboxMessageCount = 0;

function viewportHeight(): number {
  return Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight));
}

function applyViewportMetrics(): void {
  rootElement.style.setProperty("--notverse-viewport-height", `${viewportHeight()}px`);
  rootElement.style.setProperty("--notverse-viewport-top", "0px");
}

function setViewportLock(locked: boolean): void {
  const body = document.body;
  if (locked && !viewportLocked) {
    lockedScrollY = window.scrollY;
    body.style.setProperty("--notverse-scroll-lock", `${-lockedScrollY}px`);
    viewportLocked = true;
  } else if (!locked && viewportLocked) {
    body.style.removeProperty("--notverse-scroll-lock");
    viewportLocked = false;
    window.requestAnimationFrame(() => window.scrollTo(0, lockedScrollY));
  }
}

function setReactInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function resizeChatEditor(editor: HTMLTextAreaElement): void {
  /* The composer is a fixed keyboard-edge control. Long drafts scroll inside
     the editor; typing must never resize or push the conversation surface. */
  editor.style.setProperty("height", "44px", "important");
  editor.style.setProperty("min-height", "44px", "important");
  editor.style.setProperty("max-height", "44px", "important");
  editor.style.setProperty("overflow-y", "auto", "important");
}

function enhanceChatComposer(): void {
  const form = document.querySelector<HTMLFormElement>(".companion-panel.open .chat-input");
  const input = form?.querySelector<HTMLInputElement>("input:not(.chat-composer-editor)");
  if (!form || !input) return;

  input.classList.add("chat-input-state-bridge");
  let editor = form.querySelector<HTMLTextAreaElement>("textarea.chat-composer-editor");

  if (!editor) {
    editor = document.createElement("textarea");
    editor.className = "chat-composer-editor";
    editor.rows = 1;
    editor.maxLength = Number(input.maxLength || 1000);
    editor.placeholder = input.placeholder;
    editor.setAttribute("aria-label", input.placeholder || "Message companion");
    editor.setAttribute("enterkeyhint", "send");
    editor.autocapitalize = "sentences";
    editor.spellcheck = true;
    editor.value = input.value;
    form.insertBefore(editor, input);

    const syncEditorFromBridge = () => {
      if (document.activeElement === editor) return;
      if (editor!.value !== input.value) {
        editor!.value = input.value;
        resizeChatEditor(editor!);
      }
    };

    editor.addEventListener("input", () => {
      setReactInputValue(input, editor!.value);
      resizeChatEditor(editor!);
    });

    editor.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      setReactInputValue(input, editor!.value);
      window.requestAnimationFrame(() => {
        const send = form.querySelector<HTMLButtonElement>("button[type=submit]");
        if (!send?.disabled && editor!.value.trim()) {
          form.requestSubmit();
          editor!.value = "";
          resizeChatEditor(editor!);
        }
      });
    });

    input.addEventListener("input", syncEditorFromBridge);
    form.addEventListener("submit", () => {
      window.setTimeout(() => {
        editor!.value = input.value;
        resizeChatEditor(editor!);
      }, 0);
    });
  }

  if (document.activeElement !== editor && editor.value !== input.value) {
    editor.value = input.value;
  }
  resizeChatEditor(editor);
}

function pinConversationEnd(element: HTMLElement): void {
  const pin = () => {
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  };
  window.requestAnimationFrame(pin);
  for (const delay of [70, 180, 420]) {
    window.setTimeout(pin, delay);
  }
}

function keepConversationEndsVisible(): void {
  const chatBody = document.querySelector<HTMLElement>(".companion-panel.open .chat-body");
  if (chatBody) {
    const count = chatBody.querySelectorAll(".message-row").length;
    if (count !== lastChatMessageCount) {
      lastChatMessageCount = count;
      pinConversationEnd(chatBody);
    }
  } else {
    lastChatMessageCount = 0;
  }

  const inboxThread = document.querySelector<HTMLElement>(".inbox-layout .message-thread");
  if (inboxThread) {
    const count = inboxThread.children.length;
    if (count !== lastInboxMessageCount) {
      lastInboxMessageCount = count;
      pinConversationEnd(inboxThread);
    }
  } else {
    lastInboxMessageCount = 0;
  }
}

function syncInteractionState(): void {
  applyViewportMetrics();
  enhanceChatComposer();
  keepConversationEndsVisible();
  const chatOpen = Boolean(document.querySelector(".companion-panel.open"));
  const notesOpen = Boolean(document.querySelector(".notes-experience"));

  for (const element of [rootElement, document.body]) {
    element.classList.toggle("notverse-chat-open", chatOpen);
    element.classList.toggle("notverse-notes-open", notesOpen);
  }

  setViewportLock(chatOpen || (notesOpen && window.matchMedia("(max-width: 760px)").matches));
}

function initialiseViewportObserver(): void {
  applyViewportMetrics();
  const host = document.getElementById("root") || document.body;
  const observer = new MutationObserver(syncInteractionState);
  observer.observe(host, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
  window.addEventListener("resize", syncInteractionState, { passive: true });
  window.addEventListener("orientationchange", syncInteractionState, { passive: true });
  window.addEventListener("scroll", applyViewportMetrics, { passive: true });
  window.visualViewport?.addEventListener("resize", syncInteractionState, { passive: true });
  window.visualViewport?.addEventListener("scroll", applyViewportMetrics, { passive: true });
  syncInteractionState();
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function parseCompanionBody(init?: RequestInit): CompanionRequestBody | null {
  if (typeof init?.body !== "string") return null;
  try {
    const parsed = JSON.parse(init.body) as CompanionRequestBody;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isBookRecommendation(question: string): boolean {
  const hasReadingSubject = /\b(book|books|manga|manhwa|comic|comics|novel|novels|reading|read)\b/i.test(question);
  const asksForChoice = /\b(recommend|recommendation|recommendations|suggest|suggestion|what should i read|something to read|looking for)\b/i.test(question);
  return hasReadingSubject && asksForChoice && !/https?:\/\//i.test(question);
}

function cleanDiscoveryQuery(question: string): string {
  return question
    .replace(/\b(do you have|can you give me|could you give me|i need|please)\b/gi, " ")
    .replace(/\b(recommendations?|suggestions?)\b/gi, "books")
    .replace(/\b(i can read|to read|for me)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companionOpening(companion: string): string {
  const openings: Record<string, string> = {
    Gojo: "Now that is a real reading question. I checked the catalogue instead of throwing a generic line at you.",
    Itachi: "I checked the catalogue carefully and kept the clearest matches.",
    Naruto: "Absolutely. I found a few real matches worth starting with.",
    Kakashi: "I did the useful part first and checked actual catalogue matches.",
    Megumi: "I filtered the noise and kept the relevant matches.",
    Sasuke: "I checked the catalogue. These are the strongest matches.",
    Maki: "I cut the weak results. Start with these.",
    Nobara: "Yes. I found options with actual substance, not filler.",
    Hinata: "Yes. I checked carefully and found a few good places to begin.",
    Sakura: "I checked real catalogue results so you are not choosing blindly.",
    Temari: "I ranked the useful matches and removed the obvious noise.",
    "Mei Mei": "I compared the catalogue matches and kept the ones most worth your time.",
  };
  return openings[companion] || openings.Gojo;
}

function authorLine(candidate: DiscoveryCandidate): string {
  const authors = Array.isArray(candidate.authors)
    ? candidate.authors.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).slice(0, 2)
    : [];
  const year = typeof candidate.year === "number" ? ` (${candidate.year})` : "";
  return `${authors.length ? ` — ${authors.join(", ")}` : ""}${year}`;
}

function describeCandidate(candidate: DiscoveryCandidate): string {
  if (typeof candidate.description !== "string") return "";
  const clean = candidate.description.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 120 ? `${clean.slice(0, 117).trim()}…` : clean;
}

function recommendationAnswer(companion: string, candidates: DiscoveryCandidate[]): string {
  const entries = candidates.slice(0, 3).map((candidate, index) => {
    const title = typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : "Untitled";
    const description = describeCandidate(candidate);
    return `${index + 1}. ${title}${authorLine(candidate)}${description ? ` — ${description}` : ""}`;
  });
  return `${companionOpening(companion)}\n\n${entries.join("\n")}\n\nTell me whether you want the practical side, probability and odds, history, addiction and recovery, or fiction built around the subject. I will narrow the next results instead of guessing.`;
}

function recommendationClarifier(companion: string): string {
  const lead = companion === "Gojo"
    ? "I can do better than a random list."
    : "I need one useful distinction before I narrow it properly.";
  return `${lead} Do you want books about probability and odds, gambling history, casino culture, addiction and recovery, responsible gambling, or fiction centred on gambling?`;
}

async function handleRecommendation(body: CompanionRequestBody): Promise<Response> {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const companion = typeof body.companion === "string" && body.companion.trim() ? body.companion.trim() : "Gojo";
  const response = await nativeFetch("/api/discovery/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: cleanDiscoveryQuery(question), exclude: [] }),
  });

  let payload: DiscoveryPayload = {};
  try {
    payload = await response.json() as DiscoveryPayload;
  } catch {
    payload = {};
  }

  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates.filter((candidate): candidate is DiscoveryCandidate => Boolean(candidate) && typeof candidate === "object")
    : [];
  const answer = candidates.length
    ? recommendationAnswer(companion, candidates)
    : recommendationClarifier(companion);

  return new Response(JSON.stringify({
    ok: true,
    answer,
    mode: candidates.length ? "client-catalogue-recommendation" : "client-recommendation-clarifier",
    companion,
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

window.fetch = async function adaptiveFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = requestUrl(input);
  if (url === "/api/companion/help" || url.endsWith("/api/companion/help")) {
    const body = parseCompanionBody(init);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (body && isBookRecommendation(question)) {
      try {
        return await handleRecommendation(body);
      } catch {
        const companion = typeof body.companion === "string" ? body.companion : "Gojo";
        return new Response(JSON.stringify({
          ok: true,
          answer: recommendationClarifier(companion),
          mode: "client-recommendation-fallback",
          companion,
        }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }
    }
  }
  return nativeFetch(input, init);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiseViewportObserver, { once: true });
} else {
  initialiseViewportObserver();
}
