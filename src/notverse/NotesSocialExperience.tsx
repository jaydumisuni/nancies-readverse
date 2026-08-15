import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { starterNotes, usePersistentState } from "./storage";
import type { NoTVerseNote, NoteType, NoteVisibility } from "./types";

type Props = {
  displayName: string;
  avatar?: string;
  libraryTitles: string[];
  noteFont: "handwritten" | "clean" | "typewriter";
  spoilerProgress?: Record<string, string>;
};

type NoteTab = "for-you" | "following" | "books" | "notebooks" | "saved" | "mine";

type NoteReply = {
  id: string;
  noteId: string;
  author: string;
  avatar?: string;
  text: string;
  createdAt: string;
  mine: boolean;
};

type NoteActivityKind = "published" | "reply" | "reaction" | "share" | "saved" | "notebook";

type NoteActivity = {
  id: string;
  noteId: string;
  kind: NoteActivityKind;
  title: string;
  detail: string;
  createdAt: string;
  unread: boolean;
};

const noteTypes: NoteType[] = ["Thought", "Reaction", "Review", "Theory", "Question", "Recommendation", "Quote", "Reading update"];
const visibility: NoteVisibility[] = ["private", "followers", "public", "notebook", "direct"];
const starterReplies: Record<string, NoteReply[]> = {
  "note-zoro-growth": [
    { id: "reply-zoro-1", noteId: "note-zoro-growth", author: "Mugiwara_05", text: "I totally agree. That scene gave me chills. The promise hits differently every time.", createdAt: "2h ago", mine: false },
    { id: "reply-zoro-2", noteId: "note-zoro-growth", author: "PageTurner", text: "The quiet panel before it is what made the moment work for me.", createdAt: "1h ago", mine: false },
  ],
  "note-berserk-art": [
    { id: "reply-berserk-1", noteId: "note-berserk-art", author: "InkAndPanels", text: "The silence is what stayed with me too. The page composition does half the storytelling.", createdAt: "3h ago", mine: false },
  ],
};

function nowLabel() {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date());
}
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function noteUrl(noteId: string) { return `${window.location.origin}${window.location.pathname}#note=${encodeURIComponent(noteId)}`; }

export default function NotesSocialExperience({ displayName, avatar, libraryTitles, noteFont, spoilerProgress = {} }: Props) {
  const [notes, setNotes] = usePersistentState<NoTVerseNote[]>("notverse.notes", starterNotes);
  const [repliesByNote, setRepliesByNote] = usePersistentState<Record<string, NoteReply[]>>("notverse.noteReplies", starterReplies);
  const [activities, setActivities] = usePersistentState<NoteActivity[]>("notverse.noteActivity", []);
  const [hiddenIds, setHiddenIds] = usePersistentState<string[]>("notverse.hiddenNotes", []);
  const [reportedIds, setReportedIds] = usePersistentState<string[]>("notverse.reportedNotes", []);
  const [reactedIds, setReactedIds] = usePersistentState<string[]>("notverse.reactedNotes", []);
  const [index, setIndex] = useState(0);
  const [flip, setFlip] = useState<"next" | "previous" | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [tab, setTab] = useState<NoteTab>("for-you");
  const [typeFilter, setTypeFilter] = useState<"All" | NoteType>("All");
  const [showSpoilers, setShowSpoilers] = useState(false);
  const [requestedNoteId, setRequestedNoteId] = useState("");
  const [toast, setToast] = useState("");
  const pointerStart = useRef<number | null>(null);
  const locked = useRef(false);

  function addActivity(noteId: string, kind: NoteActivityKind, title: string, detail: string, unread = true) {
    setActivities((current) => [{ id: uid("activity"), noteId, kind, title, detail, createdAt: nowLabel(), unread }, ...current].slice(0, 100));
  }
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2200); }
  function readHash() {
    const hash = window.location.hash;
    if (hash === "#activity") { setActivityOpen(true); setActivities((current) => current.map((item) => ({ ...item, unread: false }))); return; }
    if (hash === "#my-notes") { setActivityOpen(false); setTab("mine"); setIndex(0); return; }
    if (hash.startsWith("#note=")) {
      const id = decodeURIComponent(hash.slice("#note=".length));
      setActivityOpen(false); setRequestedNoteId(id);
      const target = notes.find((item) => item.id === id);
      setTab(target?.mine ? "mine" : "for-you");
    }
  }
  useEffect(() => { readHash(); window.addEventListener("hashchange", readHash); return () => window.removeEventListener("hashchange", readHash); }, [notes]);

  const visibleNotes = useMemo(() => notes.filter((note) => {
    if (hiddenIds.includes(note.id)) return false;
    if (tab === "mine" && !note.mine) return false;
    if (tab === "saved" && !note.saved) return false;
    if (tab === "books" && (!note.book || !libraryTitles.includes(note.book))) return false;
    if (tab === "notebooks" && !note.notebook) return false;
    if (tab === "following" && note.mine) return false;
    if (typeFilter !== "All" && note.type !== typeFilter) return false;
    return true;
  }), [hiddenIds, libraryTitles, notes, tab, typeFilter]);
  useEffect(() => { if (!requestedNoteId) return; const next = visibleNotes.findIndex((item) => item.id === requestedNoteId); if (next >= 0) { setIndex(next); setRequestedNoteId(""); } }, [requestedNoteId, visibleNotes]);

  const activeIndex = Math.min(index, Math.max(0, visibleNotes.length - 1));
  const note = visibleNotes[activeIndex] ?? notes.find((item) => !hiddenIds.includes(item.id)) ?? notes[0];
  const unreadActivity = activities.filter((item) => item.unread).length;

  function move(direction: "next" | "previous") {
    if (locked.current || visibleNotes.length < 2) return;
    const next = Math.max(0, Math.min(visibleNotes.length - 1, activeIndex + (direction === "next" ? 1 : -1)));
    if (next === activeIndex) return;
    locked.current = true; setFlip(direction);
    window.setTimeout(() => { setIndex(next); setFlip(null); locked.current = false; }, 430);
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) { const target = event.target as HTMLElement; if (target.closest("button,input,textarea,select,label,a")) { pointerStart.current = null; return; } pointerStart.current = event.clientY; }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) { const start = pointerStart.current; pointerStart.current = null; if (start === null) return; const delta = start - event.clientY; if (Math.abs(delta) > 65) move(delta > 0 ? "next" : "previous"); }
  function updateNote(noteId: string, updater: (current: NoTVerseNote) => NoTVerseNote) { setNotes((current) => current.map((item) => item.id === noteId ? updater(item) : item)); }
  function toggleSaved() { if (!note) return; const nextSaved = !note.saved; updateNote(note.id, (item) => ({ ...item, saved: nextSaved })); if (nextSaved) addActivity(note.id, "saved", "Note saved", "You saved this Note for later.", false); showToast(nextSaved ? "Saved to your Notes." : "Removed from Saved."); }
  function react() { if (!note) return; const reacted = reactedIds.includes(note.id); updateNote(note.id, (item) => ({ ...item, reactions: Math.max(0, item.reactions + (reacted ? -1 : 1)) })); setReactedIds((current) => reacted ? current.filter((id) => id !== note.id) : [...current, note.id]); if (!reacted) addActivity(note.id, "reaction", "Reaction recorded", "You reacted to this Note.", false); }
  function publish(next: NoTVerseNote) { setNotes((current) => [next, ...current]); setIndex(0); setTab("mine"); setComposerOpen(false); addActivity(next.id, "published", "Note published", "Your new Note is now in My Notes.", true); window.location.hash = `note=${encodeURIComponent(next.id)}`; }
  function submitReply(text: string) { if (!note) return; const clean = text.trim(); if (!clean) return; const reply: NoteReply = { id: uid("reply"), noteId: note.id, author: displayName || "Reader", avatar, text: clean, createdAt: nowLabel(), mine: true }; setRepliesByNote((current) => ({ ...current, [note.id]: [...(current[note.id] || []), reply] })); updateNote(note.id, (item) => ({ ...item, replies: item.replies + 1 })); addActivity(note.id, "reply", note.mine ? "Comment added to your Note" : `You commented on ${note.author}`, clean, note.mine); }
  async function copyLink(target: NoTVerseNote) { const url = noteUrl(target.id); try { await navigator.clipboard.writeText(url); showToast("Note link copied."); } catch { window.prompt("Copy Note link", url); } }
  async function share(target: NoTVerseNote) { const url = noteUrl(target.id); const payload = { title: `${target.author} on NoTVerse`, text: target.text.slice(0, 180), url }; try { if (navigator.share) { await navigator.share(payload); addActivity(target.id, "share", "Note shared", "You shared this Note.", false); showToast("Shared."); return; } } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; } await copyLink(target); addActivity(target.id, "share", "Share link copied", "The Note link is ready to send.", false); }
  function addToNotebook(target: NoTVerseNote) { updateNote(target.id, (item) => ({ ...item, notebook: "My Notebook" })); addActivity(target.id, "notebook", "Added to My Notebook", "This Note is now filed in My Notebook.", false); setOptionsOpen(false); showToast("Added to My Notebook."); }
  function hideNote(target: NoTVerseNote) { setHiddenIds((current) => current.includes(target.id) ? current : [...current, target.id]); setOptionsOpen(false); setIndex(0); showToast("Note hidden from your feed."); }
  function reportNote(target: NoTVerseNote) { setReportedIds((current) => current.includes(target.id) ? current : [...current, target.id]); setOptionsOpen(false); showToast("Report recorded locally. Moderation service is not connected yet."); }
  function openActivity() { setActivityOpen(true); setActivities((current) => current.map((item) => ({ ...item, unread: false }))); window.history.replaceState(null, "", "#activity"); }
  function openActivityNote(noteId: string) { const target = notes.find((item) => item.id === noteId); if (!target) return; setActivityOpen(false); setTab(target.mine ? "mine" : "for-you"); setRequestedNoteId(noteId); window.location.hash = `note=${encodeURIComponent(noteId)}`; }

  const blockedByProgress = Boolean(note?.spoilerBoundary && note.book && spoilerProgress[note.book] && !showSpoilers && !note.mine);
  return <section className={`notes-experience notes-social-experience note-font-${noteFont}`} onPointerDown={pointerDown} onPointerUp={pointerUp}>
    <header className="notes-header"><div><span className="notverse-eyebrow">Leave something behind</span><h1>Notes</h1></div><div className="notes-header-actions"><button type="button" className="notes-activity-button" onClick={openActivity} aria-label="Note activity">◉{unreadActivity > 0 && <b>{unreadActivity}</b>}</button><button type="button" onClick={() => setComposerOpen(true)} aria-label="New Note">＋</button><button type="button" onClick={() => setFiltersOpen(true)} aria-label="Filter Notes">☷</button></div></header>
    <nav className="notes-tabs" aria-label="Note feeds">{(["for-you", "following", "mine", "books", "notebooks", "saved"] as const).map((value) => <button type="button" className={tab === value ? "active" : ""} key={value} onClick={() => { setTab(value); setIndex(0); if (value === "mine") window.history.replaceState(null, "", "#my-notes"); }}>{value === "for-you" ? "For You" : value === "mine" ? "My Notes" : value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
    <div className={`note-flip-stage flip-${flip || "idle"}`}>{visibleNotes.length === 0 ? <div className="notes-empty"><strong>{tab === "mine" ? "You have not written a Note here yet." : "No Notes here yet."}</strong><p>{tab === "mine" ? "Write one and it will always be available from My Notes." : "Change the filter or write the first one."}</p><button type="button" onClick={() => setComposerOpen(true)}>Write a Note</button></div> : note ? <><div className="note-shadow-sheet" /><article className="note-paper" data-note-id={note.id} data-note-mine={note.mine ? "true" : "false"}><div className="note-binding">{Array.from({ length: 13 }, (_, value) => <i key={value} />)}</div><span className="note-tape" /><header><span className="note-author-avatar">{note.avatar ? <img src={note.avatar} alt="" /> : note.author.slice(0, 1)}</span><div><strong>{note.author}{note.mine && <em className="mine-badge">You</em>}</strong><small>{note.notebook}</small></div><time>{note.createdAt}</time><button type="button" onClick={() => setOptionsOpen(true)} aria-label="Note options">•••</button></header><div className="note-body"><span className="note-type">{note.type}</span>{blockedByProgress ? <div className="spoiler-cover"><strong>This Note may be ahead of your reading progress.</strong><p>{note.spoilerBoundary}</p><button type="button" onClick={() => setShowSpoilers(true)}>Reveal anyway</button></div> : <p>{note.text}</p>}{note.tags.length > 0 && <div className="note-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}{note.image && <button className="note-photo" type="button" onClick={() => setImageOpen(true)}><span /><img src={note.image.dataUrl} alt={note.image.name} /><small>Tap image to open</small></button>}{(note.book || note.chapter || note.page) && <div className="note-book-link"><span>▤</span><div><strong>{note.book}</strong><small>{[note.chapter, note.page].filter(Boolean).join(" · ")}</small></div></div>}</div><footer className="note-social-actions"><button type="button" className={reactedIds.includes(note.id) ? "active" : ""} onClick={react} aria-label={reactedIds.includes(note.id) ? "Unlike Note" : "Like Note"}><b>♥</b><span>Like</span><small>{note.reactions}</small></button><button type="button" onClick={() => setRepliesOpen(true)} aria-label="Comment on Note"><b>▢</b><span>Comment</span><small>{note.replies}</small></button><button type="button" className={note.saved ? "active" : ""} onClick={toggleSaved} aria-label={note.saved ? "Remove saved Note" : "Save Note"}><b>{note.saved ? "▣" : "▢"}</b><span>Save</span></button><button type="button" onClick={() => void share(note)} aria-label="Share Note"><b>↗</b><span>Share</span></button></footer></article></> : null}</div>
    <div className="note-position"><strong>{visibleNotes.length ? activeIndex + 1 : 0} / {visibleNotes.length}</strong><span>Swipe up to flip forward</span><small>Swipe down to flip back</small></div><div className="note-swipe-controls"><button type="button" onClick={() => move("previous")}>↓ Previous</button><button type="button" onClick={() => move("next")}>↑ Next</button></div>
    {composerOpen && <NoteComposer displayName={displayName} avatar={avatar} libraryTitles={libraryTitles} noteFont={noteFont} onClose={() => setComposerOpen(false)} onPublish={publish} />}
    {filtersOpen && <NoteFilters typeFilter={typeFilter} showSpoilers={showSpoilers} onType={setTypeFilter} onSpoilers={setShowSpoilers} onClose={() => setFiltersOpen(false)} />}
    {optionsOpen && note && <NoteOptions note={note} reported={reportedIds.includes(note.id)} onClose={() => setOptionsOpen(false)} onShare={() => void share(note)} onCopy={() => void copyLink(note)} onSave={toggleSaved} onNotebook={() => addToNotebook(note)} onHide={() => hideNote(note)} onReport={() => reportNote(note)} />}
    {repliesOpen && note && createPortal(<RepliesDrawer note={note} replies={repliesByNote[note.id] || []} onClose={() => setRepliesOpen(false)} onSend={submitReply} />, document.body)}
    {activityOpen && createPortal(<ActivityPanel activities={activities} notes={notes} onClose={() => { setActivityOpen(false); window.history.replaceState(null, "", "#my-notes"); }} onOpenNote={openActivityNote} onMarkRead={() => setActivities((current) => current.map((item) => ({ ...item, unread: false })))} />, document.body)}
    {imageOpen && note?.image && <div className="note-image-viewer" onClick={() => setImageOpen(false)}><button type="button">×</button><img src={note.image.dataUrl} alt={note.image.name} /></div>}{toast && <div className="note-toast" role="status">{toast}</div>}
  </section>;
}

function NoteComposer({ displayName, avatar, libraryTitles, noteFont, onClose, onPublish }: { displayName: string; avatar?: string; libraryTitles: string[]; noteFont: string; onClose: () => void; onPublish: (note: NoTVerseNote) => void }) {
  const [text, setText] = useState(""); const [type, setType] = useState<NoteType>("Thought"); const [visible, setVisible] = useState<NoteVisibility>("private"); const [book, setBook] = useState(libraryTitles[0] || ""); const [chapter, setChapter] = useState(""); const [spoiler, setSpoiler] = useState("No spoilers"); const [image, setImage] = useState<NoTVerseNote["image"]>();
  function imageChange(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setImage({ id: `image-${Date.now()}`, name: file.name, dataUrl: typeof reader.result === "string" ? reader.result : "" }); reader.readAsDataURL(file); }
  function submit() { if (!text.trim()) return; onPublish({ id: `note-${Date.now()}`, author: displayName || "Reader", avatar, notebook: "My Notebook", createdAt: "Just now", text: text.trim(), type, visibility: visible, book: book || undefined, chapter: chapter || undefined, spoilerBoundary: spoiler === "No spoilers" ? undefined : spoiler, tags: [], image, reactions: 0, replies: 0, saved: true, mine: true }); }
  return <div className="note-modal-backdrop"><section className={`note-composer note-font-${noteFont}`}><header><button type="button" onClick={onClose}>←</button><strong>New Note</strong><button type="button" onClick={submit} disabled={!text.trim()}>Post</button></header><div className="composer-paper"><div className="note-binding">{Array.from({ length: 13 }, (_, value) => <i key={value} />)}</div><span className="note-tape" /><textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Write your Note here…" />{image && <div className="composer-photo"><span /><img src={image.dataUrl} alt="" /><button type="button" onClick={() => setImage(undefined)}>×</button></div>}<div className="composer-tools"><label>▧<input type="file" accept="image/*" onChange={imageChange} /></label><button type="button" disabled title="Quote formatting is not available yet">“ ”</button><button type="button" disabled title="Typography is controlled by your Note font setting">Aa</button><button type="button" disabled title="Tag editor is not available yet">#</button></div></div><div className="composer-settings"><label>Note type<select value={type} onChange={(event) => setType(event.target.value as NoteType)}>{noteTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Attach to<select value={book} onChange={(event) => setBook(event.target.value)}><option value="">No book</option>{libraryTitles.map((title) => <option key={title}>{title}</option>)}</select></label><label>Chapter or page<input value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="Chapter 34 or Page 91" /></label><label>Spoiler scope<select value={spoiler} onChange={(event) => setSpoiler(event.target.value)}><option>No spoilers</option><option>Spoilers up to this chapter</option><option>Spoilers up to this volume</option><option>Whole-book spoilers</option><option>Custom boundary</option></select></label><div className="visibility-row">{visibility.map((item) => <button type="button" className={visible === item ? "active" : ""} key={item} onClick={() => setVisible(item)}>{item}</button>)}</div></div></section></div>;
}

function NoteFilters({ typeFilter, showSpoilers, onType, onSpoilers, onClose }: { typeFilter: "All" | NoteType; showSpoilers: boolean; onType: (value: "All" | NoteType) => void; onSpoilers: (value: boolean) => void; onClose: () => void }) {
  return <div className="note-modal-backdrop"><section className="note-filter-sheet"><header><button type="button" onClick={onClose}>←</button><strong>Notes · Filters</strong><span /></header><h3>Note type</h3><div className="filter-chip-grid">{(["All", ...noteTypes] as const).map((item) => <button type="button" className={typeFilter === item ? "active" : ""} key={item} onClick={() => onType(item)}>{item}</button>)}</div><h3>Show</h3><label className="filter-switch">Reveal spoiler-marked Notes<input type="checkbox" checked={showSpoilers} onChange={(event) => onSpoilers(event.target.checked)} /></label><button className="apply-filter" type="button" onClick={onClose}>Apply Filters</button></section></div>;
}

function NoteOptions({ note, reported, onClose, onShare, onCopy, onSave, onNotebook, onHide, onReport }: { note: NoTVerseNote; reported: boolean; onClose: () => void; onShare: () => void; onCopy: () => void; onSave: () => void; onNotebook: () => void; onHide: () => void; onReport: () => void }) {
  return <div className="note-modal-backdrop options-backdrop" onClick={onClose}><section className="note-options" onClick={(event) => event.stopPropagation()}><h3>Note Options</h3><button type="button" onClick={onShare}>↗ Share Note</button><button type="button" onClick={onSave}>{note.saved ? "▣ Remove saved Note" : "▢ Save Note"}</button><button type="button" onClick={onNotebook}>▤ Add to My Notebook</button><button type="button" onClick={onCopy}>⌁ Copy Note link</button>{!note.mine && <button type="button" onClick={onHide}>◉ Hide this Note</button>}{!note.mine && <button type="button" className="danger" onClick={onReport} disabled={reported}>{reported ? "⚑ Report recorded" : "⚑ Report Note"}</button>}<button type="button" onClick={onClose}>Cancel</button></section></div>;
}

function RepliesDrawer({ note, replies, onClose, onSend }: { note: NoTVerseNote; replies: NoteReply[]; onClose: () => void; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState(""); const listRef = useRef<HTMLDivElement>(null); const submitting = useRef(false); useEffect(() => { const list = listRef.current; if (!list) return; window.requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; }); }, [replies.length]); function sendDraft() { const clean = draft.trim(); if (!clean || submitting.current) return; submitting.current = true; onSend(clean); setDraft(""); window.setTimeout(() => { submitting.current = false; }, 450); } function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); sendDraft(); }
  return <div className="note-modal-backdrop replies-backdrop"><section className="replies-drawer"><header><div><strong>Comments</strong><small>{replies.length} saved here{note.replies > replies.length ? ` · ${note.replies} total` : ""}</small></div><button type="button" onClick={onClose} aria-label="Close comments">×</button></header><div className="replies-list" ref={listRef}>{replies.length === 0 ? <div className="replies-empty"><strong>No comments yet.</strong><p>Start the conversation.</p></div> : replies.map((reply) => <article key={reply.id} data-reply-id={reply.id}><span className="reply-avatar">{reply.avatar ? <img src={reply.avatar} alt="" /> : reply.author.slice(0, 1)}</span><div><b>{reply.author}{reply.mine && <em>You</em>}</b><p>{reply.text}</p><small>{reply.createdAt}</small></div></article>)}</div><form onSubmit={submit}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a comment…" aria-label="Write a comment" /><button type="button" onPointerDown={(event) => { event.preventDefault(); sendDraft(); }} onClick={sendDraft} disabled={!draft.trim()}>Send</button></form></section></div>;
}

function ActivityPanel({ activities, notes, onClose, onOpenNote, onMarkRead }: { activities: NoteActivity[]; notes: NoTVerseNote[]; onClose: () => void; onOpenNote: (noteId: string) => void; onMarkRead: () => void }) {
  return <div className="note-modal-backdrop activity-backdrop" onClick={onClose}><section className="note-activity-panel" onClick={(event) => event.stopPropagation()}><header><div><strong>Activity</strong><small>Comments, reactions, shares and your Note history.</small></div><button type="button" onClick={onClose} aria-label="Close activity">×</button></header><div className="activity-toolbar"><span>{activities.filter((item) => item.unread).length} unread</span><button type="button" onClick={onMarkRead}>Mark all read</button></div><div className="activity-list">{activities.length === 0 ? <div className="activity-empty"><strong>No Note activity yet.</strong><p>When you publish, comment, save or share, your Note history will appear here.</p></div> : activities.map((item) => { const target = notes.find((entry) => entry.id === item.noteId); return <button type="button" key={item.id} className={item.unread ? "unread" : ""} onClick={() => onOpenNote(item.noteId)}><span>{item.kind === "reply" ? "▢" : item.kind === "reaction" ? "♥" : item.kind === "share" ? "↗" : "•"}</span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{target ? `Open “${target.text.slice(0, 55)}${target.text.length > 55 ? "…" : ""}”` : "Note no longer available"} · {item.createdAt}</small></div></button>; })}</div></section></div>;
}
