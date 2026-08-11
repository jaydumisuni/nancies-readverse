from pathlib import Path

path = Path("worker/smart-companion.ts")
text = path.read_text()
old = "@cf/meta/llama-3.1-8b-instruct"
new = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
count = text.count(old)
if count == 0:
    raise SystemExit(0)
if count != 2:
    raise SystemExit(f"Expected exactly two legacy fallback model references, found {count}")
path.write_text(text.replace(old, new))
