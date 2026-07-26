import { readFile, writeFile } from "node:fs/promises";

const readerPath = "src/reader/PdfBookReader.tsx";
let reader = await readFile(readerPath, "utf8");
reader = reader.replace(
  `      const context = canvas.getContext("2d", { alpha: false });\n      if (!context) return;\n      renderTask = page.render({ canvas, canvasContext: context, viewport: renderViewport });`,
  `      renderTask = page.render({ canvas, viewport: renderViewport, background: "#ffffff" });`,
);
reader = reader.replace(
  `      const context = canvas.getContext("2d", { alpha: false });\n      if (!context) return;\n      task = page.render({ canvas, canvasContext: context, viewport });`,
  `      task = page.render({ canvas, viewport, background: "#ffffff" });`,
);
if (reader.includes("canvasContext: context")) throw new Error("Legacy PDF.js canvas context rendering remains");
await writeFile(readerPath, reader, "utf8");

const testPath = "scripts/verify-physical-reader.mjs";
let test = await readFile(testPath, "utf8");
test = test.replace(
  `await page.getByRole("button", { name: "Next page" }).click();`,
  `await page.locator(".physical-page-arrow.next").click();`,
);
test = test.replace(
  `await page.getByRole("button", { name: "Previous page" }).click();`,
  `await page.locator(".physical-page-arrow.previous").click();`,
);
await writeFile(testPath, test, "utf8");
console.log("Switched PDF.js to direct canvas rendering and made page-turn verification unambiguous.");
