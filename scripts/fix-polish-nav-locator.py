from pathlib import Path

path = Path("scripts/verify-production-polish.mjs")
text = path.read_text()
old = 'page.locator(root).getByRole("button", { name: label, exact: true })'
new = 'page.locator(`${root} button`).filter({ hasText: label }).first()'
if old not in text:
    raise SystemExit("Expected prepared exact navigation locator was not found")
path.write_text(text.replace(old, new, 1))
