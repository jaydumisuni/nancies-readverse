import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import ePub from "epubjs";
import JSZip from "jszip";
import "./universal-reader.css";

export type ReaderActionStatus = "idle" | "working" | "done" | "error";

type Props = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  format: string;
  fullscreen: boolean;
  readerRef: React.RefObject<HTMLDivElement>;
  note: string;
  inLibrary: boolean;
  offlineStatus: ReaderActionStatus;
  driveStatus: ReaderActionStatus;
  onClose: () => void;
  onFullscreen: () => void;
  onNoteChange: (value: string) => void;
  onAddToLibrary: () => void;
  onSaveOffline: () => void;
  onSaveToDrive: () => void;
  onProgress: (progress: { page: number; totalPages: number; percent: number; mode: string }) => void;
};

type PageContent = { id: string; url?: string; text?: string };

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function splitText(value: string, target = 2300): PageContent[] {
  const paragraphs = value.replace(/\r/g, "").split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const pages: PageContent[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > target) {
      pages.push({ id: `text-${pages.length + 1}`, text: current });
      current = paragraph;
    } else {
      current += `${current ? "\n\n" : ""}${paragraph}`;
    }
  }
  if (current || !pages.length) pages.push({ id: `text-${pages.length + 1}`, text: current || "This document is empty." });
  return pages;
}

function actionLabel(kind: "offline" | "drive", status: ReaderActionStatus) {
  if (kind === "offline") return status === "working" ? "Saving offline…" : status === "done" ? "✓ Offline" : status === "error" ? "Retry offline" : "Save offline";
  return status === "working" ? "Saving to Drive…" : status === "done" ? "✓ In Drive" : status === "error" ? "Retry Drive" : "Save to Drive";
}

export default function UniversalReader({
  sourceId,
  sourceUrl,
  title,
  format,
  fullscreen,
  readerRef,
  note,
  inLibrary,
  offlineStatus,
  driveStatus,
  onClose,
  onFullscreen,
  onNoteChange,
  onAddToLibrary,
  onSaveOffline,
  onSaveToDrive,
  onProgress,
}: Props) {
  const normalisedFormat = format.toLowerCase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<PageContent[]>([]);
  const [page, setPage] = useState(() => Number(
    localStorage.getItem(`notverse.reader.${sourceId}.page`)
      || localStorage.getItem(`readverse.reader.${sourceId}.page`)
      || 1,
  ));
  const [notesOpen, setNotesOpen] = useState(false);
  const [manga, setManga] = useState(normalisedFormat === "cbz" && /manga|naruto|jujutsu|volume/i.test(title));
  const renditionHost = useRef<HTMLDivElement>(null);
  const rendition = useRef<any>(null);
  const book = useRef<any>(null);
  const objectUrls = useRef<string[]>([]);
  const [epubProgress, setEpubProgress] = useState({ page: 1, total: 1 });

  const totalPages = normalisedFormat === "epub" ? epubProgress.total : Math.max(1, pages.length);
  const activePage = normalisedFormat === "epub" ? epubProgress.page : Math.min(Math.max(1, page), totalPages);
  const percent = Math.round((activePage / Math.max(1, totalPages)) * 100);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setPages([]);
    async function load() {
      try {
        const response = await fetch(sourceUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`The file returned HTTP ${response.status}`);
        if (normalisedFormat === "txt") {
          const text = await response.text();
          if (!cancelled) setPages(splitText(text));
        } else if (normalisedFormat === "cbz") {
          const zip = await JSZip.loadAsync(await response.arrayBuffer());
          const entries = Object.values(zip.files)
            .filter((entry) => !entry.dir && /\.(png|jpe?g|webp|gif|avif)$/i.test(entry.name))
            .sort((a, b) => naturalSort(a.name, b.name));
          if (!entries.length) throw new Error("The CBZ archive contained no supported image pages");
          const loaded: PageContent[] = [];
          for (const entry of entries) {
            const blob = await entry.async("blob");
            const url = URL.createObjectURL(blob);
            objectUrls.current.push(url);
            loaded.push({ id: entry.name, url });
          }
          if (!cancelled) setPages(loaded);
        } else if (normalisedFormat === "epub") {
          const data = await response.arrayBuffer();
          if (cancelled || !renditionHost.current) throw new Error("The EPUB reading surface was not ready");
          const factory = ePub as unknown as (input: ArrayBuffer) => any;
          book.current = factory(data);
          rendition.current = book.current.renderTo(renditionHost.current, {
            width: "100%",
            height: "100%",
            flow: "paginated",
            spread: window.innerWidth > 820 ? "auto" : "none",
            manager: "default",
          });
          rendition.current.themes.default({
            body: { color: "#2a211d", background: "#fffdf7", "font-family": "Georgia, serif", "line-height": "1.65", padding: "4% 6%" },
            img: { "max-width": "100%", "max-height": "88vh", "object-fit": "contain" },
          });
          await rendition.current.display();
          await book.current.ready;
          await book.current.locations.generate(1200);
          rendition.current.on("relocated", (location: any) => {
            const displayed = location?.start?.displayed;
            const current = Number(displayed?.page || 1);
            const total = Number(displayed?.total || Math.max(1, book.current.locations.length()));
            setEpubProgress({ page: current, total });
          });
        } else {
          throw new Error(`The ${format.toUpperCase()} reader is not available`);
        }
        if (!cancelled) setLoading(false);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "NoTVerse could not open this file");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      rendition.current?.destroy?.();
      book.current?.destroy?.();
      rendition.current = null;
      book.current = null;
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current = [];
    };
  }, [format, normalisedFormat, sourceUrl, title]);

  useEffect(() => {
    localStorage.setItem(`notverse.reader.${sourceId}.page`, String(activePage));
    onProgress({ page: activePage, totalPages, percent, mode: normalisedFormat === "cbz" ? (manga ? "manga" : "comic") : normalisedFormat });
  }, [activePage, manga, normalisedFormat, onProgress, percent, sourceId, totalPages]);

  function turn(direction: "next" | "previous") {
    if (normalisedFormat === "epub") {
      const forward = manga ? direction === "previous" : direction === "next";
      void (forward ? rendition.current?.next?.() : rendition.current?.prev?.());
      return;
    }
    const delta = manga ? (direction === "next" ? -1 : 1) : (direction === "next" ? 1 : -1);
    setPage((current) => Math.min(totalPages, Math.max(1, current + delta)));
  }

  const visible = useMemo(() => pages[activePage - 1], [activePage, pages]);

  return (
    <div className={`reader-overlay universal-overlay ${fullscreen ? "is-fullscreen" : ""}`}>
      <div className="reader-window universal-window" ref={readerRef}>
        <header className="reader-toolbar universal-toolbar">
          <button type="button" onClick={onClose} aria-label="Close reader">×</button>
          <div><strong>{title}</strong><small>{format.toUpperCase()} · {activePage} / {totalPages}</small></div>
          <label className="universal-direction">{normalisedFormat === "cbz" && <><input type="checkbox" checked={manga} onChange={(event) => setManga(event.target.checked)} /> Manga RTL</>}</label>
          <nav>
            <button type="button" onClick={onAddToLibrary} disabled={inLibrary}>{inLibrary ? "✓ In Library" : "+ Add to Library"}</button>
            <button type="button" onClick={onSaveOffline} disabled={offlineStatus === "working" || offlineStatus === "done"}>{actionLabel("offline", offlineStatus)}</button>
            <button type="button" onClick={onSaveToDrive} disabled={driveStatus === "working" || driveStatus === "done"}>{actionLabel("drive", driveStatus)}</button>
            <button type="button" onClick={() => setNotesOpen((value) => !value)}>Notes</button>
            <button type="button" onClick={onFullscreen} aria-label="Fullscreen reader">⛶</button>
          </nav>
        </header>

        <main className={`universal-stage format-${normalisedFormat} ${manga ? "rtl" : "ltr"}`}>
          {loading && <div className="reader-loading">Preparing the physical {normalisedFormat === "cbz" ? "comic" : normalisedFormat} reader…</div>}
          {error && <div className="reader-error"><strong>NoTVerse could not open this file.</strong><span>{error}</span></div>}
          {!error && normalisedFormat === "epub" && <div className="epub-page" ref={renditionHost} />}
          {!loading && !error && normalisedFormat === "cbz" && visible?.url && <div className="comic-page"><img src={visible.url} alt={`Page ${activePage}`} /></div>}
          {!loading && !error && normalisedFormat === "txt" && <article className="text-book-page"><small>{title}</small>{visible?.text?.split(/\n\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}<b>{activePage}</b></article>}
          {!loading && !error && <><button className="universal-edge previous" type="button" onClick={() => turn("previous")} aria-label="Previous page" /><button className="universal-edge next" type="button" onClick={() => turn("next")} aria-label="Next page" /></>}
          {notesOpen && <aside className="universal-notes"><header><strong>My Note</strong><button type="button" onClick={() => setNotesOpen(false)} aria-label="Close Note">×</button></header><textarea value={note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onNoteChange(event.target.value)} placeholder="Write something worth remembering…" /><small>Saved with this title and included in Google sync.</small></aside>}
        </main>

        <footer className="reader-footer universal-footer"><button type="button" onClick={() => turn("previous")} aria-label="Previous page">←</button><span>{activePage} / {totalPages}</span><input type="range" min="1" max={totalPages} value={activePage} onChange={(event) => { if (normalisedFormat !== "epub") setPage(Number(event.target.value)); }} disabled={normalisedFormat === "epub"} /><span>{percent}%</span><button type="button" onClick={() => turn("next")} aria-label="Next page">→</button></footer>
      </div>
    </div>
  );
}
