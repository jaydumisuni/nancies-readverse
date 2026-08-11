import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.NOTVERSE_TEST_URL || "http://127.0.0.1:4173";
const output = process.env.PROOF_DIR || "engineering-evidence/production-polish";
await mkdir(output, { recursive: true });

const setupState = {
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

const viewports = [
  { name: "short-phone", width: 360, height: 640, mobile: true },
  { name: "iphone", width: 390, height: 844, mobile: true },
  { name: "large-phone", width: 430, height: 932, mobile: true },
  { name: "tablet", width: 820, height: 1024, mobile: false },
  { name: "laptop", width: 1366, height: 768, mobile: false },
  { name: "desktop", width: 1920, height: 1080, mobile: false },
];

const screens = [
  ["Home", ".notverse-home"],
  ["Search", ".search-view"],
  ["Notes", ".notes-experience"],
  ["Library", ".library-view"],
  ["Inbox", ".inbox-view"],
  ["Me", ".profile-notebook"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function installFixtures(page) {
  await page.route("**/api/discovery/search", async (route) => {
    const body = route.request().postDataJSON() || {};
    const query = String(body.query || "").toLowerCase();
    const gambling = /gambl|casino|poker|odds|bet/.test(query);
    const candidates = gambling ? [
      {
        title: "Addiction by Design",
        authors: ["Natasha Dow Schüll"],
        year: 2012,
        description: "How machine gambling environments are engineered to keep people playing.",
        whyMatch: "A direct match for gambling-system design and behavioural psychology.",
        provider: "Google Books · Open Library",
        identifiers: { ISBN_13: "9780691160887" },
      },
      {
        title: "The Biggest Bluff",
        authors: ["Maria Konnikova"],
        year: 2020,
        description: "Poker, psychology and decisions under uncertainty.",
        whyMatch: "A strong match for poker, probability and decision-making under uncertainty.",
        provider: "Google Books · Open Library",
        identifiers: { ISBN_13: "9780525522621" },
      },
      {
        title: "Thinking in Bets",
        authors: ["Annie Duke"],
        year: 2018,
        description: "Probability, incomplete information and better decisions.",
        whyMatch: "A useful probability-and-decisions companion to gambling-specific reading.",
        provider: "Google Books · Open Library",
        identifiers: { ISBN_13: "9780735216358" },
      },
    ] : [{
      title: "Pride and Prejudice",
      authors: ["Jane Austen"],
      year: 1813,
      description: "A novel of manners, judgement and self-knowledge.",
      whyMatch: "Matched across public book catalogues using title, creator and edition identifiers.",
      provider: "Google Books · Open Library",
      identifiers: { ISBN_13: "9780141439518" },
      rating: {
        overall: 4.26,
        ratingCount: 2000,
        sourceCount: 2,
        sources: [
          { name: "Google Books", sourceId: "google-pride", rating: 4.4, ratingCount: 1200, confidence: 0.96 },
          { name: "Open Library", sourceId: "/works/OL66554W", rating: 4.1, ratingCount: 800, confidence: 0.90 },
        ],
      },
    }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, candidates }),
    });
  });
  await page.route("**/api/companion/help", async (route) => {
    const body = route.request().postDataJSON();
    const question = String(body?.question || "");
    const lower = question.toLowerCase();
    const answer = lower.includes("recommend")
      ? "Start with The Biggest Bluff by Maria Konnikova for decisions under uncertainty, Addiction by Design by Natasha Dow Schüll for gambling-system psychology, and Thinking in Bets by Annie Duke for probabilistic reasoning. The second is useful because it explains how environments shape behaviour, not just individual willpower."
      : lower.includes("why")
        ? "The second recommendation is useful because it connects design choices, reinforcement loops and human attention. That gives you a stronger explanation than simply blaming the player."
        : "I am here. Tell me what you are trying to understand, and I will stay with the thread.";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, answer, mode: "proof" }) });
  });
}

async function setReady(page) {
  await page.addInitScript((preferences) => {
    localStorage.setItem("notverse.preferences", JSON.stringify(preferences));
    localStorage.removeItem("readverse.chat");
  }, setupState);
}

async function clickNavigation(page, label, mobile) {
  const root = mobile ? ".notverse-mobile-nav" : ".side-nav";
  const button = page.locator(root).getByRole("button", { name: label, exact: true });
  await button.click();
  const selector = screens.find(([name]) => name === label)?.[1];
  if (selector) await page.locator(selector).waitFor();
}

async function assertNoHorizontalOverflow(page, label) {
  const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert(width.document <= width.viewport + 2, `${label}: horizontal overflow ${width.document} > ${width.viewport}`);
}

async function assertNoNavigationOverlap(page, label) {
  const result = await page.evaluate(() => {
    const clippedRect = (element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return null;

      const source = element.getBoundingClientRect();
      let left = Math.max(0, source.left);
      let top = Math.max(0, source.top);
      let right = Math.min(innerWidth, source.right);
      let bottom = Math.min(innerHeight, source.bottom);

      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const parentStyle = getComputedStyle(parent);
        const clipsX = /(hidden|auto|scroll|clip)/.test(parentStyle.overflowX) || /(hidden|auto|scroll|clip)/.test(parentStyle.overflow);
        const clipsY = /(hidden|auto|scroll|clip)/.test(parentStyle.overflowY) || /(hidden|auto|scroll|clip)/.test(parentStyle.overflow);
        if (!clipsX && !clipsY) continue;
        const box = parent.getBoundingClientRect();
        if (clipsX) {
          left = Math.max(left, box.left);
          right = Math.min(right, box.right);
        }
        if (clipsY) {
          top = Math.max(top, box.top);
          bottom = Math.min(bottom, box.bottom);
        }
      }

      return right > left && bottom > top ? { left, top, right, bottom } : null;
    };

    const nav = document.querySelector(".notverse-mobile-nav");
    const navBox = nav ? clippedRect(nav) : null;
    if (!nav || !navBox) return [];

    return [...document.querySelectorAll("button,input,textarea,select,a[href]")]
      .filter((element) => !nav.contains(element))
      .map((element) => ({ element, box: clippedRect(element) }))
      .filter(({ box }) => box && box.left < navBox.right && box.right > navBox.left && box.top < navBox.bottom && box.bottom > navBox.top)
      .map(({ element }) => ({
        tag: element.tagName,
        text: (element.textContent || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "").trim().slice(0, 80),
      }));
  });
  assert(result.length === 0, `${label}: controls hidden behind mobile navigation: ${JSON.stringify(result)}`);
}

async function swipeSetup(page, expectedPage) {
  const setup = page.locator(".notverse-setup");
  const box = await setup.boundingBox();
  assert(box, `setup page ${expectedPage}: setup surface is missing`);
  const x = Math.round(box.x + box.width * 0.72);
  const startY = Math.round(box.y + box.height * 0.72);
  const endY = Math.round(box.y + box.height * 0.28);
  await setup.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, clientY: startY, bubbles: true });
  await setup.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, clientY: endY, bubbles: true });
  await page.waitForFunction((value) => document.querySelector(".notverse-setup")?.getAttribute("data-page") === String(value), expectedPage, { timeout: 2500 });
  await page.waitForTimeout(90);
}

async function assertSetupSurface(page, label, mobile) {
  assert(await page.getByRole("button", { name: /continue|back|start setup|enter/i }).count() === 0, `${label}: forbidden setup navigation button is present`);
  await assertNoHorizontalOverflow(page, label);
  const geometry = await page.evaluate(() => {
    const stack = document.querySelector(".setup-paper-stack")?.getBoundingClientRect();
    const hint = document.querySelector(".setup-swipe-hint")?.getBoundingClientRect();
    const progress = document.querySelector(".setup-progress")?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      stack: stack && { left: stack.left, right: stack.right, top: stack.top, bottom: stack.bottom },
      hint: hint && { top: hint.top, bottom: hint.bottom },
      progress: progress && { top: progress.top, bottom: progress.bottom },
    };
  });
  assert(geometry.stack && geometry.stack.left >= -1 && geometry.stack.right <= geometry.viewport.width + 1, `${label}: setup paper leaves the viewport horizontally`);
  assert(geometry.stack.top >= -1 && geometry.stack.bottom <= geometry.viewport.height + 1, `${label}: setup paper leaves the viewport vertically`);
  assert(!geometry.progress || !geometry.hint || geometry.progress.bottom <= geometry.hint.bottom + 1, `${label}: setup progress and swipe hint are malformed`);
  if (mobile && await page.locator(".setup-form-grid input:not([type=file])").count()) {
    await assertFocusedInput(page, ".setup-form-grid input:not([type=file])", `${label}/field`, true);
  }
}

async function assertFocusedInput(page, selector, label, mobile) {
  const input = page.locator(selector).first();
  await input.focus();
  const state = await input.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      scale: window.visualViewport?.scale || 1,
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert(state.box.left >= -1 && state.box.right <= state.viewport.width + 1, `${label}: focused input leaves the viewport horizontally`);
  assert(state.box.top >= -1 && state.box.bottom <= state.viewport.height + 1, `${label}: focused input leaves the viewport vertically`);
  if (mobile) {
    assert(state.fontSize >= 16, `${label}: ${state.fontSize}px input can trigger iOS focus zoom`);
    assert(Math.abs(state.scale - 1) < 0.01, `${label}: visual viewport zoomed to ${state.scale}`);
  }
  return state;
}

const browser = await chromium.launch({ headless: true });
const report = { ok: false, baseURL, viewports: [], screenshots: [], checks: [], errors: [] };

try {
  // Prove every swipe-only setup sheet instead of checking only the cover.
  for (const setupViewport of [{ name: "setup-mobile", width: 390, height: 844 }, { name: "setup-desktop", width: 1440, height: 1000 }]) {
    const mobile = setupViewport.width < 760;
    const context = await browser.newContext({ viewport: { width: setupViewport.width, height: setupViewport.height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.locator(".notverse-setup").waitFor();
    assert(await page.locator(".setup-brand > strong").count() === 0, `${setupViewport.name}: duplicate NoTVerse wordmark returned`);
    assert(await page.locator(".setup-brand > small").count() === 0, `${setupViewport.name}: rejected setup label returned`);
    assert(await page.locator(".setup-cover-page h1").count() === 0, `${setupViewport.name}: duplicate cover title returned`);
    assert(await page.getByText("Created for Nancy. Shared with the world.", { exact: true }).isVisible(), `${setupViewport.name}: origin line missing`);

    for (let setupPage = 1; setupPage <= 10; setupPage += 1) {
      await assertSetupSurface(page, `${setupViewport.name}/page-${setupPage}`, mobile);
      const path = `${output}/${setupViewport.name}-page-${setupPage}.png`;
      await page.screenshot({ path, fullPage: false });
      report.screenshots.push(path);
      if (setupPage < 10) await swipeSetup(page, setupPage + 1);
    }

    await page.locator(".notverse-setup").dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", isPrimary: true, clientX: Math.round(setupViewport.width * .72), clientY: Math.round(setupViewport.height * .72), bubbles: true });
    await page.locator(".notverse-setup").dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch", isPrimary: true, clientX: Math.round(setupViewport.width * .72), clientY: Math.round(setupViewport.height * .28), bubbles: true });
    await page.locator(".notverse-home").waitFor({ timeout: 3000 });
    await context.close();
  }

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
    });
    const page = await context.newPage();
    await setReady(page);
    await installFixtures(page);
    page.on("console", (message) => { if (message.type() === "error") report.errors.push(`${viewport.name} console: ${message.text()}`); });
    page.on("pageerror", (error) => report.errors.push(`${viewport.name} page: ${error.message}`));
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.locator(".notverse-home").waitFor();

    const navLabels = await page.locator(viewport.mobile ? ".notverse-mobile-nav span" : ".side-nav span").allTextContents();
    assert(JSON.stringify(navLabels) === JSON.stringify(["Home", "Search", "Notes", "Library", "Inbox", "Me"]), `${viewport.name}: navigation order changed: ${navLabels.join(", ")}`);

    const viewportReport = { ...viewport, screens: [] };
    for (const [label, selector] of screens) {
      await clickNavigation(page, label, viewport.mobile);
      await page.locator(selector).waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await assertNoHorizontalOverflow(page, `${viewport.name}/${label}`);
      if (viewport.mobile) {
        await assertNoNavigationOverlap(page, `${viewport.name}/${label} top`);
        if (label !== "Notes") {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(100);
          await assertNoNavigationOverlap(page, `${viewport.name}/${label} bottom`);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
      }

      if (label === "Search") {
        await assertFocusedInput(page, ".notverse-search-box input", `${viewport.name}/Search`, viewport.mobile);
        await page.locator(".notverse-search-box input").fill("Pride and Prejudice");
        await page.locator(".notverse-search-box").evaluate((form) => form.requestSubmit());
        await page.locator(".discovery-results-card .public-rating").waitFor();
        const rating = (await page.locator(".public-rating").innerText()).replace(/\s+/g, " ");
        assert(rating.includes("4.26") && rating.includes("2,000") && rating.includes("Google Books") && rating.includes("Open Library"), `${viewport.name}: public rating did not render correctly: ${rating}`);
        await page.getByRole("button", { name: "Close chat" }).click();
        await page.locator(".companion-panel.open").waitFor({ state: "detached" });
      }

      if (label === "Notes" && viewport.mobile) {
        const geometry = await page.evaluate(() => {
          const paper = document.querySelector(".note-paper")?.getBoundingClientRect();
          const footer = document.querySelector(".note-paper > footer")?.getBoundingClientRect();
          const nav = document.querySelector(".notverse-mobile-nav")?.getBoundingClientRect();
          const experience = document.querySelector(".notes-experience");
          return {
            documentHeight: document.documentElement.scrollHeight,
            viewportHeight: innerHeight,
            paperBottom: paper?.bottom,
            footerBottom: footer?.bottom,
            navTop: nav?.top,
            touchAction: experience ? getComputedStyle(experience).touchAction : "",
          };
        });
        assert(geometry.documentHeight <= geometry.viewportHeight + 2, `${viewport.name}/Notes: document scrolls behind page flip`);
        assert((geometry.footerBottom || 0) <= (geometry.navTop || 0) + 1, `${viewport.name}/Notes: footer hides behind navigation`);
        assert(geometry.touchAction === "none", `${viewport.name}/Notes: vertical gestures are not reserved for flipping`);
      }

      if (label === "Inbox") {
        await assertFocusedInput(page, ".inbox-layout main > form input", `${viewport.name}/Inbox`, viewport.mobile);
      }

      const screenshot = `${output}/${viewport.name}-${label.toLowerCase()}.png`;
      await page.screenshot({ path: screenshot, fullPage: false });
      report.screenshots.push(screenshot);
      viewportReport.screens.push(label);
    }

    await clickNavigation(page, "Home", viewport.mobile);
    await assertFocusedInput(page, ".global-search input", `${viewport.name}/Global Search`, viewport.mobile);
    await clickNavigation(page, "Home", viewport.mobile);
    await page.getByRole("button", { name: "Chat now", exact: true }).click();
    const panel = page.locator(".companion-panel.open");
    await panel.waitFor();
    const chatInput = await assertFocusedInput(page, ".companion-panel.open .chat-input input", `${viewport.name}/Chat`, viewport.mobile);
    const chatGeometry = await page.evaluate(() => {
      const panel = document.querySelector(".companion-panel.open")?.getBoundingClientRect();
      const composer = document.querySelector(".companion-panel.open .chat-input")?.getBoundingClientRect();
      const navigation = document.querySelector(".notverse-mobile-nav");
      const navStyle = navigation ? getComputedStyle(navigation) : null;
      const history = document.querySelector(".chat-body");
      return {
        viewport: { width: innerWidth, height: innerHeight },
        panel: panel && { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
        composer: composer && { left: composer.left, right: composer.right, top: composer.top, bottom: composer.bottom },
        navigation: navStyle && { opacity: navStyle.opacity, pointerEvents: navStyle.pointerEvents, visibility: navStyle.visibility },
        history: history && { overflowY: getComputedStyle(history).overflowY, scrollbarWidth: getComputedStyle(history).scrollbarWidth },
        document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      };
    });
    assert(chatGeometry.panel && chatGeometry.panel.left >= -1 && chatGeometry.panel.top >= -1 && chatGeometry.panel.right <= viewport.width + 1 && chatGeometry.panel.bottom <= viewport.height + 1, `${viewport.name}/Chat: panel is outside viewport`);
    assert(chatGeometry.composer && chatGeometry.composer.bottom <= viewport.height + 1, `${viewport.name}/Chat: composer is hidden below viewport`);
    assert(chatGeometry.history?.overflowY === "auto", `${viewport.name}/Chat: history cannot scroll internally`);
    assert(chatGeometry.history?.scrollbarWidth === "none", `${viewport.name}/Chat: visible scrollbar returned`);
    if (viewport.mobile) {
      assert(chatGeometry.navigation?.opacity === "0" && chatGeometry.navigation?.pointerEvents === "none", `${viewport.name}/Chat: mobile navigation remains active behind chat`);
    }
    await page.locator(".chat-input input").fill("Recommend three books about gambling and explain why each fits.");
    await page.locator(".chat-input form").count().catch(() => 0);
    await page.locator(".chat-input input").press("Enter");
    await page.getByText("The Biggest Bluff", { exact: false }).waitFor();
    await page.locator(".chat-input input").fill("Why is the second one useful?");
    await page.locator(".chat-input input").press("Enter");
    await page.getByText("reinforcement loops", { exact: false }).waitFor();
    const chatShot = `${output}/${viewport.name}-chat.png`;
    await page.screenshot({ path: chatShot, fullPage: false });
    report.screenshots.push(chatShot);

    if (viewport.mobile) {
      const keyboardHeight = Math.max(430, viewport.height - 320);
      await page.setViewportSize({ width: viewport.width, height: keyboardHeight });
      await page.waitForTimeout(250);
      const keyboard = await page.evaluate(() => {
        const panel = document.querySelector(".companion-panel.open")?.getBoundingClientRect();
        const composer = document.querySelector(".companion-panel.open .chat-input")?.getBoundingClientRect();
        return { viewportHeight: innerHeight, panelBottom: panel?.bottom, composerBottom: composer?.bottom, documentHeight: document.documentElement.scrollHeight };
      });
      assert((keyboard.panelBottom || 0) <= keyboard.viewportHeight + 1, `${viewport.name}/Keyboard: chat panel exceeds resized viewport`);
      assert((keyboard.composerBottom || 0) <= keyboard.viewportHeight + 1, `${viewport.name}/Keyboard: composer hides behind software keyboard area`);
      const keyboardShot = `${output}/${viewport.name}-chat-keyboard.png`;
      await page.screenshot({ path: keyboardShot, fullPage: false });
      report.screenshots.push(keyboardShot);
    }

    viewportReport.chatInput = chatInput;
    viewportReport.chatGeometry = chatGeometry;
    report.viewports.push(viewportReport);
    await context.close();
  }

  // WebKit catches mobile focus and viewport regressions closer to Safari than Chromium alone.
  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    const context = await webkitBrowser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await setReady(page);
    await installFixtures(page);
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.locator(".notverse-home").waitFor();
    await clickNavigation(page, "Search", true);
    await assertFocusedInput(page, ".notverse-search-box input", "webkit-iphone/Search", true);
    await clickNavigation(page, "Home", true);
    await page.getByRole("button", { name: "Chat now", exact: true }).click();
    await page.locator(".companion-panel.open").waitFor();
    await assertFocusedInput(page, ".companion-panel.open .chat-input input", "webkit-iphone/Chat", true);
    await page.setViewportSize({ width: 390, height: 524 });
    await page.waitForTimeout(250);
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector(".companion-panel.open")?.getBoundingClientRect();
      const composer = document.querySelector(".companion-panel.open .chat-input")?.getBoundingClientRect();
      return { height: innerHeight, panelBottom: panel?.bottom, composerBottom: composer?.bottom, scale: visualViewport?.scale || 1 };
    });
    assert((geometry.panelBottom || 0) <= geometry.height + 1, "webkit-iphone/Keyboard: panel exceeds the visual viewport");
    assert((geometry.composerBottom || 0) <= geometry.height + 1, "webkit-iphone/Keyboard: composer hides behind the keyboard area");
    assert(Math.abs(geometry.scale - 1) < .01, `webkit-iphone/Keyboard: focus zoom changed to ${geometry.scale}`);
    const screenshot = `${output}/webkit-iphone-chat-keyboard.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    report.screenshots.push(screenshot);
    report.checks.push("WebKit mobile Search and chat focus remain unzoomed and keyboard-safe");
    await context.close();
  } finally {
    await webkitBrowser.close();
  }

  assert(report.errors.length === 0, `browser errors: ${report.errors.join(" | ")}`);
  report.checks = [
    "all ten swipe-only setup pages and exact approved branding",
    "six-part navigation in every viewport",
    "no horizontal overflow",
    "no controls hidden behind mobile navigation",
    "Search, global Search, Inbox and chat inputs stay at 16px on mobile",
    "Search result renders weighted public ratings",
    "mobile Notes stay above navigation and reserve swipe gestures",
    "chat stays inside normal and keyboard-sized viewports",
    "mobile navigation becomes inactive while chat is open",
    "multi-turn chat remains usable",
  ];
  report.ok = true;
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, viewports: report.viewports.length, screenshots: report.screenshots.length, checks: report.checks }, null, 2));
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
