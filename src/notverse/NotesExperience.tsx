import { useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { starterNotes, usePersistentState } from "./storage";
import type { NoTVerseNote, NoteType, NoteVisibility } from "./types";

type Props = {
  displayName: string;
  avatar?: string;
  libraryTitles: string[];
  noteFont: "handwritten" | "clean" | "typewriter";
  spoilerProgress?: Record<string, string>;
};

const noteTypes: NoteType[] = ["Thought", "Reaction", "Review", "Theory", "Question", "Recommendation", "Quote", "Reading update"];
const visibility: NoteVisibility[] = ["private", "followers", "public", "notebook", "direct"];

export default function NotesExperience({ displayName, avatar, libraryTitles, noteFont, spoilerProgress = {} }: Props) {
  const [notes, setNotes] = usePersistentState<NoTVerseNote[]>("notverse.notes", starterNotes);
  const [index, setIndex] = useState(0);
  const [flip, setFlip] = useState<"next" | "previous" | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [tab, setTab] = useState<"for-you" | "following" | "books" | "notebooks" | "saved">("for-you");
  const [typeFilter, setTypeFilter] = useState<"All" | NoteType>("All");
  const [showSpoilers, setShowSpoilers] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const locked = useRef(false);

  const visibleNotes = useMemo(() => notes.filter((note) => {
    if (tab === "saved" && !note.saved) return false;
    if (tab === "books" && (!note.book || !libraryTitles.includes(note.book))) return false;
    if (tab === "notebooks" && !note.notebook) return false;
    if (tab === "following" && note.mine) return false;
    if (typeFilter !== "All" && note.type !== typeFilter) return false;
    return true;
  }), [libraryTitles, notes, tab, typeFilter]);

  const activeIndex = Math.min(index, Math.max(0, visibleNotes.length - 1));
  const note = visibleNotes[activeIndex] ?? notes[0];

  function move(direction: "next" | "previous") {
    if (locked.current || visibleNotes.length < 2) return;
    const next = Math.max(0, Math.min(visibleNotes.length - 1, activeIndex + (direction === "next" ? 1 : -1)));
    if (next === activeIndex) return;
    locked.current = true;
    setFlip(direction);
    window.setTimeout(() => {
      setIndex(next);
      setFlip(null);
      locked.current = false;
    }, 430);
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start === null) return;
    const delta = start - event.clientY;
    if (Math.abs(delta) > 65) move(delta > 0 ? "next" : "previous");
  }

  function toggleSaved() {
    if (!note) return;
    setNotes((current) => current.map((item) => item.id === note.id ? { ...item, saved: !item.saved } : item));
  }

  function react() {
    if (!note) return;
    setNotes((current) => current.map((item) => item.id === note.id ? { ...item, reactions: item.reactions + 1 } : item));
  }

  function publish(next: NoTVerseNote) {
    setNotes((current) => [next, ...current]);
    setIndex(0);
    setTab("for-you");
    setComposerOpen(false);
  }

  const blockedByProgress = Boolean(note?.spoilerBoundary && note.book && spoilerProgress[note.book] && !showSpoilers && !note.mine);

  return (
    <section className={`notes-experience note-font-${noteFont}`} onPointerDown={pointerDown} onPointerUp={pointerUp}>
      <header className="notes-header">
        <div><span className="notverse-eyebrow">Leave something behind</span><h1>Notes</h1></div>
        <div><button type="button" onClick={() => setComposerOpen(true)} aria-label="New Note">＋</button><button type="button" onClick={() => setFiltersOpen(true)} aria-label="Filter Notes">☷</button></div>
      </header>
      <nav className="notes-tabs">
        {(["for-you", "following", "books", "notebooks", "saved"] as const).map((value) => <button type="button" className={tab === value ? "active" : ""} key={value} onClick={() => { setTab(value); setIndex(0); }}>{value === "for-you" ? "For You" : value[0].toUpperCase() + value.slice(1)}</button>)}
      </nav>

      <div className={`note-flip-stage flip-${flip || "idle"}`}>
        {visibleNotes.length === 0 ? <div className="notes-empty"><strong>No Notes here yet.</strong><p>Change the filter or write the first one.</p><button type="button" onClick={() => setComposerOpen(true)}>Write a Note</button></div> : <>
          <div className="note-shadow-sheet" />
          <article className="note-paper">
            <div className="note-binding">{Array.from({ length: 13 }, (_, value) => <i key={value} />)}</div>
            <span className="note-tape" />
            <header>
              <span className="note-author-avatar">{note.avatar ? <img src={note.avatar} alt="" /> : note.author.slice(0, 1)}</span>
              <div><strong>{note.author}</strong><small>{note.notebook}</small></div>
              <time>{note.createdAt}</time>
              <button type="button" onClick={() => setOptionsOpen(true)}>•••</button>
            </header>
            <div className="note-body">
              <span className="note-type">{note.type}</span>
              {blockedByProgress ? <div className="spoiler-cover"><strong>This Note may be ahead of your reading progress.</strong><p>{note.spoilerBoundary}</p><button type="button" onClick={() => setShowSpoilers(true)}>Reveal anyway</button></div> : <p>{note.text}</p>}
              {note.tags.length > 0 && <div className="note-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
              {note.image && <button className="note-photo" type="button" onClick={() => setImageOpen(true)}><span /><img src={note.image.dataUrl} alt={note.image.name} /><small>Tap image to open</small></button>}
              {(note.book || note.chapter || note.page) && <div className="note-book-link"><span>▤</span><div><strong>{note.book}</strong><small>{[note.chapter, note.page].filter(Boolean).join(" · ")}</small></div></div>}
            </div>
            <footer><button type="button" onClick={react}>♥ <span>{note.reactions}</span></button><button type="button" onClick={() => setRepliesOpen(true)}>▢ <span>{note.replies}</span></button><button type="button" onClick={toggleSaved}>{note.saved ? "▣" : "▢"}</button><button type="button">↗</button></footer>
          </article>
        </>}
      </div>

      <div className="note-position"><strong>{visibleNotes.length ? activeIndex + 1 : 0} / {visibleNotes.length}</strong><span>Swipe up to flip forward</span><small>Swipe down to flip back</small></div>
      <div className="note-swipe-controls"><button type="button" onClick={() => move("previous")}>↓ Previous</button><button type="button" onClick={() => move("next")}>↑ Next</button></div>

      {composerOpen && <NoteComposer displayName={displayName} avatar={avatar} libraryTitles={libraryTitles} noteFont={noteFont} onClose={() => setComposerOpen(false)} onPublish={publish} />}
      {filtersOpen && <NoteFilters typeFilter={typeFilter} showSpoilers={showSpoilers} onType={setTypeFilter} onSpoilers={setShowSpoilers} onClose={() => setFiltersOpen(false)} />}
      {optionsOpen && note && <NoteOptions note={note} onClose={() => setOptionsOpen(false)} onSave={toggleSaved} />}
      {repliesOpen && note && <RepliesDrawer note={note} onClose={() => setRepliesOpen(false)} />}
      {imageOpen && note?.image && <div className="note-image-viewer" onClick={() => setImageOpen(false)}><button type="button">×</button><img src={note.image.dataUrl} alt={note.image.name} /></div>}
    </section>
  );
}

function NoteComposer({ displayName, avatar, libraryTitles, noteFont, onClose, onPublish }: { displayName: string; avatar?: string; libraryTitles: string[]; noteFont: string; onClose: () => void; onPublish: (note: NoTVerseNote) => void }) {
  const [text, setText] = useState("");
  const [type, setType] = useState<NoteType>("Thought");
  const [visible, setVisible] = useState<NoteVisibility>("private");
  const [book, setBook] = useState(libraryTitles[0] || "");
  const [chapter, setChapter] = useState("");
  const [spoiler, setSpoiler] = useState("No spoilers");
  const [image, setImage] = useState<NoTVerseNote["image"]>();

  function imageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage({ id: `image-${Date.now()}`, name: file.name, dataUrl: typeof reader.result === "string" ? reader.result : "" });
    reader.readAsDataURL(file);
  }

  function submit() {
    if (!text.trim()) return;
    onPublish({
      id: `note-${Date.now()}`,
      author: displayName || "Reader",
      avatar,
      notebook: visible === "notebook" ? "My Notebook" : "My Notebook",
      createdAt: "Just now",
      text: text.trim(),
      type,
      visibility: visible,
      book: book || undefined,
      chapter: chapter || undefined,
      spoilerBoundary: spoiler,
      tags: [],
      image,
      reactions: 0,
      replies: 0,
      saved: true,
      mine: true,
    });
  }

  return <div className="note-modal-backdrop"><section className={`note-composer note-font-${noteFont}`}><header><button type="button" onClick={onClose}>←</button><strong>New Note</strong><button type="button" onClick={submit} disabled={!text.trim()}>Post</button></header><div className="composer-paper"><div className="note-binding">{Array.from({ length: 13 }, (_, value) => <i key={value} />)}</div><span className="note-tape" /><textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Write your Note here…" />{image && <div className="composer-photo"><span /><img src={image.dataUrl} alt="" /><button type="button" onClick={() => setImage(undefined)}>×</button></div>}<div className="composer-tools"><label>▧<input type="file" accept="image/*" onChange={imageChange} /></label><button type="button">“ ”</button><button type="button">Aa</button><button type="button">#</button></div></div><div className="composer-settings"><label>Note type<select value={type} onChange={(event) => setType(event.target.value as NoteType)}>{noteTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Attach to<select value={book} onChange={(event) => setBook(event.target.value)}><option value="">No book</option>{libraryTitles.map((title) => <option key={title}>{title}</option>)}</select></label><label>Chapter or page<input value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="Chapter 34 or Page 91" /></label><label>Spoiler scope<select value={spoiler} onChange={(event) => setSpoiler(event.target.value)}><option>No spoilers</option><option>Spoilers up to this chapter</option><option>Spoilers up to this volume</option><option>Whole-book spoilers</option><option>Custom boundary</option></select></label><div className="visibility-row">{visibility.map((item) => <button type="button" className={visible === item ? "active" : ""} key={item} onClick={() => setVisible(item)}>{item}</button>)}</div></div></section></div>;
}

function NoteFilters({ typeFilter, showSpoilers, onType, onSpoilers, onClose }: { typeFilter: "All" | NoteType; showSpoilers: boolean; onType: (value: "All" | NoteType) => void; onSpoilers: (value: boolean) => void; onClose: () => void }) {
  return <div className="note-modal-backdrop"><section className="note-filter-sheet"><header><button type="button" onClick={onClose}>←</button><strong>Notes · Filters</strong><span /></header><h3>Note type</h3><div className="filter-chip-grid">{(["All", ...noteTypes] as const).map((item) => <button type="button" className={typeFilter === item ? "active" : ""} key={item} onClick={() => onType(item)}>{item}</button>)}</div><h3>Show</h3><label className="filter-switch">Reveal spoiler-marked Notes<input type="checkbox" checked={showSpoilers} onChange={(event) => onSpoilers(event.target.checked)} /></label><button className="apply-filter" type="button" onClick={onClose}>Apply Filters</button></section></div>;
}

function NoteOptions({ note, onClose, onSave }: { note: NoTVerseNote; onClose: () => void; onSave: () => void }) {
  return <div className="note-modal-backdrop options-backdrop" onClick={onClose}><section className="note-options" onClick={(event) => event.stopPropagation()}><h3>Note Options</h3><button type="button">↗ Share Note</button><button type="button" onClick={onSave}>{note.saved ? "▣ Remove saved Note" : "▢ Save Note"}</button><button type="button">▤ Add to Notebook</button><button type="button">⌁ Copy Note link</button><button type="button">◉ Hide this Note</button><button type="button" className="danger">⚑ Report Note</button><button type="button" onClick={onClose}>Cancel</button></section></div>;
}

function RepliesDrawer({ note, onClose }: { note: NoTVerseNote; onClose: () => void }) {
  return <div className="note-modal-backdrop replies-backdrop"><section className="replies-drawer"><header><div><strong>Replies</strong><small>{note.replies} responses to this Note</small></div><button type="button" onClick={onClose}>×</button></header><article><b>Mugiwara_05</b><p>I totally agree. That scene gave me chills. The promise hits differently every time.</p><small>2h ago · Spoiler boundary respected</small></article><article><b>PageTurner</b><p>The quiet panel before it is what made the moment work for me.</p><small>1h ago</small></article><form onSubmit={(event) => event.preventDefault()}><input placeholder="Reply without spoiling what comes next…" /><button type="submit">Send</button></form></section></div>;
}
