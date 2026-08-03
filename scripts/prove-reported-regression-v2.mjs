import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/reported-regression-v2";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { ok: true, baseUrl, cases: [], errors: [] };

async function prepare(page) {
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
}

async function measureChat(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".companion-panel.open")?.getBoundingClientRect();
    const input = document.querySelector(".chat-input")?.getBoundingClientRect();
    const history = document.querySelector(".chat-body");
    const navigation = document.querySelector(".mobile-nav");
    const main = document.querySelector(".main-shell.notverse-shell");
    const homeCard = document.querySelector(".notverse-companion-card")?.getBoundingClientRect();
    const visualViewport = window.visualViewport;

    return {
      layoutViewport: { width: innerWidth, height: innerHeight },
      visualViewport: visualViewport ? {
        width: visualViewport.width,
        height: visualViewport.height,
        offsetLeft: visualViewport.offsetLeft,
        offsetTop: visualViewport.offsetTop,
        pageLeft: visualViewport.pageLeft,
        pageTop: visualViewport.pageTop,
        scale: visualViewport.scale,
      } : null,
      panel: panel && {
        top: panel.top,
        right: panel.right,
        bottom: panel.bottom,
        left: panel.left,
        width: panel.width,
        height: panel.height,
      },
      input: input && {
        top: input.top,
        right: input.right,
        bottom: input.bottom,
        left: input.left,
        height: input.height,
      },
      history: history && {
        clientHeight: history.clientHeight,
        scrollHeight: history.scrollHeight,
        overflowY: getComputedStyle(history).overflowY,
        scrollbarWidth: getComputedStyle(history).scrollbarWidth,
      },
      navigation: navigation && {
        opacity: getComputedStyle(navigation).opacity,
        pointerEvents: getComputedStyle(navigation).pointerEvents,
      },
      main: main && {
        paddingRight: Number.parseFloat(getComputedStyle(main).paddingRight),
        width: main.getBoundingClientRect().width,
      },
      homeCard: homeCard && {
        left: homeCard.left,
        right: homeCard.right,
        width: homeCard.width,
      },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      body: {
        overflow: getComputedStyle(document.body).overflow,
        position: getComputedStyle(document.body).position,
      },
      stateClasses: {
        html: document.documentElement.className,
        body: document.body.className,
      },
    };
  });
}

function visibleBounds(geometry, fallbackWidth, fallbackHeight) {
  const viewport = geometry.visualViewport;
  if (!viewport) {
    return { left: 0, top: 0, right: fallbackWidth, bottom: fallbackHeight };
  }
  const left = Number(viewport.pageLeft ?? viewport.offsetLeft ?? 0);
  const top = Number(viewport.pageTop ?? viewport.offsetTop ?? 0);
  return {
    left,
    top,
    right: left + Number(viewport.width || fallbackWidth),
    bottom: top + Number(viewport.height || fallbackHeight),
  };
}

function assertRectInside(name, label, rect, bounds, tolerance = 3) {
  if (!rect
      || rect.left < bounds.left - tolerance
      || rect.top < bounds.top - tolerance
      || rect.right > bounds.right + tolerance
      || rect.bottom > bounds.bottom + tolerance) {
    throw new Error(`${name}: ${label} exceeds visual viewport. rect=${JSON.stringify(rect)} bounds=${JSON.stringify(bounds)}`);
  }
}

function assertChatGeometry(name, geometry, width, height, mobile) {
  const bounds = visibleBounds(geometry, width, height);
  assertRectInside(name, "companion panel", geometry.panel, bounds);
  assertRectInside(name, "companion composer", geometry.input, bounds);

  if (geometry.history?.overflowY !== "auto") {
    throw new Error(`${name}: chat history is not the only scrollable region`);
  }
  if (geometry.history?.scrollbarWidth !== "none") {
    throw new Error(`${name}: visual chat scrollbar remains enabled`);
  }
  if (!geometry.stateClasses.body.includes("notverse-chat-open")) {
    throw new Error(`${name}: runtime chat state class was not applied`);
  }
  if (geometry.document.height > height + 1) {
    throw new Error(`${name}: opening chat leaves the document scrollable (${geometry.document.height} > ${height})`);
  }
  if (mobile && (geometry.navigation?.opacity !== "0" || geometry.navigation?.pointerEvents !== "none")) {
    throw new Error(`${name}: mobile navigation remains active behind chat`);
  }
}

async function verifyChatViewport(width, height, name, mobile = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  await prepare(page);
  await page.getByRole("button", { name: "Chat now", exact: true }).click();
  await page.waitForSelector(".companion-panel.open .chat-input input");
  await page.waitForTimeout(250);

  const geometry = await measureChat(page);
  await page.screenshot({ path: `${out}/${name}-chat.png`, fullPage: false });
  assertChatGeometry(name, geometry, width, height, mobile);
  if (name === "tablet" && (!geometry.main || geometry.main.paddingRight > 20)) {
    throw new Error(`${name}: opening chat still squeezes Home (padding-right ${geometry.main?.paddingRight})`);
  }

  report.cases.push({ name, width, height, geometry });
  await context.close();
}

async function verifyMobileNotes(width, height, name) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await prepare(page);
  await page.getByRole("button", { name: "Notes" }).last().click();
  await page.waitForSelector(".notes-experience .note-paper");
  await page.waitForTimeout(200);

  const before = await page.locator(".note-position strong").textContent();
  const geometry = await page.evaluate(() => {
    const workspace = document.querySelector(".notes-experience")?.getBoundingClientRect();
    const paper = document.querySelector(".note-paper")?.getBoundingClientRect();
    const footer = document.querySelector(".note-paper > footer")?.getBoundingClientRect();
    const nav = document.querySelector(".mobile-nav")?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      workspace: workspace && { top: workspace.top, bottom: workspace.bottom, height: workspace.height },
      paper: paper && { top: paper.top, bottom: paper.bottom, height: paper.height },
      footer: footer && { top: footer.top, bottom: footer.bottom },
      nav: nav && { top: nav.top, bottom: nav.bottom },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      bodyOverflow: getComputedStyle(document.body).overflow,
      workspaceOverflow: getComputedStyle(document.querySelector(".notes-experience")).overflow,
      touchAction: getComputedStyle(document.querySelector(".notes-experience")).touchAction,
      stateClass: document.body.className,
    };
  });

  if (!geometry.stateClass.includes("notverse-notes-open")) {
    throw new Error(`${name}: runtime Notes state class was not applied`);
  }
  if (geometry.document.height > height + 1) {
    throw new Error(`${name}: Notes document still scrolls`);
  }
  if (!geometry.paper || !geometry.nav || geometry.paper.bottom > geometry.nav.top + 1) {
    throw new Error(`${name}: Note paper remains behind navigation`);
  }
  if (!geometry.footer || geometry.footer.bottom > geometry.nav.top + 1) {
    throw new Error(`${name}: Note footer is not reachable`);
  }
  if (geometry.workspaceOverflow !== "hidden" || geometry.touchAction !== "none") {
    throw new Error(`${name}: vertical gestures are not reserved for Note flipping`);
  }

  await page.locator(".notes-experience").evaluate((element) => {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientY: 540 }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientY: 280 }));
  });
  await page.waitForTimeout(520);
  const after = await page.locator(".note-position strong").textContent();
  if (before === after) throw new Error(`${name}: swipe did not flip to another Note`);

  await page.screenshot({ path: `${out}/${name}-notes.png`, fullPage: false });
  report.cases.push({ name, width, height, geometry, before, after });
  await context.close();
}

async function verifyRecommendationAndViewportResize() {
  const width = 390;
  const height = 844;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  let companionEndpointCalled = false;

  await page.route("**/api/discovery/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candidates: [
          {
            title: "Addiction by Design",
            authors: ["Natasha Dow Schüll"],
            year: 2012,
            description: "How machine gambling environments are engineered to keep people playing.",
          },
          {
            title: "The Biggest Bluff",
            authors: ["Maria Konnikova"],
            year: 2020,
            description: "Poker, psychology and decisions under uncertainty.",
          },
          {
            title: "Thinking in Bets",
            authors: ["Annie Duke"],
            year: 2018,
            description: "Probability, incomplete information and better decisions.",
          },
        ],
      }),
    });
  });
  await page.route("**/api/companion/help", async (route) => {
    companionEndpointCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, answer: "Paste the link directly.", mode: "bad-fallback" }),
    });
  });

  await prepare(page);
  await page.getByRole("button", { name: "Chat now", exact: true }).click();
  const input = page.locator(".chat-input input");
  await input.fill("Do you have recommendations for books I can read on gambling?");
  await input.press("Enter");
  await page.waitForSelector("text=Addiction by Design");

  const transcript = await page.locator(".chat-body").innerText();
  if (companionEndpointCalled) {
    throw new Error("recommendation request reached generic companion fallback instead of catalogue routing");
  }
  if (!transcript.includes("Addiction by Design")
      || !transcript.includes("The Biggest Bluff")
      || !transcript.includes("Thinking in Bets")) {
    throw new Error(`catalogue-backed recommendation titles are missing: ${transcript}`);
  }
  if (/paste (?:the |a )?link/i.test(transcript)) {
    throw new Error("generic source-link response is still visible");
  }

  const initial = await measureChat(page);
  await page.screenshot({ path: `${out}/mobile-recommendation.png`, fullPage: false });
  assertChatGeometry("mobile-recommendation", initial, width, height, true);

  await page.setViewportSize({ width, height: 520 });
  await page.waitForTimeout(300);
  const resized = await measureChat(page);
  await page.screenshot({ path: `${out}/mobile-resized-chat.png`, fullPage: false });
  assertChatGeometry("mobile-resized-viewport", resized, width, 520, true);

  report.cases.push({
    name: "mobile-recommendation-and-resize",
    transcript,
    companionEndpointCalled,
    initial,
    resized,
  });
  await context.close();
}

for (const task of [
  () => verifyChatViewport(1366, 768, "desktop"),
  () => verifyChatViewport(820, 1024, "tablet"),
  () => verifyMobileNotes(360, 640, "short-phone"),
  () => verifyMobileNotes(390, 844, "tall-phone"),
  () => verifyRecommendationAndViewportResize(),
]) {
  try {
    await task();
  } catch (error) {
    report.ok = false;
    report.errors.push(error instanceof Error ? error.message : String(error));
  }
}

await writeFile(`${out}/reported-regression-v2.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Reported regression v2 proof passed (${report.cases.length} cases).`);
