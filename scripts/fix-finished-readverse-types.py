from pathlib import Path

path = Path("worker/platform.ts")
text = path.read_text()
old = '''  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));'''
new = '''  const encoded = new TextEncoder().encode(value);\n  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, encoded.buffer as ArrayBuffer);'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("encrypt target missing")
old = '''  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivPart) }, key, fromBase64(dataPart));'''
new = '''  const iv = fromBase64(ivPart);\n  const data = fromBase64(dataPart);\n  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, data.buffer as ArrayBuffer);'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("decrypt target missing")
path.write_text(text)
