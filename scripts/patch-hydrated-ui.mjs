import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appPath = resolve(process.cwd(), "src/App.tsx");
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
if (sideNavMatches !== 1) {
  throw new Error(
    `Expected one sidebar navigation handler, found ${sideNavMatches}. Refusing to build an unverified reader route.`,
  );
}

appSource = appSource.replace(sideNavMarker, sideNavReplacement);
await writeFile(appPath, appSource, "utf8");

const verified = await readFile(appPath, "utf8");
if (!verified.includes('if (id === "continue") setReaderOpen(true);')) {
  throw new Error("Reader navigation patch was not written");
}
if (!verified.includes('setNotesOpen(true);')) {
  throw new Error("Notes navigation patch was not written");
}

console.log("Patched hydrated sidebar navigation to open the reader and notes panel.");
