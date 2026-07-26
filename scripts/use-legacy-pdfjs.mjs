import { readFile, writeFile } from "node:fs/promises";

const path = "src/reader/PdfBookReader.tsx";
let source = await readFile(path, "utf8");
source = source.replace(
  `from "pdfjs-dist";`,
  `from "pdfjs-dist/legacy/build/pdf.mjs";`,
);
source = source.replace(
  `from "pdfjs-dist/build/pdf.worker.min.mjs?url";`,
  `from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";`,
);
if (!source.includes('pdfjs-dist/legacy/build/pdf.mjs') || !source.includes('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')) {
  throw new Error("PDF.js legacy browser build was not connected");
}
await writeFile(path, source, "utf8");
console.log("Switched the reader to PDF.js legacy browser assets for Android and older Chromium compatibility.");
