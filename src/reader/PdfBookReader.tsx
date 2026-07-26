import { ChangeEvent, MouseEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./pdf-book-reader.css";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type ReaderExperience = "auto" | "book" | "comic" | "manga" | "magazine" | "document";
type ReaderPanel = "contents" | "thumbnails" | "bookmarks" | "highlights" | "notes" | null;
type TurnDirection = "next" | "previous" | null;

type HighlightRect = { left: number; top: number; width: number; height: number };
type Highlight = {
  id: string;
  page: number;
  color: string;
  rects: HighlightRect[];
  text: string;
  note: string;
  createdAt: string;
};

type Bookmark = { page: number; label: string };
type SelectionDraft = { page: number; rects: HighlightRect[]; text: string };
type AreaDraft = { page: number; rect: HighlightRect };

type Props = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  format: string;
  fullscreen: boolean;
  readerRef: React.RefObject<HTMLDivElement>;
  note: string;
  onClose: () => void;
  onFullscreen: () => void;
  onNoteChange: (value: string) => void;
};

const highlightColors = ["#f5c95b", "#78d7a7", "#ff8eb9", "#73aef8", "#b68cff"];

function storageKey(sourceId: string, suffix: string) {
  return `readverse.reader.${sourceId}.${suffix}`;
}

function readSessionValue<T>(key: string, fallback: T): T {
  try {
    const value = sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normaliseTitle(value: string) {
  return value.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ").trim();
}

function experienceLabel(mode: ReaderExperience) {
  return mode === "auto" ? "Auto" : mode[0].toUpperCase() + mode.slice(1);
}

function detectExperience(title: string, samples: Array<{ width: number; height: number; textItems: number }>): Exclude<ReaderExperience, "auto"> {
  const lower = title.toLowerCase();
  if (/manga|naruto|jujutsu|jjk|shonen|volume\s*\d+/i.test(lower)) return "manga";
  if (/comic|issue|graphic novel|marvel|dc comics/i.test(lower)) return "comic";
  if (/magazine|vogue|travel|catalogue|catalog/i.test(lower)) return "magazine";
  if (/manual|report|document|form|guide|paper|invoice|statement/i.test(lower)) return "document";
  if (!samples.length) return "book";
  const averageText = samples.reduce((sum, item) => sum + item.textItems, 0) / samples.length;
  const averageRatio = samples.reduce((sum, item) => sum + item.width / item.height, 0) / samples.length;
  if (averageRatio > 1.08) return "magazine";
  if (averageText < 18) return "comic";
  return "book";
}

export default function PdfBookReader({
  sourceId,
  sourceUrl,
  title,
  format,
  fullscreen,
  readerRef,
  note,
  onClose,
  onFullscreen,
  onNoteChange,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(() => readSessionValue(storageKey(sourceId, "page"), 1));
  const [zoom, setZoom] = useState(1);
  const [requestedExperience, setRequestedExperience] = useState<ReaderExperience>(() => readSessionValue(storageKey(sourceId, "experience"), "auto"));
  const [detectedExperience, setDetectedExperience] = useState<Exclude<ReaderExperience, "auto">>("book");
  const [panel, setPanel] = useState<ReaderPanel>(null);
  const [turning, setTurning] = useState<TurnDirection>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 760);
  const [highlightColor, setHighlightColor] = useState(highlightColors[0]);
  const [highlights, setHighlights] = useState<Highlight[]>(() => readSessionValue(storageKey(sourceId, "highlights"), []));
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => readSessionValue(storageKey(sourceId, "bookmarks"), []));
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [areaDraft, setAreaDraft] = useState<AreaDraft | null>(null);
  const [areaMode, setAreaMode] = useState(false);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ page: number; preview: string }>>([]);
  const [outline, setOutline] = useState<Array<{ title: string; page: number }>>([]);
  const touchStart = useRef<number | null>(null);

  const experience = requestedExperience === "auto" ? detectedExperience : requestedExperience;
  const rtl = experience === "manga";
  const spread = !isMobile && (experience === "book" || experience === "magazine") && (pdf?.numPages ?? 0) > 1;
  const step = spread ? 2 : 1;
  const normalisedPage = spread && page % 2 === 0 ? Math.max(1, page - 1) : page;
  const visiblePages = useMemo(() => {
    if (!pdf) return [];
    const first = clamp(normalisedPage, 1, pdf.numPages);
    if (!spread) return [first];
    const second = first + 1;
    return second <= pdf.numPages ? [first, second] : [first];
  }, [normalisedPage, pdf, spread]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setPdf(null);
    const task = getDocument({ url: sourceUrl, cMapPacked: true, useWorkerFetch: true });
    task.promise
      .then(async (document) => {
        if (cancelled) return;
        setPdf(document);
        setPage((current) => clamp(current, 1, document.numPages));
        const sampleCount = Math.min(document.numPages, 3);
        const samples: Array<{ width: number; height: number; textItems: number }> = [];
        for (let index = 1; index <= sampleCount; index += 1) {
          const samplePage = await document.getPage(index);
          const viewport = samplePage.getViewport({ scale: 1 });
          const text = await samplePage.getTextContent();
          samples.push({ width: viewport.width, height: viewport.height, textItems: text.items.length });
        }
        setDetectedExperience(detectExperience(title, samples));
        const rawOutline = await document.getOutline();
        if (rawOutline?.length) {
          const entries: Array<{ title: string; page: number }> = [];
          for (const item of rawOutline.slice(0, 80)) {
            try {
              const destination = typeof item.dest === "string" ? await document.getDestination(item.dest) : item.dest;
              const reference = Array.isArray(destination) ? destination[0] : null;
              if (reference && typeof reference === "object") {
                const index = await document.getPageIndex(reference);
                entries.push({ title: item.title || `Page ${index + 1}`, page: index + 1 });
              }
            } catch {
              // Some PDFs contain broken outline destinations; the reader remains usable.
            }
          }
          setOutline(entries);
        } else {
          setOutline([]);
        }
        setLoading(false);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "ReadVerse could not render this PDF.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [sourceUrl, title]);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    sessionStorage.setItem(storageKey(sourceId, "page"), JSON.stringify(page));
  }, [page, sourceId]);

  useEffect(() => {
    sessionStorage.setItem(storageKey(sourceId, "experience"), JSON.stringify(requestedExperience));
  }, [requestedExperience, sourceId]);

  useEffect(() => {
    sessionStorage.setItem(storageKey(sourceId, "highlights"), JSON.stringify(highlights));
  }, [highlights, sourceId]);

  useEffect(() => {
    sessionStorage.setItem(storageKey(sourceId, "bookmarks"), JSON.stringify(bookmarks));
  }, [bookmarks, sourceId]);

  const goToPage = useCallback((nextPage: number) => {
    if (!pdf) return;
    const clamped = clamp(nextPage, 1, pdf.numPages);
    setPage(spread && clamped % 2 === 0 ? Math.max(1, clamped - 1) : clamped);
    setSelectionDraft(null);
    setAreaDraft(null);
  }, [pdf, spread]);

  const turn = useCallback((direction: Exclude<TurnDirection, null>) => {
    if (!pdf || turning) return;
    setTurning(direction);
    window.setTimeout(() => {
      const logicalDirection = rtl ? (direction === "next" ? -1 : 1) : (direction === "next" ? 1 : -1);
      goToPage(page + logicalDirection * step);
      setTurning(null);
    }, 360);
  }, [goToPage, page, pdf, rtl, step, turning]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") turn(rtl ? "previous" : "next");
      if (event.key === "ArrowLeft") turn(rtl ? "next" : "previous");
      if (event.key === "Escape" && !fullscreen) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, onClose, rtl, turn]);

  function addHighlight(draft: SelectionDraft | AreaDraft, color: string) {
    const rects = "rects" in draft ? draft.rects : [draft.rect];
    const text = "text" in draft ? draft.text : "Area highlight";
    const item: Highlight = {
      id: `highlight-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      page: draft.page,
      color,
      rects,
      text,
      note: "",
      createdAt: new Date().toISOString(),
    };
    setHighlights((current) => [...current, item]);
    setActiveHighlightId(item.id);
    setPanel("highlights");
    setSelectionDraft(null);
    setAreaDraft(null);
    window.getSelection()?.removeAllRanges();
  }

  function toggleBookmark() {
    const target = visiblePages[0] ?? page;
    setBookmarks((current) => {
      if (current.some((item) => item.page === target)) return current.filter((item) => item.page !== target);
      return [...current, { page: target, label: `Page ${target}` }].sort((a, b) => a.page - b.page);
    });
  }

  async function searchDocument(event?: React.FormEvent) {
    event?.preventDefault();
    if (!pdf || !searchValue.trim() || searching) return;
    setSearching(true);
    const query = searchValue.trim().toLowerCase();
    const matches: Array<{ page: number; preview: string }> = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const currentPage = await pdf.getPage(index);
      const content = await currentPage.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
      const position = text.toLowerCase().indexOf(query);
      if (position >= 0) {
        matches.push({ page: index, preview: text.slice(Math.max(0, position - 45), position + query.length + 70) });
        if (matches.length >= 80) break;
      }
    }
    setSearchResults(matches);
    setPanel("contents");
    setSearching(false);
  }

  const activeHighlight = highlights.find((item) => item.id === activeHighlightId) ?? null;
  const bookmarked = bookmarks.some((item) => visiblePages.includes(item.page));
  const progress = pdf ? Math.round(((visiblePages[0] ?? 1) / pdf.numPages) * 100) : 0;
  const titleText = normaliseTitle(title) || "Untitled PDF";

  return (
    <div className={`pdf-reader experience-${experience} ${fullscreen ? "is-fullscreen" : ""}`} ref={readerRef}>
      <header className="pdf-reader-toolbar">
        <button type="button" className="reader-back" onClick={onClose} aria-label="Close reader">←</button>
        <div className="reader-title-block">
          <strong>{titleText}</strong>
          <small>{loading ? "Opening the book…" : error ? "Could not open" : `${experienceLabel(experience)} mode · ${pdf?.numPages ?? 0} pages · Temporary ${format.toUpperCase()} session`}</small>
        </div>
        <label className="experience-select">
          <span>Feel</span>
          <select value={requestedExperience} onChange={(event: ChangeEvent<HTMLSelectElement>) => setRequestedExperience(event.target.value as ReaderExperience)}>
            <option value="auto">Auto ({experienceLabel(detectedExperience)})</option>
            <option value="book">Book</option>
            <option value="comic">Comic</option>
            <option value="manga">Manga</option>
            <option value="magazine">Magazine</option>
            <option value="document">Document</option>
          </select>
        </label>
        <div className="reader-page-counter">
          <button type="button" onClick={() => turn("previous")} aria-label="Previous page">−</button>
          <span>{visiblePages.length > 1 ? `${visiblePages[0]}–${visiblePages.at(-1)}` : visiblePages[0] ?? 1} / {pdf?.numPages ?? "—"}</span>
          <button type="button" onClick={() => turn("next")} aria-label="Next page">+</button>
        </div>
        <form className="reader-search" onSubmit={searchDocument}>
          <input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Search" aria-label="Search document" />
          <button type="submit" disabled={searching}>{searching ? "…" : "⌕"}</button>
        </form>
        <div className="reader-zoom">
          <button type="button" onClick={() => setZoom((current) => clamp(Number((current - .1).toFixed(2)), .65, 2.4))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((current) => clamp(Number((current + .1).toFixed(2)), .65, 2.4))}>+</button>
        </div>
        <button type="button" className="reader-fullscreen" onClick={onFullscreen} aria-label="Toggle fullscreen">⛶</button>
      </header>

      <div className={`reader-workspace ${panel ? "with-panel" : ""}`}>
        {panel && (
          <aside className="reader-side-panel">
            <header>
              <strong>{panel === "contents" && (searchResults.length ? "Search results" : "Contents")}{panel === "thumbnails" && "Thumbnails"}{panel === "bookmarks" && "Bookmarks"}{panel === "highlights" && "Highlights"}{panel === "notes" && "Notes"}</strong>
              <button type="button" onClick={() => setPanel(null)}>×</button>
            </header>
            <div className="reader-side-scroll">
              {panel === "contents" && (
                <>
                  {searchResults.length > 0 ? searchResults.map((result) => (
                    <button type="button" className="outline-item" key={`${result.page}-${result.preview}`} onClick={() => goToPage(result.page)}>
                      <b>Page {result.page}</b><span>{result.preview}</span>
                    </button>
                  )) : outline.length ? outline.map((item) => (
                    <button type="button" className="outline-item" key={`${item.page}-${item.title}`} onClick={() => goToPage(item.page)}>
                      <b>{item.title}</b><span>Page {item.page}</span>
                    </button>
                  )) : <p className="empty-panel">This PDF has no table of contents. Use thumbnails or search.</p>}
                </>
              )}
              {panel === "thumbnails" && pdf && Array.from({ length: pdf.numPages }, (_, index) => (
                <Thumbnail key={index + 1} pdf={pdf} pageNumber={index + 1} active={visiblePages.includes(index + 1)} onOpen={() => goToPage(index + 1)} />
              ))}
              {panel === "bookmarks" && (
                <>
                  <button type="button" className="bookmark-current" onClick={toggleBookmark}>
                    {bookmarked ? "Remove ribbon from this page" : "Add ribbon to this page"}
                  </button>
                  {bookmarks.length ? bookmarks.map((item) => (
                    <button type="button" className="outline-item" key={item.page} onClick={() => goToPage(item.page)}>
                      <b>Ribbon bookmark</b><span>Page {item.page}</span>
                    </button>
                  )) : <p className="empty-panel">Place a ribbon bookmark on a page and it will appear here.</p>}
                </>
              )}
              {panel === "highlights" && (
                <>
                  {highlights.length ? highlights.map((item) => (
                    <button type="button" className={`highlight-list-item ${activeHighlightId === item.id ? "active" : ""}`} key={item.id} onClick={() => { setActiveHighlightId(item.id); goToPage(item.page); }}>
                      <i style={{ background: item.color }} /><span><b>Page {item.page}</b><small>{item.text || "Area highlight"}</small></span>
                    </button>
                  )) : <p className="empty-panel">Select text or turn on area highlighter, then choose a marker colour.</p>}
                  {activeHighlight && (
                    <div className="highlight-note-editor">
                      <label>Note for this highlight<textarea value={activeHighlight.note} onChange={(event) => setHighlights((current) => current.map((item) => item.id === activeHighlight.id ? { ...item, note: event.target.value } : item))} placeholder="Why did this matter?" /></label>
                      <button type="button" onClick={() => { setHighlights((current) => current.filter((item) => item.id !== activeHighlight.id)); setActiveHighlightId(null); }}>Delete highlight</button>
                    </div>
                  )}
                </>
              )}
              {panel === "notes" && (
                <label className="document-note">My reading note<textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Write something worth remembering…" /><small>Saved for this session. Google Drive sync will replace local persistence when accounts are connected.</small></label>
              )}
            </div>
          </aside>
        )}

        <main
          className={`physical-reader-stage turn-${turning ?? "idle"}`}
          data-direction={rtl ? "rtl" : "ltr"}
          onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            if (touchStart.current === null) return;
            const end = event.changedTouches[0]?.clientX ?? touchStart.current;
            const delta = end - touchStart.current;
            if (Math.abs(delta) > 55) turn(delta < 0 ? "next" : "previous");
            touchStart.current = null;
          }}
        >
          <div className="reader-ambience" />
          {loading && <div className="reader-loading"><span /><p>Opening the real pages…</p></div>}
          {error && <div className="reader-error"><strong>This PDF could not be rendered.</strong><p>{error}</p><a href={sourceUrl} target="_blank" rel="noreferrer">Open the original file</a></div>}
          {!loading && !error && pdf && (
            <>
              <button type="button" className="physical-page-arrow previous" onClick={() => turn("previous")} aria-label="Previous page">‹</button>
              <div className={`physical-book ${spread ? "spread" : "single"}`}>
                <div className="book-cover-back" />
                <div className="page-stack page-stack-left" />
                <div className="page-stack page-stack-right" />
                <div className="physical-pages">
                  {visiblePages.map((pageNumber, index) => (
                    <PdfPage
                      key={`${pageNumber}-${zoom}`}
                      pdf={pdf}
                      pageNumber={pageNumber}
                      zoom={zoom}
                      side={spread ? (index === 0 ? "left" : "right") : "single"}
                      experience={experience}
                      highlights={highlights.filter((item) => item.page === pageNumber)}
                      activeHighlightId={activeHighlightId}
                      areaMode={areaMode}
                      onSelection={setSelectionDraft}
                      onArea={setAreaDraft}
                      onHighlightClick={(id) => { setActiveHighlightId(id); setPanel("highlights"); }}
                    />
                  ))}
                  {spread && <div className="book-gutter" />}
                  <div className="page-turn-sheet" />
                </div>
              </div>
              <button type="button" className="physical-page-arrow next" onClick={() => turn("next")} aria-label="Next page">›</button>
            </>
          )}
        </main>
      </div>

      {(selectionDraft || areaDraft) && (
        <div className="selection-toolbar">
          <span>{selectionDraft ? "Highlight selected passage" : "Highlight selected area"}</span>
          {highlightColors.map((color) => <button type="button" aria-label={`Highlight ${color}`} key={color} style={{ background: color }} onClick={() => addHighlight(selectionDraft ?? areaDraft!, color)} />)}
          <button type="button" className="selection-cancel" onClick={() => { setSelectionDraft(null); setAreaDraft(null); window.getSelection()?.removeAllRanges(); }}>×</button>
        </div>
      )}

      <footer className="pdf-reader-footer">
        <div className="reader-tools">
          <button type="button" className={panel === "contents" ? "active" : ""} onClick={() => setPanel(panel === "contents" ? null : "contents")}><span>☷</span>Contents</button>
          <button type="button" className={panel === "thumbnails" ? "active" : ""} onClick={() => setPanel(panel === "thumbnails" ? null : "thumbnails")}><span>▦</span>Thumbnails</button>
          <button type="button" className={panel === "bookmarks" || bookmarked ? "active" : ""} onClick={() => setPanel(panel === "bookmarks" ? null : "bookmarks")}><span>♧</span>Bookmark</button>
          <button type="button" className={panel === "highlights" ? "active" : ""} onClick={() => setPanel(panel === "highlights" ? null : "highlights")}><span>✎</span>Highlights</button>
          <button type="button" className={panel === "notes" ? "active" : ""} onClick={() => setPanel(panel === "notes" ? null : "notes")}><span>▤</span>Notes</button>
          <button type="button" className={areaMode ? "active" : ""} onClick={() => setAreaMode((current) => !current)}><span>▱</span>Area marker</button>
        </div>
        <div className="reader-progress">
          <span>{visiblePages[0] ?? 1}</span>
          <input type="range" min="1" max={pdf?.numPages ?? 1} value={visiblePages[0] ?? 1} onChange={(event) => goToPage(Number(event.target.value))} aria-label="Page position" />
          <span>{progress}%</span>
        </div>
        <div className="marker-palette" aria-label="Marker colour">
          {highlightColors.map((color) => <button type="button" className={highlightColor === color ? "active" : ""} key={color} style={{ background: color }} onClick={() => setHighlightColor(color)} aria-label={`Marker ${color}`} />)}
        </div>
      </footer>
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  zoom,
  side,
  experience,
  highlights,
  activeHighlightId,
  areaMode,
  onSelection,
  onArea,
  onHighlightClick,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  side: "left" | "right" | "single";
  experience: Exclude<ReaderExperience, "auto">;
  highlights: Highlight[];
  activeHighlightId: string | null;
  areaMode: boolean;
  onSelection: (draft: SelectionDraft | null) => void;
  onArea: (draft: AreaDraft | null) => void;
  onHighlightClick: (id: string) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [dragRect, setDragRect] = useState<HighlightRect | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy["render"]> | null = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const stageHeight = window.innerHeight <= 760 ? window.innerHeight * .66 : window.innerHeight * .69;
      const stageWidth = window.innerWidth <= 760 ? window.innerWidth * .88 : window.innerWidth * (side === "single" ? .48 : .35);
      const fit = Math.min(stageWidth / baseViewport.width, stageHeight / baseViewport.height);
      const cssScale = clamp(fit * zoom, .25, 3.2);
      const viewport = page.getViewport({ scale: cssScale });
      const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = page.getViewport({ scale: cssScale * deviceScale });
      const canvas = canvasRef.current;
      const textLayer = textLayerRef.current;
      if (!canvas || !textLayer || cancelled) return;
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      setViewportSize({ width: viewport.width, height: viewport.height });
      renderTask = page.render({ canvas, viewport: renderViewport, background: "#ffffff" });
      await renderTask.promise;
      const text = await page.getTextContent();
      if (cancelled) return;
      textLayer.replaceChildren();
      for (const item of text.items) {
        if (!("str" in item) || !item.str) continue;
        const transform = item.transform;
        const scaleX = viewport.scale;
        const fontHeight = Math.max(4, Math.hypot(transform[2], transform[3]) * scaleX);
        const span = document.createElement("span");
        span.textContent = item.str;
        span.style.left = `${transform[4] * scaleX}px`;
        span.style.top = `${viewport.height - transform[5] * scaleX - fontHeight}px`;
        span.style.fontSize = `${fontHeight}px`;
        span.style.width = `${Math.max(fontHeight * .4, item.width * scaleX)}px`;
        span.style.height = `${fontHeight * 1.18}px`;
        textLayer.appendChild(span);
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdf, side, zoom]);

  function captureSelection() {
    if (areaMode || !shellRef.current || !textLayerRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      onSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!textLayerRef.current.contains(range.commonAncestorContainer)) return;
    const shell = shellRef.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 2 && rect.height > 2)
      .map((rect) => ({
        left: ((rect.left - shell.left) / shell.width) * 100,
        top: ((rect.top - shell.top) / shell.height) * 100,
        width: (rect.width / shell.width) * 100,
        height: (rect.height / shell.height) * 100,
      }));
    if (!rects.length) return;
    onSelection({ page: pageNumber, rects, text: selection.toString().trim() });
  }

  function pointerPosition(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = shellRef.current!.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
    };
  }

  function startArea(event: ReactPointerEvent<HTMLDivElement>) {
    if (!areaMode || !shellRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = pointerPosition(event);
    setDragRect({ left: dragStart.current.x, top: dragStart.current.y, width: 0, height: 0 });
  }

  function moveArea(event: ReactPointerEvent<HTMLDivElement>) {
    if (!areaMode || !dragStart.current) return;
    const current = pointerPosition(event);
    setDragRect({
      left: Math.min(dragStart.current.x, current.x),
      top: Math.min(dragStart.current.y, current.y),
      width: Math.abs(current.x - dragStart.current.x),
      height: Math.abs(current.y - dragStart.current.y),
    });
  }

  function finishArea() {
    if (!areaMode || !dragRect) return;
    if (dragRect.width > 1 && dragRect.height > 1) onArea({ page: pageNumber, rect: dragRect });
    setDragRect(null);
    dragStart.current = null;
  }

  return (
    <article className={`pdf-page-shell ${side} ${experience}`} ref={shellRef} style={{ width: viewportSize.width || undefined, height: viewportSize.height || undefined }} onMouseUp={captureSelection}>
      <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
      <div className="pdf-text-layer" ref={textLayerRef} />
      <div className={`pdf-annotation-layer ${areaMode ? "drawing" : ""}`} onPointerDown={startArea} onPointerMove={moveArea} onPointerUp={finishArea} onPointerCancel={finishArea}>
        {highlights.flatMap((highlight) => highlight.rects.map((rect, index) => (
          <button
            type="button"
            className={`pdf-highlight ${activeHighlightId === highlight.id ? "active" : ""}`}
            key={`${highlight.id}-${index}`}
            style={{ left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%`, background: highlight.color }}
            onClick={(event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onHighlightClick(highlight.id); }}
            aria-label={`Highlight on page ${pageNumber}`}
          />
        )))}
        {dragRect && <i className="area-draft" style={{ left: `${dragRect.left}%`, top: `${dragRect.top}%`, width: `${dragRect.width}%`, height: `${dragRect.height}%` }} />}
      </div>
      <span className="physical-page-number">{pageNumber}</span>
    </article>
  );
}

function Thumbnail({ pdf, pageNumber, active, onOpen }: { pdf: PDFDocumentProxy; pageNumber: number; active: boolean; onOpen: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 118 / base.width });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      task = page.render({ canvas, viewport, background: "#ffffff" });
      await task.promise;
    })().catch(() => undefined);
    return () => { cancelled = true; task?.cancel(); };
  }, [pageNumber, pdf]);
  return <button type="button" className={`pdf-thumbnail ${active ? "active" : ""}`} onClick={onOpen}><canvas ref={canvasRef} /><span>Page {pageNumber}</span></button>;
}
