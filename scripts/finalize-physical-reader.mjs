import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
}

const appPath = "src/App.tsx";
let app = await readFile(appPath, "utf8");
app = replaceOnce(
  app,
  `function ReaderModal({\n  fullscreen,\n  note,\n  source,`,
  `function ReaderModal({\n  fullscreen,\n  note,\n  readerRef,\n  source,`,
  "ReaderModal ref destructure",
);
app = replaceOnce(
  app,
  `      format={activeSource.format}\n      fullscreen={fullscreen}`,
  `      format={activeSource.format}\n      fullscreen={fullscreen}\n      readerRef={readerRef}`,
  "Reader ref prop",
);
await writeFile(appPath, app, "utf8");

const readerPath = "src/reader/PdfBookReader.tsx";
let reader = await readFile(readerPath, "utf8");
reader = replaceOnce(
  reader,
  `  fullscreen: boolean;\n  note: string;`,
  `  fullscreen: boolean;\n  readerRef: React.RefObject<HTMLDivElement>;\n  note: string;`,
  "Reader ref type",
);
reader = replaceOnce(
  reader,
  `  fullscreen,\n  note,`,
  `  fullscreen,\n  readerRef,\n  note,`,
  "Reader ref destructure",
);
reader = reader.replace(`  const stageRef = useRef<HTMLDivElement>(null);\n`, "");
reader = replaceOnce(
  reader,
  `  const [outline, setOutline] = useState<Array<{ title: string; page: number }>>([]);`,
  `  const [outline, setOutline] = useState<Array<{ title: string; page: number }>>([]);\n  const touchStart = useRef<number | null>(null);`,
  "Touch state",
);
reader = replaceOnce(
  reader,
  `        if (cancelled) {\n          await document.destroy();\n          return;\n        }`,
  `        if (cancelled) return;`,
  "Cancelled load cleanup",
);
reader = reader.replaceAll(
  `page.render({ canvasContext: context, viewport: renderViewport })`,
  `page.render({ canvas, canvasContext: context, viewport: renderViewport })`,
);
reader = reader.replaceAll(
  `page.render({ canvasContext: context, viewport })`,
  `page.render({ canvas, canvasContext: context, viewport })`,
);
reader = replaceOnce(
  reader,
  `<div className={\`pdf-reader experience-\${experience} \${fullscreen ? "is-fullscreen" : ""}\`} ref={stageRef}>`,
  `<div className={\`pdf-reader experience-\${experience} \${fullscreen ? "is-fullscreen" : ""}\`} ref={readerRef}>`,
  "Reader root ref",
);
reader = replaceOnce(
  reader,
  `<main className={\`physical-reader-stage turn-\${turning ?? "idle"}\`} data-direction={rtl ? "rtl" : "ltr"}>`,
  `<main\n          className={\`physical-reader-stage turn-\${turning ?? "idle"}\`}\n          data-direction={rtl ? "rtl" : "ltr"}\n          onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}\n          onTouchEnd={(event) => {\n            if (touchStart.current === null) return;\n            const end = event.changedTouches[0]?.clientX ?? touchStart.current;\n            const delta = end - touchStart.current;\n            if (Math.abs(delta) > 55) turn(delta < 0 ? "next" : "previous");\n            touchStart.current = null;\n          }}\n        >`,
  "Mobile swipe navigation",
);
await writeFile(readerPath, reader, "utf8");

const cssPath = "src/reader/pdf-book-reader.css";
let css = await readFile(cssPath, "utf8");
css = css.replaceAll('.pdf-reader[data-direction="rtl"]', '.physical-reader-stage[data-direction="rtl"]');
await writeFile(cssPath, css, "utf8");

console.log("Finalized PDF.js 6 rendering, fullscreen targeting, RTL controls and mobile swiping.");
