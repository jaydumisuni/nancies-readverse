import { readFile, writeFile } from "node:fs/promises";

const path = "src/App.tsx";
let source = await readFile(path, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  'import { FormEvent, useMemo, useRef, useState, type CSSProperties } from "react";',
  'import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";',
  "React useEffect import",
);

replaceOnce(
  '  const [highlighted, setHighlighted] = useState(true);\n  const fileRef',
  '  const [highlighted, setHighlighted] = useState(true);\n  const [readerUrl, setReaderUrl] = useState<string | null>(null);\n  const [readerTitle, setReaderTitle] = useState("Thorny Crown");\n  const fileRef',
  "reader state",
);

replaceOnce(
  '  const appStyle = { "--accent": theme.accent, "--accent2": theme.accent2, "--ring": ring } as CSSProperties;\n\n  function openSettings',
  '  const appStyle = { "--accent": theme.accent, "--accent2": theme.accent2, "--ring": ring } as CSSProperties;\n\n  useEffect(() => () => { if (readerUrl) URL.revokeObjectURL(readerUrl); }, [readerUrl]);\n\n  function openSettings',
  "object URL cleanup",
);

replaceOnce(
`    if (attachedFile) {
      const name = attachedFile.name;
      setAttachedFile(null);
      setMessages((current) => [...current, { role: "companion", text: \`${'${name}'} is ready for this reading session. Open it now, then decide whether it deserves a permanent place in Drive.\` }]);
      return;
    }`,
`    if (attachedFile) {
      const file = attachedFile;
      const name = file.name;
      const nextUrl = URL.createObjectURL(file);
      setReaderUrl((current) => { if (current) URL.revokeObjectURL(current); return nextUrl; });
      setReaderTitle(name);
      setAttachedFile(null);
      setReaderOpen(true);
      setMessages((current) => [...current, { role: "companion", text: \`${'${name}'} is open in a temporary reading session. No copy was uploaded to Cloudflare. Google Drive is not connected yet, so it will disappear when this session ends unless you choose to save it later.\` }]);
      return;
    }`,
  "temporary local reader",
);

replaceOnce(
  '<ReaderOverlay open={readerOpen} refEl={readerRef} page={page}',
  '<ReaderOverlay open={readerOpen} refEl={readerRef} sourceUrl={readerUrl} title={readerTitle} page={page}',
  "reader props",
);

replaceOnce(
  'function ReaderOverlay({ open, refEl, page, note, notesOpen, highlighted, onClose, onTurn, onFullscreen, onNotes, onCloseNotes, onNote, onHighlight }: { open: boolean; refEl: React.RefObject<HTMLDivElement | null>; page: number;',
  'function ReaderOverlay({ open, refEl, sourceUrl, title, page, note, notesOpen, highlighted, onClose, onTurn, onFullscreen, onNotes, onCloseNotes, onNote, onHighlight }: { open: boolean; refEl: React.RefObject<HTMLDivElement | null>; sourceUrl: string | null; title: string; page: number;',
  "reader signature",
);

replaceOnce(
  '<div className="title"><strong>Thorny Crown</strong><small>Chapter 15 · Faint Light in the Rain</small></div>',
  '<div className="title"><strong>{title}</strong><small>{sourceUrl ? "Temporary local reading session" : "Chapter 15 · Faint Light in the Rain"}</small></div>',
  "reader title",
);

replaceOnce(
  '<div className="reader-window"><div className="book-spread">',
  '<div className="reader-window">{sourceUrl ? <iframe className="pdf-frame" src={sourceUrl} title={title} /> : <div className="book-spread">',
  "reader frame start",
);

replaceOnce(
  '<button className="page-edge next" onClick={() => onTurn(1)} /></div></div>\n    <footer className="reader-footer">',
  '<button className="page-edge next" onClick={() => onTurn(1)} /></div>}\n    </div>\n    <footer className="reader-footer">',
  "reader frame end",
);

await writeFile(path, source, "utf8");
console.log("Approved reader upgrade applied.");
