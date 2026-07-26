import { readFile, writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const appPath = "src/App.tsx";
const app = await readFile(appPath, "utf8");
if (app.includes("type DiscoveryCandidate =")) {
  console.log("Guided discovery source is already materialised; transform skipped.");
  process.exit(0);
}

const sourcePath = "scripts/implement-guided-discovery.mjs";
let text = await readFile(sourcePath, "utf8");

function escapeRegion(startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`Transform marker not found: ${startMarker}`);
  const opening = text.indexOf("`", start) + 1;
  const closing = text.indexOf(endMarker, opening);
  if (opening <= 0 || closing < 0) throw new Error(`Transform boundary not found: ${startMarker}`);
  let body = text.slice(opening, closing);
  body = body.replaceAll("\\`", "__ESCAPED_TICK__").replaceAll("\\${", "__ESCAPED_EXPR__");
  body = body.replaceAll("\\", "\\\\");
  body = body.replaceAll("`", "\\`").replaceAll("${", "\\${");
  body = body.replaceAll("__ESCAPED_TICK__", "\\`").replaceAll("__ESCAPED_EXPR__", "\\${");
  text = text.slice(0, opening) + body + text.slice(closing);
}

escapeRegion("const newAskCompanion = `", "`;\n\napp = replaceRegex(app, /  async function askCompanion");
escapeRegion("app = replaceRegex(app, /  async function resolveSource", "`, \"guided source dialog\");");
escapeRegion("const discoveryComponents = `", "`;\napp = replaceOnce(app, `function CompanionPanel");
escapeRegion("const discoveryWorker = `", "`;\nworker = replaceOnce(worker, `async function resolveSourceRequest");
escapeRegion("styles += `", "`;\nawait writeFile(stylePath");

const helperStartMarker = "app = replaceOnce(app,\n`function isSourceFollowUp";
const helperEndMarker = '"discovery intent helpers");';
const helperStart = text.indexOf(helperStartMarker);
const helperEnd = text.indexOf(helperEndMarker, helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error("Discovery helper transform block was not found");
const helperReplacement = [
  "app = replaceRegex(app,",
  "/function isSourceFollowUp\\(value: string\\) \\{[\\s\\S]*?\\n\\}/,",
  "`function isSourceFollowUp(value: string) {",
  "  return /^(?:ok(?:ay)?[,.!]?\\\\s*)?(?:let me have it|lemme have it|open it|test it|try it|check it|read it|go ahead|proceed|yes|do it)[.!?]*$/i.test(value.trim());",
  "}",
  "",
  "function isPrepareFollowUp(value: string) {",
  "  return /^(?:ok(?:ay)?[,.!]?\\\\s*)?(?:prepare it|prepare to read|let me have it|lemme have it|go ahead|proceed|yes|do it)[.!?]*$/i.test(value.trim());",
  "}",
  "",
  "function looksLikeDiscoveryRequest(value: string) {",
  "  const clean = value.toLowerCase();",
  "  return /(?:help me find|find me|search for|looking for|trying to remember|can(?:not|'t) remember|what(?:'s| is) the (?:book|manga|comic|novel)|title of|book called)/i.test(clean)",
  "    || /\\\\b(book|manga|comic|novel|story|magazine)\\\\b.{0,80}\\\\b(about|where|with|called|remember|cover|character|author)\\\\b/i.test(clean);",
  "}`,",
  '"discovery intent helpers");',
].join("\n");
text = text.slice(0, helperStart) + helperReplacement + text.slice(helperEnd + helperEndMarker.length);

const oldFallback = `app = replaceOnce(app,
\`             <nav><button type="button" onClick={onFullscreen}><Icon name="expand" size={19} /></button></nav>\`,
\`             <nav><button type="button" className="reader-add-library" onClick={onAddToLibrary} disabled={inLibrary}>{inLibrary ? "✓ In Library" : "+ Add to Library"}</button><button type="button" onClick={onFullscreen}><Icon name="expand" size={19} /></button></nav>\`, "fallback library button");`;
const regexFallback = `app = replaceRegex(app,
/\\s*<nav><button type="button" onClick=\\{onFullscreen\\}><Icon name="expand" size=\\{19\\} \\/><\\/button><\\/nav>/,
\`             <nav><button type="button" className="reader-add-library" onClick={onAddToLibrary} disabled={inLibrary}>{inLibrary ? "✓ In Library" : "+ Add to Library"}</button><button type="button" onClick={onFullscreen}><Icon name="expand" size={19} /></button></nav>\`, "fallback library button");`;
if (!text.includes(oldFallback)) throw new Error("Fallback reader replacement block was not found");
text = text.replace(oldFallback, regexFallback);

const temporaryPath = path.resolve("scripts/.guided-discovery-materialise.mjs");
await writeFile(temporaryPath, text, "utf8");
try {
  await import(`${pathToFileURL(temporaryPath).href}?v=${Date.now()}`);
  console.log("Guided discovery source materialised for this build.");
} finally {
  await unlink(temporaryPath).catch(() => undefined);
}
