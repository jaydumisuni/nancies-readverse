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

// Normalize archived UI tokens that are incompatible with the current build.
const appPath = resolve(root, "src/App.tsx");
let appSource = await readFile(appPath, "utf8");
const jsxMatchesBefore = appSource.match(/\bJSX\.Element\b/g)?.length ?? 0;
appSource = appSource.split("JSX.Element").join("React.ReactElement");
await writeFile(appPath, appSource, "utf8");

const avatarsPath = resolve(root, "src/avatars.ts");
let avatarsSource = await readFile(avatarsPath, "utf8");
const meiMatchesBefore = avatarsSource.match(/meiMei/g)?.length ?? 0;
avatarsSource = avatarsSource.split("meiMei").join("meimei");

// The generated Mei Mei data URI is valid but Chromium rejected it inline.
// Extract it into a normal static WebP asset and point the roster alias at it.
const avatarsDPath = resolve(root, "src/avatarsD.ts");
const avatarsDSource = await readFile(avatarsDPath, "utf8");
const meiDataMatch = avatarsDSource.match(/meimei:\s*"data:image\/webp;base64,([^"]+)"/);
if (!meiDataMatch) {
  throw new Error("Mei Mei avatar data was not found in src/avatarsD.ts");
}
const meiBytes = Buffer.from(meiDataMatch[1], "base64");
if (
  meiBytes.length < 1024 ||
  meiBytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
  meiBytes.subarray(8, 12).toString("ascii") !== "WEBP"
) {
  throw new Error("Mei Mei avatar data is not a valid WebP file");
}
const publicAvatarDirectory = resolve(root, "public/avatars");
await mkdir(publicAvatarDirectory, { recursive: true });
await writeFile(resolve(publicAvatarDirectory, "meimei.webp"), meiBytes);
avatarsSource = avatarsSource.replace(
  /mei:\s*groupD\.meimei/g,
  'mei: "/avatars/meimei.webp"',
);
await writeFile(avatarsPath, avatarsSource, "utf8");

// Re-read the written files so the build cannot continue with a silent no-op.
const verifiedApp = await readFile(appPath, "utf8");
const verifiedAvatars = await readFile(avatarsPath, "utf8");
if (verifiedApp.includes("JSX.Element")) {
  throw new Error("Hydration compatibility fix failed: JSX.Element remains in src/App.tsx");
}
if (verifiedAvatars.includes("meiMei")) {
  throw new Error("Hydration compatibility fix failed: meiMei remains in src/avatars.ts");
}
if (!verifiedAvatars.includes('mei: "/avatars/meimei.webp"')) {
  throw new Error("Hydration compatibility fix failed: Mei Mei static asset alias was not written");
}

console.log(
  `Hydrated ReadVerse UI from ${parts.length} payload parts; normalized ${jsxMatchesBefore} JSX type reference(s), ${meiMatchesBefore} Mei Mei alias(es), and extracted a ${meiBytes.length}-byte Mei Mei WebP asset.`,
);