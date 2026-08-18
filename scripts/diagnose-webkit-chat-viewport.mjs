import { webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PROOF_URL || "http://127.0.0.1:4173";
const out = "engineering-evidence/webkit-chat-diagnose";
await mkdir(out, { recursive: true });

function preferences() {
  localStorage.setItem("notverse.preferences", JSON.stringify({
    setupComplete: true,
    noteFont: "handwritten",
    readingInterests: ["Manga", "Novels", "PDFs"],
    discoveryMethods: ["title", "memory", "link"],
  }));
}

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(preferences);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".floating-companion").click();
  await page.waitForTimeout(120);

  const input = page.locator(".companion-panel.open .chat-input input");
  await input.fill("diagnose keyboard viewport");
  await input.focus();
  await page.setViewportSize({ width: 390, height: 520 });
  await page.waitForFunction(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--notverse-mobile-vv-height").trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && Math.abs(value - 520) <= 3;
  }, null, { timeout: 3000 });
  await page.waitForTimeout(100);

  const evidence = await page.evaluate(() => {
    const panel = document.querySelector(".companion-panel.open");
    if (!(panel instanceof HTMLElement)) throw new Error("open companion panel missing");
    const rootStyle = getComputedStyle(document.documentElement);
    const panelStyle = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    const matches = [];
    let order = 0;

    const walk = (rules, href, media = "") => {
      for (const rule of Array.from(rules || [])) {
        order += 1;
        if (rule instanceof CSSMediaRule) {
          if (matchMedia(rule.conditionText).matches) walk(rule.cssRules, href, rule.conditionText);
          continue;
        }
        if (!(rule instanceof CSSStyleRule)) continue;
        let matched = false;
        try { matched = panel.matches(rule.selectorText); } catch { matched = false; }
        if (!matched) continue;
        const props = {};
        for (const name of ["position", "top", "right", "bottom", "left", "height", "min-height", "max-height", "transform", "display"]) {
          const value = rule.style.getPropertyValue(name);
          if (value) props[name] = { value: value.trim(), priority: rule.style.getPropertyPriority(name) };
        }
        if (Object.keys(props).length) matches.push({ order, href, media, selector: rule.selectorText, props });
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      try { walk(sheet.cssRules, sheet.href || "inline"); } catch {}
    }

    return {
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          offsetTop: window.visualViewport.offsetTop,
          offsetLeft: window.visualViewport.offsetLeft,
          scale: window.visualViewport.scale,
        } : null,
        documentClientWidth: document.documentElement.clientWidth,
        documentClientHeight: document.documentElement.clientHeight,
        mobileMedia: matchMedia("(max-width: 760px)").matches,
      },
      variables: {
        mobileVvHeight: rootStyle.getPropertyValue("--notverse-mobile-vv-height").trim(),
        viewportHeight: rootStyle.getPropertyValue("--notverse-viewport-height").trim(),
        mobileVvTop: rootStyle.getPropertyValue("--notverse-mobile-vv-top").trim(),
      },
      computed: {
        position: panelStyle.position,
        top: panelStyle.top,
        right: panelStyle.right,
        bottom: panelStyle.bottom,
        left: panelStyle.left,
        width: panelStyle.width,
        height: panelStyle.height,
        minHeight: panelStyle.minHeight,
        maxHeight: panelStyle.maxHeight,
        display: panelStyle.display,
        transform: panelStyle.transform,
      },
      rect: {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      inlineStyle: panel.getAttribute("style"),
      matchingGeometryRules: matches,
    };
  });

  console.log(JSON.stringify(evidence, null, 2));
  await writeFile(`${out}/webkit-chat-viewport.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${out}/webkit-chat-viewport.png`, fullPage: false });
} finally {
  await context.close();
  await browser.close();
}
