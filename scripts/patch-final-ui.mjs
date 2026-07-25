import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const appPath = resolve(root, "src/App.tsx");
let appSource = await readFile(appPath, "utf8");

const sideNavMarker = 'onClick={() => setActiveSection(id)}';
const sideNavReplacement = `onClick={() => {
                setActiveSection(id);
                if (id === "continue") setReaderOpen(true);
                if (id === "notes") {
                  setReaderOpen(true);
                  setNotesOpen(true);
                }
              }}`;

const sideNavMatches = appSource.split(sideNavMarker).length - 1;
if (sideNavMatches === 1) {
  appSource = appSource.replace(sideNavMarker, sideNavReplacement);
} else if (!appSource.includes('if (id === "continue") setReaderOpen(true);')) {
  throw new Error(`Expected one sidebar navigation handler, found ${sideNavMatches}`);
}
await writeFile(appPath, appSource, "utf8");

// The approved portrait was generated as PNG, not WebP. Read the embedded payload
// from the earlier patch file, validate its real signature, and install it correctly.
const legacyPatchPath = resolve(root, "scripts/patch-hydrated-ui.mjs");
const legacyPatchSource = await readFile(legacyPatchPath, "utf8");
const portraitMatch = legacyPatchSource.match(/const meiPortraitBase64 = "([A-Za-z0-9+/=]+)";/);
if (!portraitMatch) {
  throw new Error("Approved Mei Mei portrait payload was not found");
}

const portraitBytes = Buffer.from(portraitMatch[1], "base64");
const isPng = portraitBytes.length > 1024
  && portraitBytes[0] === 0x89
  && portraitBytes.subarray(1, 4).toString("ascii") === "PNG";
const isWebp = portraitBytes.length > 1024
  && portraitBytes.subarray(0, 4).toString("ascii") === "RIFF"
  && portraitBytes.subarray(8, 12).toString("ascii") === "WEBP";

if (!isPng && !isWebp) {
  throw new Error("Approved Mei Mei portrait payload is not a valid PNG or WebP image");
}

const extension = isPng ? "png" : "webp";
const publicAvatarDirectory = resolve(root, "public/avatars");
await mkdir(publicAvatarDirectory, { recursive: true });
await writeFile(resolve(publicAvatarDirectory, `meimei.${extension}`), portraitBytes);

const publicPath = `/avatars/meimei.${extension}`;
const avatarsPath = resolve(root, "src/avatars.ts");
let avatarsSource = await readFile(avatarsPath, "utf8");
avatarsSource = avatarsSource
  .replace(/mei:\s*groupD\.meimei/g, `mei: "${publicPath}"`)
  .replace(/mei:\s*avatarData\.meimei/g, `mei: "${publicPath}"`)
  .replace(/mei:\s*"\/avatars\/meimei\.(?:svg|webp|png)"/g, `mei: "${publicPath}"`);
await writeFile(avatarsPath, avatarsSource, "utf8");

const avatarsDPath = resolve(root, "src/avatarsD.ts");
let avatarsDSource = await readFile(avatarsDPath, "utf8");
avatarsDSource = avatarsDSource
  .replace(/meimei:\s*"data:image\/webp;base64,[^"]+"/, `meimei: "${publicPath}"`)
  .replace(/meimei:\s*"\/avatars\/meimei\.(?:svg|webp|png)"/, `meimei: "${publicPath}"`);
await writeFile(avatarsDPath, avatarsDSource, "utf8");

const verifiedAvatars = await readFile(avatarsPath, "utf8");
const verifiedAvatarsD = await readFile(avatarsDPath, "utf8");
if (!verifiedAvatars.includes(`mei: "${publicPath}"`)) {
  throw new Error("Approved Mei Mei portrait was not wired into src/avatars.ts");
}
if (!verifiedAvatarsD.includes(`meimei: "${publicPath}"`)) {
  throw new Error("Approved Mei Mei portrait was not wired into src/avatarsD.ts");
}

console.log(`Installed approved Mei Mei ${extension.toUpperCase()} portrait (${portraitBytes.length} bytes) and patched reader navigation.`);
