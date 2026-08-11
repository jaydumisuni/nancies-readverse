from pathlib import Path

path = Path("scripts/verify-production-polish.mjs")
text = path.read_text()

# Make navigation assertions target the exact six-tab labels rather than
# accidentally matching nested/partial button text.
old_nav = 'page.locator(`${root} button`).filter({ hasText: label })'
new_nav = 'page.locator(root).getByRole("button", { name: label, exact: true })'
if old_nav in text:
    text = text.replace(old_nav, new_nav, 1)

# Local browser proof uses deterministic catalogue responses so it validates the
# UI and interaction contract without depending on external network timing.
start_marker = '  await page.route("**/api/discovery/search", async (route) => {'
end_marker = '  await page.route("**/api/companion/help", async (route) => {'
start = text.find(start_marker)
end = text.find(end_marker, start + 1)
if start < 0 or end < 0:
    raise SystemExit("Expected deterministic discovery route was not found")

discovery_route = '''  await page.route("**/api/discovery/search", async (route) => {
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
'''
text = text[:start] + discovery_route + text[end:]

# A raw getBoundingClientRect overlap check misclassifies controls that are
# geometrically below the fold but clipped by a scroll viewport. This version
# computes each control's actually painted rectangle after viewport/overflow
# clipping. It still fails if a usable control is really drawn beneath nav.
fn_start = text.find('async function assertNoNavigationOverlap(page, label) {')
if fn_start < 0:
    raise SystemExit("Expected mobile navigation overlap assertion was not found")
fn_end = text.find('\n}\n\n', fn_start)
if fn_end < 0:
    raise SystemExit("Could not determine overlap assertion boundary")
fn_end += 3

replacement = '''async function assertNoNavigationOverlap(page, label) {
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
}'''

text = text[:fn_start] + replacement + text[fn_end:]
path.write_text(text)
