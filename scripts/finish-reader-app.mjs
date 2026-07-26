import { readFile, writeFile } from "node:fs/promises";

const path = "src/App.tsx";
let source = await readFile(path, "utf8");

if (!source.includes("  readerRef,\n  source,")) {
  source = source.replace(
    "function ReaderModal({\n  fullscreen,\n  note,\n  source,",
    "function ReaderModal({\n  fullscreen,\n  note,\n  readerRef,\n  source,",
  );
}

if (!source.includes("      readerRef={readerRef}")) {
  source = source.replace(
    "      format={activeSource.format}\n      fullscreen={fullscreen}",
    "      format={activeSource.format}\n      fullscreen={fullscreen}\n      readerRef={readerRef}",
  );
}

if (!source.includes("  readerRef,\n  source,") || !source.includes("readerRef={readerRef}")) {
  throw new Error("Reader ref connection was not completed");
}

await writeFile(path, source, "utf8");
console.log("Connected the physical reader root to the existing fullscreen controller.");
