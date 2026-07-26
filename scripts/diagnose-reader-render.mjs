import { readFile, writeFile } from "node:fs/promises";

const readerPath = "src/reader/PdfBookReader.tsx";
let reader = await readFile(readerPath, "utf8");
reader = reader.replace(
  `    })().catch(() => undefined);\n    return () => {\n      cancelled = true;\n      renderTask?.cancel();`,
  `    })().catch((error) => { console.error(\`ReadVerse PDF page \${pageNumber} render failed\`, error); });\n    return () => {\n      cancelled = true;\n      renderTask?.cancel();`,
);
reader = reader.replace(
  `    })().catch(() => undefined);\n    return () => { cancelled = true; task?.cancel(); };`,
  `    })().catch((error) => { console.error(\`ReadVerse PDF thumbnail \${pageNumber} render failed\`, error); });\n    return () => { cancelled = true; task?.cancel(); };`,
);
await writeFile(readerPath, reader, "utf8");

const testPath = "scripts/verify-physical-reader.mjs";
let test = await readFile(testPath, "utf8");
test = test.replaceAll(
  `page.getByRole("button", { name: /Notes/ })`,
  `page.locator(".reader-tools button").filter({ hasText: "Notes" })`,
);
await writeFile(testPath, test, "utf8");
console.log("Enabled PDF render diagnostics and scoped the Notes verification control.");
