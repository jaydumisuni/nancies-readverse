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

const diagnostic = await page.evaluate(() => {
  const panel = document.querySelector(".companion-panel.open");
  const input = document.querySelector(".chat-input");
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
      transform: computed.transform,
      translate: computed.translate,
      contain: computed.contain,
      filter: computed.filter,
      perspective: computed.perspective,
      zIndex: computed.zIndex,
      background: computed.background,
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
    body: { rect: rect(document.body), style: style(document.body), className: document.body.className },
    html: { rect: rect(document.documentElement), style: style(document.documentElement), className: document.documentElement.className },
    ancestors,
  };
});

await page.screenshot({ path: `${out}/mobile-companion-diagnostic.png`, fullPage: false });
await writeFile(`${out}/mobile-companion-diagnostic.json`, `${JSON.stringify(diagnostic, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(diagnostic, null, 2));
