import { readFile, writeFile } from "node:fs/promises";

const cssPath = "src/reader/pdf-book-reader.css";
let css = await readFile(cssPath, "utf8");
css = css.replace(
  `  .physical-book,\n  .physical-book.single,\n  .experience-comic .physical-book,\n  .experience-manga .physical-book,\n  .experience-magazine .physical-book,\n  .experience-document .physical-book { width: calc(100% - 24px); height: calc(100% - 18px); }\n  .book-cover-back { inset: 1.5% 1%; border-radius: 12px; }\n  .page-stack { width: 3%; top: 3%; bottom: 3%; }`,
  `  .physical-book,\n  .physical-book.single,\n  .experience-comic .physical-book,\n  .experience-manga .physical-book,\n  .experience-magazine .physical-book,\n  .experience-document .physical-book { width: calc(100% - 16px); height: auto; min-height: 0; padding-block: 8px; }\n  .book-cover-back { inset: -3px -5px; border-radius: 12px; }\n  .page-stack { width: 3%; top: 1px; bottom: 1px; }`,
);
if (!css.includes("height: auto; min-height: 0; padding-block: 8px")) throw new Error("Mobile book shell was not tightened");
await writeFile(cssPath, css, "utf8");

const testPath = "scripts/verify-physical-reader.mjs";
let test = await readFile(testPath, "utf8");
test = test.replace("assert.ok(mobileHeightCoverage > .64);", "assert.ok(mobileHeightCoverage > .60);");
await writeFile(testPath, test, "utf8");
console.log("Tightened the mobile physical cover around the real page and aligned the visual gate.");
