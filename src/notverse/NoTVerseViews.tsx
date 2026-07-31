import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import NotesExperience from "./NotesExperience";
import { starterInbox, starterNotebooks, starterNotes, usePersistentState } from "./storage";
import type { InboxThread, NoTVerseNav, NoTVersePreferences, NotebookRecord, PresenceReader } from "./types";

type BookLike = {
  id: string;
  title: string;
  subtitle: string;
  progress: number;
  cover: string;
  badge?: string;
  sourceUrl?: string;
  offline?: boolean;
  driveFileId?: string;
  currentPage?: number;
  totalPages?: number;
};

type Props = {
  active: NoTVerseNav;
  displayName: string;
  avatar?: string;
  status?: string;
  greeting: string;
  companion: { name: string; avatar: string; ring: string; summary: string };
  books: BookLike[];
  preferences: NoTVersePreferences;
  presence: PresenceReader[];
  onDiscover: (query: string) => void;
  onSource: () => void;
  onUpload: () => void;
  onChat: () => void;
  onSettings: () => void;
  onOpenBook: (book: BookLike) => void;
};

export default function NoTVerseViews(props: Props) {
  if (props.active === "notes") return <NotesExperience displayName={props.displayName} avatar={props.avatar} libraryTitles={props.books.map((book) => book.title)} noteFont={props.preferences.noteFont} />;
  if (props.active === "search") return <SearchView onDiscover={props.onDiscover} onSource={props.onSource} onUpload={props.onUpload} />;
  if (props.active === "library") return <LibraryView books={props.books} onOpen={props.onOpenBook} />;
  if (props.active === "inbox") return <InboxView displayName={props.displayName} />;
  if (props.active === "me") return <ProfileNotebook displayName={props.displayName} avatar={props.avatar} status={props.status} books={props.books} onSettings={props.onSettings} />;
  return <HomeView {...props} />;
}

function HomeView({ greeting, companion, books, presence, onChat, onUpload, onSettings, onOpenBook }: Props) {
  const [notebooks] = usePersistentState<NotebookRecord[]>("notverse.notebooks", starterNotebooks);
  const recent = starterNotes[0];
  const visiblePresence = presence.slice(0, 4);
  return (
    <section className="notverse-view notverse-home">
      <header className="notverse-hero"><span className="notverse-eyebrow">Your verse is waiting</span><h1>{greeting}</h1><p>What shall we read, remember or leave behind today?</p></header>
      <article className="notverse-companion-card" style={{ "--companion-ring": companion.ring } as React.CSSProperties}><span><img src={companion.avatar} alt="" /></span><div><small>My companion</small><h2>{companion.name}</h2><p>{companion.summary}</p></div><button type="button" onClick={onChat}>Chat now</button><nav><button type="button" onClick={onUpload}>Upload a file</button><button type="button" onClick={onSettings}>Customise</button></nav></article>

      <section className="notverse-section"><header><div><span>Continue Reading</span><h2>Your books keep their place.</h2></div><button type="button">View library →</button></header><div className="notverse-book-row">{books.slice(0, 5).map((book) => <button type="button" className="notverse-book" key={book.id} onClick={() => onOpenBook(book)}><span><img src={book.cover} alt="" /><b>{book.progress}%</b>{book.offline && <i>Offline</i>}</span><strong>{book.title}</strong><small>{book.subtitle}</small><em><i style={{ width: `${book.progress}%` }} /></em></button>)}</div></section>

      <div className="notverse-home-grid">
        <section className="reading-now-card"><header><div><span>Reading Now</span><h2>{presence.length} readers are active</h2></div><b>{presence.filter((reader) => reader.nearProgress).length} near your progress</b></header><div className="presence-row">{visiblePresence.map((reader) => <span key={reader.id} title={`${reader.name} · ${reader.book}`}><img src={reader.avatar} alt="" /></span>)}{presence.length > 4 && <i>+{presence.length - 4}</i>}</div><p>Priority is the same book, nearby chapter, followed readers and shared Notebooks. Exact pages remain private.</p></section>
        <section className="recent-note-card"><span>Recent relevant Note</span><blockquote>“{recent.text}”</blockquote><footer><strong>{recent.author}</strong><small>{recent.notebook} · {recent.createdAt}</small></footer></section>
      </div>

      <section className="notverse-section"><header><div><span>Your Notebooks</span><h2>Places where reading leaves a trail.</h2></div><button type="button">View all →</button></header><div className="notebook-row">{notebooks.map((notebook) => <article key={notebook.id} style={{ "--notebook-accent": notebook.coverAccent } as React.CSSProperties}><span>▤</span><div><strong>{notebook.name}</strong><small>{notebook.type} · {notebook.members} member{notebook.members === 1 ? "" : "s"}</small><p>{notebook.description}</p></div></article>)}</div></section>
    </section>
  );
}

function SearchView({ onDiscover, onSource, onUpload }: Pick<Props, "onDiscover" | "onSource" | "onUpload">) {
  const [query, setQuery] = useState("");
  const [scan, setScan] = useState<{ kind: "cover" | "page"; name: string; preview: string } | null>(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const scanKind = useRef<"cover" | "page">("cover");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    onDiscover(query.trim());
  }
  function chooseScan(kind: "cover" | "page") {
    scanKind.current = kind;
    fileRef.current?.click();
  }
  function scanFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setScan({ kind: scanKind.current, name: file.name, preview: typeof reader.result === "string" ? reader.result : "" });
    reader.readAsDataURL(file);
  }
  function searchScan() {
    if (!scan) return;
    const clue = query.trim() ? ` Additional clue: ${query.trim()}.` : "";
    onDiscover(`Identify the book from a ${scan.kind} image named ${scan.name}.${clue} Ask for one distinguishing detail if the image alone is not enough.`);
  }
  function voice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceStatus("Voice description is not supported by this browser. Type the clue instead.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => setVoiceStatus("Listening…");
    recognition.onerror = () => setVoiceStatus("I could not hear that clearly. Try again or type it.");
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setQuery(transcript);
      setVoiceStatus(`Heard: ${transcript}`);
    };
    recognition.start();
  }

  return <section className="notverse-view search-view"><header><span className="notverse-eyebrow">Find the thing you half remember</span><h1>Search</h1><p>Title, author, character, plot, colour, ISBN, a photographed page or one stubborn detail.</p></header><form className="notverse-search-box" onSubmit={submit}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search books, manga, comics, PDFs…" /><button type="submit">Search</button></form><div className="search-action-grid"><button type="button" onClick={() => chooseScan("cover")}><span>▣</span><strong>Scan Cover</strong><small>Identify title, edition, series or ISBN.</small></button><button type="button" onClick={() => chooseScan("page")}><span>▤</span><strong>Scan Page</strong><small>Use text and visual clues to suggest a match.</small></button><button type="button" onClick={onSource}><span>⌁</span><strong>Paste Link</strong><small>Verify the actual reading file before opening.</small></button><button type="button" onClick={() => { setQuery("I remember a book where "); document.querySelector<HTMLInputElement>(".notverse-search-box input")?.focus(); }}><span>✦</span><strong>Describe It</strong><small>Tell NoTVerse what you remember.</small></button><button type="button" onClick={voice}><span>◉</span><strong>Voice Description</strong><small>Say the clue instead of typing it.</small></button><button type="button" onClick={onUpload}><span>↑</span><strong>Upload a file</strong><small>Open PDF, EPUB, CBZ or TXT directly.</small></button></div><input ref={fileRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={scanFile} />{voiceStatus && <p className="voice-status">{voiceStatus}</p>}{scan && <article className="scan-preview"><img src={scan.preview} alt="" /><div><span>{scan.kind === "cover" ? "Cover scan" : "Page scan"}</span><strong>{scan.name}</strong><p>NoTVerse will search candidates and ask for confirmation before opening or saving anything.</p><button type="button" onClick={searchScan}>Find likely matches</button></div></article>}<section className="rating-principle"><span>Overall Rating</span><h2>Ratings are shown only when approved sources agree on the edition.</h2><p>NoTVerse never fabricates stars. Goodreads and two additional approved providers must supply identifiers, rating counts and match confidence before a weighted value appears.</p><b>Provider connections pending · No fake score shown</b></section></section>;
}

function LibraryView({ books, onOpen }: { books: BookLike[]; onOpen: (book: BookLike) => void }) {
  const [wanted, setWanted] = usePersistentState<string[]>("notverse.wanted", ["The Name of the Wind", "Jujutsu Kaisen Vol. 0"]);
  const [nextWanted, setNextWanted] = useState("");
  return <section className="notverse-view library-view"><header><span className="notverse-eyebrow">Saved deliberately</span><h1>Library</h1><p>Titles, verified source records, progress, offline files and Drive files stay distinct.</p></header><div className="library-status-row"><span><strong>{books.length}</strong> titles</span><span><strong>{books.filter((book) => book.offline).length}</strong> offline</span><span><strong>{books.filter((book) => book.driveFileId).length}</strong> in Drive</span></div><div className="library-grid">{books.map((book) => <button type="button" key={book.id} onClick={() => onOpen(book)}><span><img src={book.cover} alt="" />{book.badge && <i>{book.badge}</i>}</span><strong>{book.title}</strong><small>{book.subtitle}</small><em>{book.currentPage && book.totalPages ? `Page ${book.currentPage} of ${book.totalPages}` : `${book.progress}% complete`}</em><b>{book.offline ? "Offline" : book.driveFileId ? "Drive" : book.sourceUrl ? "Source saved" : "Metadata"}</b></button>)}</div><section className="wanted-list"><header><div><span>Wanted</span><h2>Things NoTVerse should keep looking for.</h2></div></header><form onSubmit={(event) => { event.preventDefault(); if (!nextWanted.trim()) return; setWanted((current) => [...current, nextWanted.trim()]); setNextWanted(""); }}><input value={nextWanted} onChange={(event) => setNextWanted(event.target.value)} placeholder="Add a title or half-remembered clue" /><button>Add</button></form>{wanted.map((item) => <article key={item}><span>⌕</span><strong>{item}</strong><button type="button" onClick={() => setWanted((current) => current.filter((value) => value !== item))}>×</button></article>)}</section></section>;
}

type InboxMessageRecord = {
  id: string;
  text: string;
  mine: boolean;
  time: string;
};

function InboxView({ displayName }: { displayName: string }) {
  const [threads, setThreads] = usePersistentState<InboxThread[]>("notverse.inbox", starterInbox);
  const [selected, setSelected] = useState(threads[0]?.id || "");
  const [draft, setDraft] = useState("");
  const [messagesByThread, setMessagesByThread] = usePersistentState<Record<string, InboxMessageRecord[]>>(
    "notverse.inbox.messages",
    starterInbox[0]
      ? {
          [starterInbox[0].id]: [
            { id: "starter-received-1", text: "That panel is exactly what I meant.", mine: false, time: "Earlier" },
            { id: "starter-sent-1", text: "The page turn made it land even harder.", mine: true, time: "Earlier" },
            { id: "starter-received-2", text: "I shared the Note. Spoiler boundary is set to Chapter 34.", mine: false, time: "Earlier" },
          ],
        }
      : {},
  );
  const active = threads.find((thread) => thread.id === selected);
  const activeMessages = active ? messagesByThread[active.id] || [] : [];

  function selectThread(id: string) {
    setSelected(id);
    setThreads((current) => current.map((item) => item.id === id ? { ...item, unread: 0 } : item));
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!active || !text) return;
    const now = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date());
    const message: InboxMessageRecord = {
      id: `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      mine: true,
      time: now,
    };
    setMessagesByThread((current) => ({
      ...current,
      [active.id]: [...(current[active.id] || []), message],
    }));
    setThreads((current) => {
      const updated = current.map((item) => item.id === active.id
        ? { ...item, preview: text, time: now, unread: 0 }
        : item);
      const chosen = updated.find((item) => item.id === active.id);
      return chosen ? [chosen, ...updated.filter((item) => item.id !== active.id)] : updated;
    });
    setDraft("");
  }

  return (
    <section className="notverse-view inbox-view">
      <header>
        <span className="notverse-eyebrow">Private conversations</span>
        <h1>Inbox</h1>
        <p>Messages, Note shares, book shares and Notebook invitations.</p>
      </header>
      <div className="inbox-layout">
        <aside>
          {threads.map((thread) => (
            <button type="button" className={selected === thread.id ? "active" : ""} key={thread.id} onClick={() => selectThread(thread.id)}>
              <span>{thread.name.slice(0, 1)}</span>
              <div><strong>{thread.name}</strong><small>{thread.preview}</small></div>
              <time>{thread.time}</time>
              {thread.unread > 0 && <b>{thread.unread}</b>}
            </button>
          ))}
        </aside>
        <main>
          {active ? (
            <>
              <header>
                <span>{active.name.slice(0, 1)}</span>
                <div><strong>{active.name}</strong><small>Private conversation with {displayName}</small></div>
                <button type="button" aria-label="Conversation options">•••</button>
              </header>
              <div className="message-thread" aria-live="polite">
                {activeMessages.length ? activeMessages.map((message) => (
                  <p className={message.mine ? "sent" : "received"} key={message.id}>
                    {message.text}
                    <time>{message.time}</time>
                  </p>
                )) : <p className="inbox-empty">No messages yet. Start the conversation when you are ready.</p>}
              </div>
              <form onSubmit={sendMessage}>
                <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a private message…" aria-label="Private message" />
                <button type="submit" disabled={!draft.trim()}>Send</button>
              </form>
            </>
          ) : <p>Select a conversation.</p>}
        </main>
      </div>
    </section>
  );
}

function ProfileNotebook({ displayName, avatar, status, books, onSettings }: { displayName: string; avatar?: string; status?: string; books: BookLike[]; onSettings: () => void }) {
  const [notebooks] = usePersistentState<NotebookRecord[]>("notverse.notebooks", starterNotebooks);
  return <section className="notverse-view profile-notebook"><header className="profile-cover"><div className="profile-main-avatar">{avatar ? <img src={avatar} alt="" /> : displayName.slice(0, 1)}</div><div><span className="notverse-eyebrow">My Notebook</span><h1>{displayName}</h1><p>{status || "Reading, remembering and leaving Notes in the margins."}</p></div><button type="button" onClick={onSettings}>Edit profile</button></header><div className="profile-stat-row"><span><strong>{books.length}</strong> Library</span><span><strong>{notebooks.length}</strong> Notebooks</span><span><strong>3</strong> Public Notes</span><span><strong>27</strong> Following</span></div><section className="profile-paper"><span className="note-tape" /><h2>Created for Nancy. Shared with the world.</h2><p>Public sections show only what the reader allows. Private Notes, drafts, hidden books, history and saved files stay private.</p><div className="profile-genres"><b>Manga</b><b>Novels</b><b>Research</b><b>Comics</b></div></section><section className="notverse-section"><header><div><span>Joined Notebooks</span><h2>Your reading circles.</h2></div></header><div className="notebook-row">{notebooks.map((notebook) => <article key={notebook.id} style={{ "--notebook-accent": notebook.coverAccent } as React.CSSProperties}><span>▤</span><div><strong>{notebook.name}</strong><small>{notebook.type}</small><p>{notebook.description}</p></div></article>)}</div></section></section>;
}
