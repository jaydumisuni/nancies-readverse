import { readFile, writeFile } from "node:fs/promises";

const path = "src/App.tsx";
let source = await readFile(path, "utf8");

if (!source.includes('import PdfBookReader from "./reader/PdfBookReader";')) {
  source = source.replace(
    'import { avatarImages, type AvatarId } from "./avatars";',
    'import { avatarImages, type AvatarId } from "./avatars";\nimport PdfBookReader from "./reader/PdfBookReader";',
  );
}

source = source.replace(
  'note={notes["demo-reader"]?.text ?? ""}',
  'note={notes[readerSource?.id ?? "demo-reader"]?.text ?? ""}',
);
source = source.replace(
  'onNoteChange={saveNote}',
  'onNoteChange={(value) => saveNote(value, readerSource?.id ?? "demo-reader")}',
);
source = source.replace(
  'function saveNote(value: string) {\n    setNotes((current) => ({\n      ...current,\n      "demo-reader": {',
  'function saveNote(value: string, readerId = "demo-reader") {\n    setNotes((current) => ({\n      ...current,\n      [readerId]: {',
);

const start = source.indexOf('function ReaderModal({');
if (start < 0) throw new Error('ReaderModal was not found');

const replacement = `function ReaderModal({
  fullscreen,
  note,
  source,
  onClose,
  onFullscreen,
  onNoteChange,
}: {
  open: boolean;
  fullscreen: boolean;
  note: string;
  notesOpen: boolean;
  page: number;
  pageTurning: "next" | "previous" | null;
  readerRef: React.RefObject<HTMLDivElement>;
  source: ReaderSource | null;
  onClose: () => void;
  onFullscreen: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onNotes: () => void;
  onNoteChange: (value: string) => void;
  onCloseNotes: () => void;
}) {
  const activeSource: ReaderSource = source ?? {
    id: "demo-reader",
    title: "Nancy's ReadVerse Sample",
    url: "/fixtures/sample.pdf",
    format: "pdf",
  };

  if (activeSource.format.toLowerCase() !== "pdf") {
    return (
      <div className={\`reader-overlay \${fullscreen ? "is-fullscreen" : ""}\`}>
        <div className="reader-window document-fallback">
          <header className="reader-toolbar">
            <button type="button" onClick={onClose} aria-label="Close reader"><Icon name="close" size={22} /></button>
            <div><strong>{activeSource.title}</strong><small>Temporary {activeSource.format.toUpperCase()} session</small></div>
            <nav><button type="button" onClick={onFullscreen}><Icon name="expand" size={19} /></button></nav>
          </header>
          <div className="document-stage">
            <iframe className="reader-document" src={activeSource.url} title={activeSource.title} />
            <a className="document-open-link" href={activeSource.url} target="_blank" rel="noreferrer">Open the original file</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PdfBookReader
      sourceId={activeSource.id}
      sourceUrl={activeSource.url}
      title={activeSource.title}
      format={activeSource.format}
      fullscreen={fullscreen}
      note={note}
      onClose={onClose}
      onFullscreen={onFullscreen}
      onNoteChange={onNoteChange}
    />
  );
}
`;

source = source.slice(0, start) + replacement;
await writeFile(path, source, "utf8");
console.log("Installed the physical PDF reader without changing the dashboard layout.");
