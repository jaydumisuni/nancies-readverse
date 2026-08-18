import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = process.env.PROOF_DIR || "engineering-evidence/mobile-touch-targets";
await mkdir(out, { recursive: true });

const report = { ok: true, cases: [], errors: [] };
const assert = (value, message) => { if (!value) throw new Error(message); };

async function prepare(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("notverse.preferences", JSON.stringify({
      setupComplete: true,
      noteFont: "handwritten",
      readingInterests: ["Manga", "Novels", "PDFs"],
      discoveryMethods: ["title", "memory", "link"],
    }));
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function prove(browserType, browserName, width, height) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await prepare(page);
    await page.getByRole("button", { name: "Notes", exact: true }).last().click();

    const notePosition = page.locator(".note-position strong");
    const noteBefore = await notePosition.textContent();
    await page.locator(".notes-experience").evaluate((element) => {
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientY: 560 }));
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientY: 300 }));
    });
    await page.waitForTimeout(520);
    const noteAfter = await notePosition.textContent();
    assert(noteBefore !== noteAfter, `${browserName}/${width}: vertical Note swipe did not flip the Note`);
    const notesState = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      touchAction: getComputedStyle(document.querySelector(".notes-experience")).touchAction,
    }));
    assert(notesState.documentWidth <= width + 2, `${browserName}/${width}: Notes creates horizontal overflow (${notesState.documentWidth})`);
    assert(notesState.documentHeight <= height + 2, `${browserName}/${width}: Notes creates document scrolling (${notesState.documentHeight})`);
    assert(notesState.touchAction === "none", `${browserName}/${width}: Notes does not reserve vertical flip gestures`);

    const actions = page.locator(".note-social-actions > button");
    await actions.first().waitFor();
    const metrics = await actions.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const icon = node.querySelector("b");
      const label = node.querySelector("span");
      return {
        width: box.width,
        height: box.height,
        iconSize: icon ? parseFloat(getComputedStyle(icon).fontSize) : 0,
        label: label?.textContent?.trim() || "",
      };
    }));

    assert(metrics.length === 4, `${browserName}/${width}: expected four Note actions`);
    const expectedLabels = ["Like", "Comment", "Save", "Share"];
    metrics.forEach((metric, index) => {
      assert(metric.height >= 54, `${browserName}/${width}: Note action ${index} visually too short (${metric.height})`);
      assert(metric.iconSize >= 19, `${browserName}/${width}: Note action ${index} icon too small (${metric.iconSize})`);
      assert(metric.label === expectedLabels[index], `${browserName}/${width}: Note action ${index} label is ${JSON.stringify(metric.label)}`);
    });

    const activity = page.locator(".notes-activity-button");
    const activityBox = await activity.evaluate((node) => node.getBoundingClientRect().toJSON());
    const activityLabel = await activity.evaluate((node) => getComputedStyle(node, "::after").content);
    assert(activityBox.width >= 42 && activityBox.width <= 46, `${browserName}/${width}: Activity control width outside compact contract (${activityBox.width})`);
    assert(activityBox.height >= 42 && activityBox.height <= 46, `${browserName}/${width}: Activity control height outside compact contract (${activityBox.height})`);
    assert(activityLabel === "none", `${browserName}/${width}: obsolete Activity pseudo-label is still painted (${activityLabel})`);

    await actions.nth(1).click();
    const input = page.getByRole("textbox", { name: "Write a comment" });
    await input.waitFor();
    const inputBox = await input.evaluate((node) => node.getBoundingClientRect().toJSON());
    const send = page.getByRole("button", { name: "Send", exact: true });
    const sendBox = await send.evaluate((node) => node.getBoundingClientRect().toJSON());
    const formBox = await page.locator(".replies-drawer > form").evaluate((node) => node.getBoundingClientRect().toJSON());

    assert(inputBox.height >= 46, `${browserName}/${width}: Comment field visually too short (${inputBox.height})`);
    assert(sendBox.height >= 46, `${browserName}/${width}: Comment Send control visually too short (${sendBox.height})`);
    assert(formBox.bottom <= height + 2, `${browserName}/${width}: Comment composer starts below the viewport (${formBox.bottom} vs ${height})`);
    await page.screenshot({ path: `${out}/${browserName}-${width}-notes-comments.png`, fullPage: false });

    await page.getByRole("button", { name: "Back to Notes" }).click();
    await page.getByRole("button", { name: "Search", exact: true }).last().click();
    await page.locator(".search-action-grid").waitFor();
    const searchState = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".search-action-grid > button")];
      const rects = cards.map((card) => {
        const box = card.getBoundingClientRect();
        return { top: box.top, left: box.left, right: box.right, bottom: box.bottom };
      });
      const descriptions = cards.map((card) => {
        const node = card.querySelector("small");
        if (!(node instanceof HTMLElement)) return null;
        return { whiteSpace: getComputedStyle(node).whiteSpace, text: node.textContent || "" };
      }).filter(Boolean);
      return { documentWidth: document.documentElement.scrollWidth, rects, descriptions };
    });
    assert(searchState.documentWidth <= width + 2, `${browserName}/${width}: Search creates horizontal overflow (${searchState.documentWidth})`);
    if (height <= 700 && searchState.rects.length >= 3) {
      assert(Math.abs(searchState.rects[0].top - searchState.rects[1].top) <= 2, `${browserName}/${width}: first two Search actions do not share a row`);
      assert(searchState.rects[2].top > searchState.rects[0].top + 2, `${browserName}/${width}: short-phone Search squeezes three actions into one row`);
      assert(searchState.descriptions.every((item) => item.whiteSpace !== "nowrap"), `${browserName}/${width}: Search descriptions are single-line clipped`);
    }
    await page.screenshot({ path: `${out}/${browserName}-${width}-search.png`, fullPage: false });

    report.cases.push({
      browserName,
      width,
      height,
      noteBefore,
      noteAfter,
      metrics,
      activityWidth: activityBox.width,
      inputHeight: inputBox.height,
      sendHeight: sendBox.height,
      searchState,
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

const enabledBrowsers = new Set((process.env.PROOF_BROWSERS || "chromium,webkit").split(",").map((value) => value.trim()).filter(Boolean));
for (const [browserName, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
  if (!enabledBrowsers.has(browserName)) continue;
  for (const [width, height] of [[360, 640], [390, 844]]) {
    try {
      await prove(browserType, browserName, width, height);
    } catch (error) {
      report.ok = false;
      report.errors.push(`${browserName}/${width}: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    }
  }
}

await writeFile(`${out}/mobile-touch-targets-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(report.errors.join("\n"));
  process.exit(1);
}
console.log(`Mobile touch/Notes/Search proof passed (${report.cases.length} cases).`);
