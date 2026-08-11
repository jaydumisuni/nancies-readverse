from pathlib import Path

path = Path("src/notverse/runtime-interaction-fix.ts")
text = path.read_text()

old_height = '''function viewportHeight(): number {
  return Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight));
}
'''
new_height = '''function viewportHeight(): number {
  return Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight));
}
'''
if old_height not in text:
    raise SystemExit("Expected viewportHeight implementation was not found")
text = text.replace(old_height, new_height, 1)

anchor = '''function syncInteractionState(): void {
  applyViewportMetrics();
  const chatOpen = Boolean(document.querySelector(".companion-panel.open"));
'''
replacement = '''function applyMobileChatGeometry(): void {
  const panel = document.querySelector<HTMLElement>(".companion-panel");
  if (!panel) return;

  const shouldBound = panel.classList.contains("open") && window.matchMedia("(max-width: 760px)").matches;
  if (!shouldBound) {
    for (const property of ["top", "bottom", "height", "max-height"]) {
      panel.style.removeProperty(property);
    }
    return;
  }

  const visualViewport = window.visualViewport;
  const viewportTop = Math.max(
    0,
    Math.min(window.innerHeight - 1, Math.round(visualViewport?.offsetTop || 0)),
  );
  const availableHeight = Math.max(
    1,
    Math.min(
      window.innerHeight - viewportTop,
      Math.round(visualViewport?.height || window.innerHeight),
    ) - 2,
  );

  panel.style.setProperty("top", `${viewportTop}px`, "important");
  panel.style.setProperty("bottom", "auto", "important");
  panel.style.setProperty("height", `${availableHeight}px`, "important");
  panel.style.setProperty("max-height", `${availableHeight}px`, "important");
}

function syncInteractionState(): void {
  applyViewportMetrics();
  applyMobileChatGeometry();
  const chatOpen = Boolean(document.querySelector(".companion-panel.open"));
'''
if anchor not in text:
    raise SystemExit("Expected syncInteractionState anchor was not found")
text = text.replace(anchor, replacement, 1)
path.write_text(text)

# A form control has an intrinsic minimum width in CSS Grid. At the compact
# tablet breakpoint that can make the middle chat track wider than the fixed
# companion panel even though the panel itself is inside the viewport. Keep the
# approved panel dimensions and only allow the composer field to shrink.
css_path = Path("src/notverse/production-polish.css")
css = css_path.read_text()
marker = "/* Compact companion composer must never overflow its panel. */"
if marker not in css:
    css += '''\n\n/* Compact companion composer must never overflow its panel. */
.companion-panel.open .chat-input {
  grid-template-columns: 34px minmax(0, 1fr) 38px;
  min-width: 0;
}
.companion-panel.open .chat-input input {
  min-width: 0;
  max-width: 100%;
}
'''
    css_path.write_text(css)
