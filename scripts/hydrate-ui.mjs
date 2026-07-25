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

// Replace the corrupt generated Mei Mei WebP with a deterministic vector portrait.
const meiSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Mei Mei anime companion portrait">
  <defs>
    <radialGradient id="bg" cx="50%" cy="34%" r="72%"><stop offset="0" stop-color="#6ae8ff" stop-opacity=".32"/><stop offset=".48" stop-color="#59265f"/><stop offset="1" stop-color="#090910"/></radialGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#effcff"/><stop offset=".48" stop-color="#a9e9f4"/><stop offset="1" stop-color="#5b9fb1"/></linearGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffe8df"/><stop offset="1" stop-color="#d89491"/></linearGradient>
    <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#232332"/><stop offset="1" stop-color="#07070c"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" rx="52" fill="url(#bg)"/>
  <circle cx="256" cy="238" r="188" fill="none" stroke="#7be7ff" stroke-opacity=".25" stroke-width="4"/>
  <circle cx="256" cy="238" r="170" fill="none" stroke="#ff4fa3" stroke-opacity=".25" stroke-width="2" filter="url(#glow)"/>
  <path d="M112 474c18-112 81-151 145-151s128 39 145 151H112z" fill="url(#coat)"/>
  <path d="M177 324c15 51 38 76 79 76 42 0 65-25 80-76l-35-22h-90l-34 22z" fill="#d89996"/>
  <ellipse cx="255" cy="247" rx="105" ry="129" fill="url(#skin)"/>
  <path d="M143 249c-3-121 50-189 133-189 86 0 142 69 128 202-27-62-64-99-120-116-46 24-77 57-95 103l-46 0z" fill="url(#hair)"/>
  <path d="M170 105c34-43 111-63 166-25 34 24 54 62 58 111-39-47-83-71-137-74-35 0-63 12-87 34-14-16-13-31 0-46z" fill="#d8f7fb" opacity=".8"/>
  <path d="M286 86c-20 42-26 92-18 151 7 51 2 93-14 126 57-29 84-78 79-147-4-62-19-105-47-130z" fill="url(#hair)"/>
  <path d="M211 103c-35 45-54 103-53 173 1 47-10 84-34 110 52-8 87-48 96-119 8-64 5-119-9-164z" fill="#bceef5"/>
  <g fill="#a9e9f4" stroke="#5b9fb1" stroke-width="3">
    <ellipse cx="124" cy="198" rx="29" ry="31"/><ellipse cx="115" cy="249" rx="27" ry="29"/><ellipse cx="119" cy="297" rx="26" ry="28"/><ellipse cx="132" cy="342" rx="24" ry="26"/><ellipse cx="151" cy="382" rx="22" ry="24"/>
  </g>
  <path d="M182 225c22-17 45-17 67-1" fill="none" stroke="#5f3d52" stroke-width="6" stroke-linecap="round"/>
  <path d="M283 224c23-17 47-16 66 3" fill="none" stroke="#5f3d52" stroke-width="6" stroke-linecap="round"/>
  <ellipse cx="217" cy="246" rx="18" ry="12" fill="#f6ffff"/><ellipse cx="316" cy="246" rx="18" ry="12" fill="#f6ffff"/>
  <ellipse cx="219" cy="246" rx="8" ry="10" fill="#3e6d74"/><ellipse cx="314" cy="246" rx="8" ry="10" fill="#3e6d74"/>
  <circle cx="222" cy="243" r="3" fill="#fff"/><circle cx="317" cy="243" r="3" fill="#fff"/>
  <path d="M265 247c-6 27-5 43 8 48" fill="none" stroke="#bb7779" stroke-width="4" stroke-linecap="round"/>
  <path d="M225 319c22 17 55 18 79 0-26 7-53 7-79 0z" fill="#a54563"/>
  <path d="M224 319c24 7 54 7 80 0" fill="none" stroke="#ffd7dd" stroke-width="3"/>
  <path d="M200 364c29 19 78 23 113 0l23 110H175l25-110z" fill="#11111b"/>
  <path d="M205 367l51 46 54-46" fill="none" stroke="#69dff2" stroke-opacity=".45" stroke-width="3"/>
  <circle cx="407" cy="107" r="7" fill="#ff4fa3" filter="url(#glow)"/><circle cx="92" cy="118" r="5" fill="#79e9ff" filter="url(#glow)"/>
</svg>`;

const publicAvatarDirectory = resolve(root, "public/avatars");
await mkdir(publicAvatarDirectory, { recursive: true });
await writeFile(resolve(publicAvatarDirectory, "meimei.svg"), meiSvg, "utf8");

const avatarsDPath = resolve(root, "src/avatarsD.ts");
let avatarsDSource = await readFile(avatarsDPath, "utf8");
avatarsDSource = avatarsDSource.replace(
  /meimei:\s*"data:image\/webp;base64,[^"]+"/,
  'meimei: "/avatars/meimei.svg"',
);
await writeFile(avatarsDPath, avatarsDSource, "utf8");

avatarsSource = avatarsSource
  .replace(/mei:\s*groupD\.meimei/g, 'mei: "/avatars/meimei.svg"')
  .replace(/mei:\s*avatarData\.meimei/g, 'mei: "/avatars/meimei.svg"');
await writeFile(avatarsPath, avatarsSource, "utf8");

// Re-read the written files so the build cannot continue with a silent no-op.
const verifiedApp = await readFile(appPath, "utf8");
const verifiedAvatars = await readFile(avatarsPath, "utf8");
const verifiedAvatarsD = await readFile(avatarsDPath, "utf8");
if (verifiedApp.includes("JSX.Element")) {
  throw new Error("Hydration compatibility fix failed: JSX.Element remains in src/App.tsx");
}
if (verifiedAvatars.includes("meiMei")) {
  throw new Error("Hydration compatibility fix failed: meiMei remains in src/avatars.ts");
}
if (!verifiedAvatarsD.includes('meimei: "/avatars/meimei.svg"')) {
  throw new Error("Hydration compatibility fix failed: Mei Mei vector asset was not wired");
}

console.log(
  `Hydrated ReadVerse UI from ${parts.length} payload parts; normalized ${jsxMatchesBefore} JSX type reference(s), ${meiMatchesBefore} Mei Mei alias(es), and installed the verified Mei Mei vector avatar.`,
);