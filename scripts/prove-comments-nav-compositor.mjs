import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/comments-nav-compositor";
await mkdir(out, { recursive: true });

const report = { ok: true, cases: [], errors: [] };

function seedPreferences() {
  localStorage.setItem("notverse.preferences", JSON.stringify({
    setupComplete: true,
    noteFont: "handwritten",
    readingInterests: ["Manga", "Novels", "PDFs"],
    discoveryMethods: ["title", "memory", "link"],
  }));
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function navState(page) {
  return page.locator(".mobile-nav.notverse-mobile-nav").evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      inert: node.hasAttribute("inert"),
      ariaHidden: node.getAttribute("aria-hidden"),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
  });
}

async function stackingAtNav(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".mobile-nav.notverse-mobile-nav");
    const backdrop = document.querySelector(".replies-backdrop");
    const notes = document.querySelector(".notes-social-experience");
    if (!(nav instanceof HTMLElement) || !(backdrop instanceof HTMLElement) || !(notes instanceof HTMLElement)) {
      return { ok: false, reason: "required element missing" };
    }
    const rect = nav.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const previous = nav.style.getPropertyValue("pointer-events");
    const previousPriority = nav.style.getPropertyPriority("pointer-events");
    nav.style.setProperty("pointer-events", "auto", "important");
    const top = document.elementFromPoint(x, y);
    const stack = document.elementsFromPoint(x, y).slice(0, 10).map((node) => ({
      tag: node.tagName,
      className: node instanceof HTMLElement ? node.className : "",
    }));
    if (previous) nav.style.setProperty("pointer-events", previous, previousPriority);
    else nav.style.removeProperty("pointer-events");
    return {
      ok: true,
      notesPosition: getComputedStyle(notes).position,
      notesZIndex: getComputedStyle(notes).zIndex,
      backdropZIndex: getComputedStyle(backdrop).zIndex,
      topTag: top?.tagName || null,
      topClassName: top instanceof HTMLElement ? top.className : null,
      topInsideComments: Boolean(top?.closest(".replies-backdrop")),
      stack,
    };
  });
}

async function run(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(seedPreferences);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Notes", exact: true }).last().click();
    await page.getByRole("button", { name: "Comment on Note", exact: true }).click();
    await page.waitForFunction(() => document.body.classList.contains("notverse-comments-open"));
    await settle(page);

    const openedNav = await navState(page);
    const openedStack = await stackingAtNav(page);
    assert.equal(openedNav.zIndex, "55", `${browserName}: nav changed compositor layer under Comments`);
    assert.equal(openedNav.inert, true, `${browserName}: nav not inert under Comments`);
    assert.equal(openedNav.ariaHidden, "true", `${browserName}: nav not aria-hidden under Comments`);
    assert.equal(openedStack.notesPosition, "relative", `${browserName}: legacy fixed Notes stacking context still active`);
    assert.equal(openedStack.topInsideComments, true, `${browserName}: nav paints above Comments at nav coordinates`);

    const input = page.getByRole("textbox", { name: "Write a comment" });
    await input.fill("iPhone compositor proof");
    await input.focus();
    await page.setViewportSize({ width: 390, height: 520 });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}/${browserName}-comments-keyboard.png`, fullPage: false });

    await page.getByRole("button", { name: "Send", exact: true }).tap();
    await input.evaluate((node) => node.blur());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);

    const beforeBackNav = await navState(page);
    const beforeBackStack = await stackingAtNav(page);
    assert.equal(beforeBackNav.zIndex, "55", `${browserName}: nav layer changed before Back`);
    assert.equal(beforeBackStack.topInsideComments, true, `${browserName}: Comments no longer covers nav before Back`);

    await page.getByRole("button", { name: "Back to Notes" }).click();
    await page.waitForFunction(() => !document.body.classList.contains("notverse-comments-open"));
    await settle(page);
    const restoredNav = await navState(page);
    assert.equal(restoredNav.zIndex, "55", `${browserName}: nav layer changed after Back`);
    assert.equal(restoredNav.inert, false, `${browserName}: nav stayed inert after Back`);
    assert.equal(restoredNav.ariaHidden, null, `${browserName}: nav stayed aria-hidden after Back`);
    assert.equal(restoredNav.visibility, "visible", `${browserName}: nav invisible after Back`);
    assert(restoredNav.opacity >= .99, `${browserName}: nav opacity=${restoredNav.opacity}`);
    await page.screenshot({ path: `${out}/${browserName}-comments-return-nav.png`, fullPage: false });

    report.cases.push({ browserName, openedNav, openedStack, beforeBackNav, beforeBackStack, restoredNav });
  } catch (error) {
    report.ok = false;
    report.errors.push({ browserName, error: error instanceof Error ? error.stack || error.message : String(error) });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

try {
  await run(chromium, "chromium");
  await run(webkit, "webkit");
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}

console.log(`Comments nav compositor proof: ${report.ok ? "PASS" : "FAIL"}`);
