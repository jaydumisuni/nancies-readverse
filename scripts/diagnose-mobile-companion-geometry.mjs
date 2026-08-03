import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = "engineering-evidence/reported-regression-v2";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
let genericCompanionEndpointCalled = false;

await page.route("**/api/discovery/search", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      candidates: [
        { title: "Addiction by Design", authors: ["Natasha Dow Schüll"], year: 2012, description: "Machine gambling environments." },
        { title: "The Biggest Bluff", authors: ["Maria Konnikova"], year: 2020, description: "Poker and decisions under uncertainty." },
        { title: "Thinking in Bets", authors: ["Annie Duke"], year: 2018, description: "Probability and incomplete information." },
      ],
    }),
  });
});

await page.route("**/api/companion/help", async (route) => {
  genericCompanionEndpointCalled = true;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, answer: "Paste the link directly.", mode: "bad-fallback" }),
  });
});

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.setItem("notverse.preferences", JSON.stringify({
    setupComplete: true,
    noteFont: "handwritten",
    readingInterests: ["Manga", "Novels"],
    discoveryMethods: ["title", "memory", "link"],
  }));
  localStorage.removeItem("readverse.chat");
});
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Chat now", exact: true }).click();
const input = page.locator(".chat-input input");
await input.fill("Do you have recommendations for books I can read on gambling?");
await input.press("Enter");
await page.waitForSelector("text=Addiction by Design");
await page.waitForTimeout(300);

async function measure() {
  return page.evaluate(() => {
    const panel = document.querySelector(".companion-panel.open");
    const input = document.querySelector(".chat-input");
    const chatBody = document.querySelector(".chat-body");
    const mobileNav = document.querySelector(".mobile-nav");
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value && {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const style = (element) => {
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        position: computed.position,
        top: computed.top,
        right: computed.right,
        bottom: computed.bottom,
        left: computed.left,
        inset: computed.inset,
        width: computed.width,
        height: computed.height,
        maxHeight: computed.maxHeight,
        overflow: computed.overflow,
        overflowY: computed.overflowY,
        scrollbarWidth: computed.scrollbarWidth,
        transform: computed.transform,
        translate: computed.translate,
        contain: computed.contain,
        filter: computed.filter,
        perspective: computed.perspective,
        zIndex: computed.zIndex,
        background: computed.background,
        opacity: computed.opacity,
        pointerEvents: computed.pointerEvents,
      };
    };

    const ancestors = [];
    let current = panel;
    while (current) {
      ancestors.push({
        tag: current.tagName,
        id: current.id,
        className: String(current.className || ""),
        rect: rect(current),
        style: style(current),
      });
      current = current.parentElement;
    }

    return {
      viewport: {
        innerWidth,
        innerHeight,
        scrollX,
        scrollY,
        visual: window.visualViewport && {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetLeft: window.visualViewport.offsetLeft,
          offsetTop: window.visualViewport.offsetTop,
          pageLeft: window.visualViewport.pageLeft,
          pageTop: window.visualViewport.pageTop,
          scale: window.visualViewport.scale,
        },
      },
      rootVariables: {
        viewportHeight: getComputedStyle(document.documentElement).getPropertyValue("--notverse-viewport-height"),
        viewportTop: getComputedStyle(document.documentElement).getPropertyValue("--notverse-viewport-top"),
        pageScrollY: getComputedStyle(document.documentElement).getPropertyValue("--notverse-page-scroll-y"),
        scrollLock: getComputedStyle(document.body).getPropertyValue("--notverse-scroll-lock"),
      },
      panelParentIsBody: panel?.parentElement === document.body,
      panel: { rect: rect(panel), style: style(panel) },
      input: { rect: rect(input), style: style(input) },
      chatBody: { rect: rect(chatBody), style: style(chatBody), clientHeight: chatBody?.clientHeight, scrollHeight: chatBody?.scrollHeight },
      mobileNav: { rect: rect(mobileNav), style: style(mobileNav) },
      body: { rect: rect(document.body), style: style(document.body), className: document.body.className },
      html: { rect: rect(document.documentElement), style: style(document.documentElement), className: document.documentElement.className },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      transcript: chatBody?.textContent || "",
      ancestors,
    };
  });
}

function visibleBounds(diagnostic) {
  const viewport = diagnostic.viewport.visual;
  const left = Number(viewport?.pageLeft ?? viewport?.offsetLeft ?? 0);
  const top = Number(viewport?.pageTop ?? viewport?.offsetTop ?? 0);
  return {
    left,
    top,
    right: left + Number(viewport?.width || diagnostic.viewport.innerWidth),
    bottom: top + Number(viewport?.height || diagnostic.viewport.innerHeight),
  };
}

function assertInside(label, rect, bounds, tolerance = 3) {
  if (!rect
      || rect.left < bounds.left - tolerance
      || rect.top < bounds.top - tolerance
      || rect.right > bounds.right + tolerance
      || rect.bottom > bounds.bottom + tolerance) {
    throw new Error(`${label} is outside the visual viewport. rect=${JSON.stringify(rect)} bounds=${JSON.stringify(bounds)}`);
  }
}

function assertDiagnostic(name, diagnostic) {
  const bounds = visibleBounds(diagnostic);
  assertInside(`${name} panel`, diagnostic.panel.rect, bounds);
  assertInside(`${name} composer`, diagnostic.input.rect, bounds);
  if (!diagnostic.panelParentIsBody) throw new Error(`${name}: companion panel was not rendered into document.body`);
  if (diagnostic.chatBody.style?.overflowY !== "auto") throw new Error(`${name}: chat history is not internally scrollable`);
  if (diagnostic.chatBody.style?.scrollbarWidth !== "none") throw new Error(`${name}: visible scrollbar is still enabled`);
  if (diagnostic.mobileNav.style?.opacity !== "0" || diagnostic.mobileNav.style?.pointerEvents !== "none") {
    throw new Error(`${name}: mobile navigation remains active behind chat`);
  }
  if (diagnostic.document.height > diagnostic.viewport.innerHeight + 1) {
    throw new Error(`${name}: document remains vertically scrollable`);
  }
}

const initial = await measure();
assertDiagnostic("initial mobile chat", initial);
if (genericCompanionEndpointCalled) throw new Error("Recommendation was sent to the generic companion endpoint");
for (const title of ["Addiction by Design", "The Biggest Bluff", "Thinking in Bets"]) {
  if (!initial.transcript.includes(title)) throw new Error(`Verified recommendation is missing ${title}`);
}
if (/paste (?:the |a )?link/i.test(initial.transcript)) throw new Error("Generic source-link response remains visible");
await page.screenshot({ path: `${out}/mobile-companion-diagnostic.png`, fullPage: false });

await page.setViewportSize({ width: 390, height: 520 });
await page.waitForTimeout(350);
const resized = await measure();
assertDiagnostic("resized mobile chat", resized);
await page.screenshot({ path: `${out}/mobile-companion-resized.png`, fullPage: false });

const diagnostic = { ok: true, genericCompanionEndpointCalled, initial, resized };
await writeFile(`${out}/mobile-companion-diagnostic.json`, `${JSON.stringify(diagnostic, null, 2)}\n`);
await browser.close();
console.log("Focused mobile companion proof passed.");
