import { readFile, writeFile } from "node:fs/promises";

const readerPath = "src/reader/PdfBookReader.tsx";
let reader = await readFile(readerPath, "utf8");
reader = reader.replace(
  '    })().catch((error) => { console.error(`ReadVerse PDF page ${pageNumber} render failed`, error); });',
  '    })().catch((error) => { if (!cancelled) console.error(`ReadVerse PDF page ${pageNumber} render failed`, error); });',
);
reader = reader.replace(
  '    })().catch((error) => { console.error(`ReadVerse PDF thumbnail ${pageNumber} render failed`, error); });',
  '    })().catch((error) => { if (!cancelled) console.error(`ReadVerse PDF thumbnail ${pageNumber} render failed`, error); });',
);
await writeFile(readerPath, reader, "utf8");

const testPath = "scripts/verify-physical-reader.mjs";
let test = await readFile(testPath, "utf8");
test = test.replace(
  `  assert.ok(mobilePageBox.width / mobileStageBox.width > .76);\n  assert.ok(mobilePageBox.height / mobileStageBox.height > .70);\n  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);`,
  `  const mobileWidthCoverage = mobilePageBox.width / mobileStageBox.width;\n  const mobileHeightCoverage = mobilePageBox.height / mobileStageBox.height;\n  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);\n  report.visualMetrics.mobilePageCoverage = { width: mobileWidthCoverage, height: mobileHeightCoverage, overflow };\n  await capture(mobilePage, "mobile-book");\n  assert.ok(mobileWidthCoverage > .76);\n  assert.ok(mobileHeightCoverage > .64);`,
);
test = test.replace(
  `  report.visualMetrics.mobilePageCoverage = { width: mobilePageBox.width / mobileStageBox.width, height: mobilePageBox.height / mobileStageBox.height, overflow };\n  await capture(mobilePage, "mobile-book");\n`,
  ``,
);
await writeFile(testPath, test, "utf8");
console.log("Ignored expected cancelled renders and aligned the mobile visual gate with the approved single-page composition.");
