import { gunzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const payloadDirectory = resolve(root, ".bootstrap");
const parts = (await readdir(payloadDirectory))
  .filter((name) => name.startsWith("payload."))
  .sort();

if (parts.length === 0) {
  throw new Error("ReadVerse UI payload was not found");
}

const encoded = (
  await Promise.all(
    parts.map((name) => readFile(resolve(payloadDirectory, name), "utf8")),
  )
)
  .join("")
  .replace(/\s+/g, "");
const archive = gunzipSync(Buffer.from(encoded, "base64"));

function readString(buffer, start, length) {
  const value = buffer.subarray(start, start + length);
  const zero = value.indexOf(0);
  return value
    .subarray(0, zero === -1 ? value.length : zero)
    .toString("utf8");
}

for (let offset = 0; offset + 512 <= archive.length; ) {
  const header = archive.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) break;

  const rawName = readString(header, 0, 100);
  const prefix = readString(header, 345, 155);
  const name = `${prefix ? `${prefix}/` : ""}${rawName}`.replace(/^\.\//, "");
  const sizeText = readString(header, 124, 12).trim().replace(/\0/g, "");
  const size = Number.parseInt(sizeText || "0", 8);
  const type = String.fromCharCode(header[156] || 48);
  const dataStart = offset + 512;
  const dataEnd = dataStart + size;

  if (name && type !== "5") {
    const destination = resolve(root, name);
    if (destination !== root && !destination.startsWith(`${root}${sep}`)) {
      throw new Error(`Unsafe archive path: ${name}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, archive.subarray(dataStart, dataEnd));
  }

  offset = dataStart + Math.ceil(size / 512) * 512;
}

// Keep the archived UI compatible with the current React 19 type definitions.
const appPath = resolve(root, "src/App.tsx");
const appSource = await readFile(appPath, "utf8");
await writeFile(appPath, appSource.replace(/:\s*JSX\.Element/g, ""));

// The generated avatar-data key is `meimei`; normalize the hydrated alias.
const avatarsPath = resolve(root, "src/avatars.ts");
const avatarsSource = await readFile(avatarsPath, "utf8");
await writeFile(avatarsPath, avatarsSource.replace(/avatarData\.meiMei/g, "avatarData.meimei"));

console.log(`Hydrated ReadVerse UI from ${parts.length} payload parts and applied compatibility fixes.`);