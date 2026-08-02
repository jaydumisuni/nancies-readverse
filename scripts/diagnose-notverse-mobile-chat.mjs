import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.NOTVERSE_TEST_URL || "http://127.0.0.1:4173";
const output = "engineering-evidence/notverse-brand-mobile";
await mkdir(output, { recursive: true });

const preferences = {
  setupComplete: true,
  interests: ["Manga", "Novels", "PDFs"],
  discovery: ["Title, author, series or ISBN", "Describe something from memory", "Scan a cover", "Scan a page", "Paste a source link", "Voice description"],
  accentIntensity: 74,
  readerFont: "serif",
  noteFont: "handwritten",
  reducedMotion: false,
  paperTexture: 72,
  readingVisibility: "approximate",
  spoilerPreference: "progress",
  community: { seePublicNotes: true, seeLibraryNotes: true, allowFollowers: true, messageRequests: true, appearInNotebooks: true, privateByDefault: true },
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
  const page = await context.newPage();
  await page.addInitScript((value) => localStorage.setItem("notverse.preferences", JSON.stringify(value)), preferences);
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".notverse-home").waitFor();
  await page.getByRole("button", { name: "Chat now", exact: true }).click();
  await page.locator(".companion-panel.open").waitFor();
  const input = page.locator(".companion-panel.open .chat-input input");
  await input.fill("Geometry proof");
  const geometry = await page.evaluate(() => {
    function rect(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        width: box.width, height: box.height,
        position: style.position, display: style.display, overflow: style.overflow,
        paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
        minHeight: style.minHeight, heightStyle: style.height,
        zIndex: style.zIndex, opacity: style.opacity,
        transform: style.transform,
      };
    }
    return {
      window: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
      visualViewport: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop, pageTop: window.visualViewport.pageTop, scale: window.visualViewport.scale } : null,
      document: { clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      panel: rect(".companion-panel.open"),
      header: rect(".companion-panel.open .companion-header"),
      body: rect(".companion-panel.open .chat-body"),
      form: rect(".companion-panel.open .chat-input"),
      input: rect(".companion-panel.open .chat-input input"),
      nav: rect(".mobile-nav"),
    };
  });
  await page.screenshot({ path: `${output}/chat-geometry-mobile.png`, fullPage: false });
  await writeFile(`${output}/mobile-geometry.json`, JSON.stringify(geometry, null, 2));
  console.log(JSON.stringify(geometry, null, 2));
  await context.close();
} finally {
  await browser.close();
}
