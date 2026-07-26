import { readFile, writeFile } from "node:fs/promises";

// Validation retry after switching to the compiled worker harness.
const path = "worker/index.ts";
let source = await readFile(path, "utf8");
const start = source.indexOf("const fallbackVoices: Record<string, (question: string) => string> = {");
const end = source.indexOf("\n\nexport default", start);
if (start < 0 || end < 0) throw new Error("Obsolete fallback voice block was not found");
source = source.slice(0, start) + source.slice(end + 2);
await writeFile(path, source, "utf8");
console.log("Removed the obsolete template fallback block.");
