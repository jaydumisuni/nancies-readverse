from pathlib import Path

path = Path("worker/platform.ts")
text = path.read_text()
start = text.index("async function encrypt")
end = text.index("function toBase64", start)
replacement = '''async function encrypt(value: string, secret: string): Promise<string> {
  const ivBuffer = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuffer);
  crypto.getRandomValues(iv);
  const secretBytes = new TextEncoder().encode(secret);
  const secretBuffer = new ArrayBuffer(secretBytes.byteLength);
  new Uint8Array(secretBuffer).set(secretBytes);
  const digest = await crypto.subtle.digest("SHA-256", secretBuffer);
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const encoded = new TextEncoder().encode(value);
  const plainBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(plainBuffer).set(encoded);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBuffer }, key, plainBuffer);
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string, secret: string): Promise<string> {
  const [ivPart, dataPart] = value.split(".");
  if (!ivPart || !dataPart) throw new Error("Invalid encrypted session");
  const secretBytes = new TextEncoder().encode(secret);
  const secretBuffer = new ArrayBuffer(secretBytes.byteLength);
  new Uint8Array(secretBuffer).set(secretBytes);
  const digest = await crypto.subtle.digest("SHA-256", secretBuffer);
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const ivBytes = fromBase64(ivPart);
  const ivBuffer = new ArrayBuffer(ivBytes.byteLength);
  new Uint8Array(ivBuffer).set(ivBytes);
  const dataBytes = fromBase64(dataPart);
  const dataBuffer = new ArrayBuffer(dataBytes.byteLength);
  new Uint8Array(dataBuffer).set(dataBytes);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuffer }, key, dataBuffer);
  return new TextDecoder().decode(decrypted);
}

'''
path.write_text(text[:start] + replacement + text[end:])
