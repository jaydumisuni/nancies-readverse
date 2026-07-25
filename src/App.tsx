import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { avatarImages, type AvatarId } from "./avatars";

type ThemeId = "pink" | "crimson" | "violet" | "blue" | "emerald" | "orange" | "rose" | "teal";
type View = "home" | "library" | "reader" | "notes" | "settings";
type ChatMessage = { role: "user" | "companion"; text: string };
type Companion = { id: AvatarId; name: string; vibe: string; greeting: string; ring: string };
type SessionBook = {
  id: string;
  title: string;
  format: string;
  fileUrl: string;
  sourceUrl?: string;
  temporary: true;
  kind: "local" | "source";
};
type ResolveResponse = {
  ok: boolean;
  source?: { sourceUrl: string; directUrl: string; title: string; format: string; streamUrl: string; temporary: true };
  error?: string;
};

const companions: Companion[] = [
  { id: "gojo", name: "Gojo", vibe: "Playful · Confident · Teasing", greeting: "Pick the book. I’ll handle the dramatic commentary.", ring: "#ff4fa3" },
  { id: "itachi", name: "Itachi", vibe: "Calm · Loyal", greeting: "A good story rewards patience.", ring: "#ef3340" },
  { id: "naruto", name: "Naruto", vibe: "Energetic · Loyal", greeting: "One more chapter. We can do it.", ring: "#ff9f1c" },
  { id: "kakashi", name: "Kakashi", vibe: "Relaxed · Wise", greeting: "Your reading list is more interesting than mine.", ring: "#66b8ff" },
  { id: "megumi", name: "Megumi", vibe: "Reserved · Thoughtful", greeting: "I filtered out the noisy recommendations.", ring: "#5f63ff" },
  { id: "sasuke", name: "Sasuke", vibe: "Intense · Driven", greeting: "Choose. Don’t overcomplicate it.", ring: "#a53fff" },
  { id: "maki", name: "Maki", vibe: "Strong · Blunt", greeting: "Read what you like. Ignore everyone else.", ring: "#39d98a" },
  { id: "nobara", name: "Nobara", vibe: "Bold · Sassy", greeting: "We’re choosing something with taste.", ring: "#ff5f8f" },
  { id: "hinata", name: "Hinata", vibe: "Gentle · Sweet", greeting: "We can continue whenever you’re ready.", ring: "#c78cff" },
  { id: "sakura", name: "Sakura", vibe: "Caring · Fiery", greeting: "Fix your posture, then open the next chapter.", ring: "#ff719f" },
  { id: "temari", name: "Temari", vibe: "Strategic · Confident", greeting: "I ranked the choices. Efficiently.", ring: "#f3bd36" },
  { id: "mei", name: "Mei Mei", vibe: "Elegant · Calm", greeting: "Your time is valuable. Let’s spend it well.", ring: "#7bd6ff" },
];

const themes: Record<ThemeId, { label: string; accent: string; accent2: string }> = {
  pink: { label: "Pink Glow", accent: "#ff4fa3", accent2: "#ff8bc5" },
  crimson: { label: "Crimson Night", accent: "#ef3340", accent2: "#ff6978" },
  violet: { label: "Midnight Violet", accent: "#9b6dff", accent2: "#cf9cff" },
  blue: { label: "Icy Blue", accent: "#58b8ff", accent2: "#9edaff" },
  emerald: { label: "Emerald Shadow", accent: "#36d399", accent2: "#7be8be" },
  orange: { label: "Orange Gold", accent: "#ff9f1c", accent2: "#ffd166" },
  rose: { label: "Rose Gold", accent: "#e98b93", accent2: "#ffc2c7" },
  teal: { label: "Teal Night", accent: "#19c8c2", accent2: "#6de2de" },
};

export default function App() {
  const [view, setView] = useState<View>("home");
  const [companionId, setCompanionId] = useState<AvatarId>("gojo");
  const [themeId, setThemeId] = useState<ThemeId>("pink");
  const [ringColors, setRingColors] = useState<Record<string, string>>(() => Object.fromEntries(companions.map((item) => [item.id, item.ring])));
  const [sessionBooks, setSessionBooks] = useState<SessionBook[]>([]);
  const [activeBook, setActiveBook] = useState<SessionBook | null>(null);
  const [resolving, setResolving] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<Set<string>>(new Set());

  const companion = useMemo(() => companions.find((item) => item.id === companionId) ?? companions[0], [companionId]);
  const theme = themes[themeId];
  const ring = ringColors[companion.id] ?? companion.ring;
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }, []);

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
  }, []);

  function openLocalFile(file: File) {
    const format = detectLocalFormat(file);
    if (!format) {
      setNotice("Supported temporary files: PDF, EPUB, CBZ and TXT.");
      return;
    }
    const fileUrl = URL.createObjectURL(file);
    objectUrls.current.add(fileUrl);
    const item: SessionBook = {
      id: crypto.randomUUID(),
      title: file.name.replace(/\.(pdf|epub|cbz|txt)$/i, ""),
      format,
      fileUrl,
      temporary: true,
      kind: "local",
    };
    setSessionBooks((current) => [item, ...current]);
    setActiveBook(item);
    setView("reader");
    setNotice(`${file.name} is open temporarily. No copy was uploaded to Cloudflare.`);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function resolveSource(event: FormEvent) {
    event.preventDefault();
    const clean = sourceUrl.trim();
    if (!clean || resolving) return;
    setResolving(true);
    setNotice("");
    try {
      const response = await fetch("/api/source/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: clean }),
      });
      const data = await response.json() as ResolveResponse;
      if (!response.ok || !data.ok || !data.source) throw new Error(data.error || "The source could not be resolved");
      const item: SessionBook = {
        id: crypto.randomUUID(),
        title: data.source.title,
        format: data.source.format,
        fileUrl: data.source.streamUrl,
        sourceUrl: data.source.sourceUrl,
        temporary: true,
        kind: "source",
      };
      setSessionBooks((current) => [item, ...current.filter((book) => book.sourceUrl !== item.sourceUrl)]);
      setActiveBook(item);
      setView("reader");
      setSourceUrl("");
      setNotice("Source resolved and opened as a temporary stream. No file copy was retained.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The source could not be resolved");
    } finally {
      setResolving(false);
    }
  }

  function removeSessionBook(item: SessionBook) {
    if (item.kind === "local" && objectUrls.current.has(item.fileUrl)) {
      URL.revokeObjectURL(item.fileUrl);
      objectUrls.current.delete(item.fileUrl);
    }
    setSessionBooks((current) => current.filter((book) => book.id !== item.id));
    if (activeBook?.id === item.id) setActiveBook(null);
  }

  function requestGoogleSave(item: SessionBook, what: "file" | "source") {
    const label = what === "file" ? "file" : "source link";
    setNotice(`Google Drive is not connected yet, so the ${label} was not saved. Connect Google first; ReadVerse will never silently keep a Cloudflare copy.`);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const clean = question.trim();
    if (!clean || sending) return;
    const history = messages.slice(-10);
    setMessages((current) => [...current, { role: "user", text: clean }]);
    setQuestion("");
    setSending(true);
    try {
      const response = await fetch("/api/companion/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: clean, companion: companion.name, vibe: companion.vibe, history }),
      });
      const data = await response.json() as { answer?: string; error?: string };
      setMessages((current) => [...current, { role: "companion", text: data.answer ?? data.error ?? "Try again." }]);
    } catch {
      setMessages((current) => [...current, { role: "companion", text: "The connection failed. Nothing was saved or changed." }]);
    } finally {
      setSending(false);
    }
  }

  const appStyle = { "--accent": theme.accent, "--accent-2": theme.accent2, "--ring": ring } as React.CSSProperties;

  return <div className="readverse" style={appStyle}>
    <aside className="sidebar">
      <button className="brand" onClick={() => setView("home")}><span>Nancy’s</span><strong>READVERSE</strong><small>Your stories. Your world.</small></button>
      <nav>
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><i>⌂</i>Home</button>
        <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><i>▤</i>Session</button>
        <button className={view === "reader" ? "active" : ""} onClick={() => activeBook ? setView("reader") : setView("library")}><i>▱</i>Reader</button>
        <button className={view === "notes" ? "active" : ""} onClick={() => setView("notes")}><i>✎</i>Notes</button>
        <button onClick={() => setChatOpen(true)}><i>✦</i>{companion.name}</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><i>⚙</i>Settings</button>
      </nav>
    </aside>

    <main className="workspace">
      <header className="mobile-bar">
        <button onClick={() => document.body.classList.toggle("menu-open")}>☰</button>
        <button className="mobile-brand" aria-label="Nancy's ReadVerse" onClick={() => setView("home")}><span>Nancy’s</span><strong>READVERSE</strong></button>
        <button onClick={() => setChatOpen(true)}>✦</button>
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      {view === "home" && <Home greeting={greeting} companion={companion} ring={ring} books={sessionBooks} onChat={() => setChatOpen(true)} onUpload={() => fileRef.current?.click()} onSession={() => setView("library")} onOpen={(item) => { setActiveBook(item); setView("reader"); }} />}
      {view === "library" && <SessionLibrary items={sessionBooks} resolving={resolving} url={sourceUrl} onUrl={setSourceUrl} onResolve={resolveSource} onUpload={() => fileRef.current?.click()} onOpen={(item) => { setActiveBook(item); setView("reader"); }} onRemove={removeSessionBook} onSaveLink={(item) => requestGoogleSave(item, "source")} />}
      {view === "reader" && <Reader item={activeBook} note={note} onNote={setNote} onBack={() => setView("library")} onSaveFile={(item) => requestGoogleSave(item, "file")} onSaveLink={(item) => requestGoogleSave(item, "source")} />}
      {view === "notes" && <Notes note={note} onNote={setNote} />}
      {view === "settings" && <Settings selected={companion} companionId={companionId} themeId={themeId} ringColors={ringColors} onCompanion={(id) => { setCompanionId(id); setMessages([]); }} onTheme={setThemeId} onRing={(id, value) => setRingColors((current) => ({ ...current, [id]: value }))} onNotice={setNotice} />}
    </main>

    {!chatOpen && view !== "reader" && <button className="floating-avatar" style={{ borderColor: ring }} onClick={() => setChatOpen(true)}><img src={avatarImages[companion.id]} alt={companion.name} /><span /></button>}
    <CompanionChat open={chatOpen} companion={companion} ring={ring} messages={messages} question={question} sending={sending} onClose={() => setChatOpen(false)} onQuestion={setQuestion} onSubmit={sendMessage} onUpload={() => fileRef.current?.click()} />
    <input ref={fileRef} hidden type="file" accept="application/pdf,.pdf,.epub,.cbz,.txt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) openLocalFile(file); }} />
  </div>;
}

function Home({ greeting, companion, ring, books, onChat, onUpload, onSession, onOpen }: { greeting: string; companion: Companion; ring: string; books: SessionBook[]; onChat: () => void; onUpload: () => void; onSession: () => void; onOpen: (item: SessionBook) => void }) {
  return <>
    <section className="hero-dashboard">
      <div className="hero-copy"><small>YOUR READING SESSION IS READY</small><h1>{greeting},<br /><span>Nancy!</span></h1><p>Open a local file or resolve a source link temporarily. Nothing is copied to Cloudflare, and permanent saving happens only after you choose Google Drive.</p><div><button className="primary" onClick={onUpload}>↑ Open a file</button><button onClick={onSession}>Paste a source</button></div></div>
      <article className="companion-card"><small>MY COMPANION</small><div><img style={{ borderColor: ring }} src={avatarImages[companion.id]} alt={companion.name} /><span><strong>{companion.name}</strong><small>{companion.vibe}</small></span></div><button className="primary" onClick={onChat}>Chat now</button><button onClick={onUpload}>Open a file</button></article>
    </section>
    <section className="content-section"><header className="section-title"><div><small>Temporary until you close this tab</small><h2>Current Session</h2></div><button onClick={onSession}>View all →</button></header>
      {books.length ? <div className="book-row">{books.slice(0, 5).map((book) => <button className="book-card" key={book.id} onClick={() => onOpen(book)}><div className="book-art"><span>SESSION</span><b>{book.title.slice(0, 1)}</b></div><strong>{book.title}</strong><small>{book.format.toUpperCase()}</small></button>)}</div> : <EmptySession onUpload={onUpload} />}
    </section>
  </>;
}

function EmptySession({ onUpload }: { onUpload: () => void }) {
  return <div className="empty-library"><h3>No temporary books open</h3><p>Open a PDF, EPUB, CBZ or TXT file. It stays in this browser session only.</p><button className="primary" onClick={onUpload}>Open a file</button></div>;
}

function SessionLibrary({ items, resolving, url, onUrl, onResolve, onUpload, onOpen, onRemove, onSaveLink }: { items: SessionBook[]; resolving: boolean; url: string; onUrl: (value: string) => void; onResolve: (event: FormEvent) => void; onUpload: () => void; onOpen: (item: SessionBook) => void; onRemove: (item: SessionBook) => void; onSaveLink: (item: SessionBook) => void }) {
  return <section className="page-section library-page"><header className="section-title"><div><small>Temporary reading workspace</small><h2>Current Session</h2></div><button className="primary" onClick={onUpload}>Open local file</button></header>
    <form className="url-import" onSubmit={onResolve}><input type="url" value={url} onChange={(event) => onUrl(event.target.value)} placeholder="Paste a source page or direct reading-file link" required /><button className="primary" disabled={resolving}>{resolving ? "Resolving…" : "Open source"}</button></form>
    <p className="privacy-note">ReadVerse removes common tracking parameters, ignores ad links and follows safe redirects. It does not bypass logins, DRM, paywalls, CAPTCHAs or access controls.</p>
    {items.length ? <div className="library-grid">{items.map((item) => <article className="library-item" key={item.id}><button className="library-cover" onClick={() => onOpen(item)}><b>{item.title.slice(0, 1)}</b><span>{item.format.toUpperCase()}</span></button><div><h3>{item.title}</h3><p>{item.kind === "source" ? "Temporary source stream" : "Temporary local file"}</p><div><button className="primary" onClick={() => onOpen(item)}>Read</button>{item.sourceUrl && <button onClick={() => onSaveLink(item)}>Save source link</button>}<button onClick={() => onRemove(item)}>Close</button></div></div></article>)}</div> : <EmptySession onUpload={onUpload} />}
  </section>;
}

function Reader({ item, note, onNote, onBack, onSaveFile, onSaveLink }: { item: SessionBook | null; note: string; onNote: (value: string) => void; onBack: () => void; onSaveFile: (item: SessionBook) => void; onSaveLink: (item: SessionBook) => void }) {
  if (!item) return <section className="page-section"><button onClick={onBack}>← Session</button><EmptySession onUpload={onBack} /></section>;
  const readableInline = item.format === "pdf" || item.format === "txt";
  return <section className="reader real-reader"><header><button onClick={onBack}>‹</button><div><strong>{item.title}</strong><small>{item.format.toUpperCase()} · temporary session</small></div><div><a href={item.fileUrl} target="_blank" rel="noreferrer">Open ↗</a><button onClick={() => onSaveFile(item)}>Save file</button>{item.sourceUrl && <button onClick={() => onSaveLink(item)}>Save link</button>}</div></header>
    <div className="reader-document">{readableInline ? <iframe title={item.title} src={item.fileUrl} /> : <div className="format-message"><h2>{item.format.toUpperCase()} opened temporarily</h2><p>Native in-site rendering for this format is not ready. Use “Open” with a compatible reader. The file is not stored by ReadVerse.</p><a className="primary" href={item.fileUrl} target="_blank" rel="noreferrer">Open temporary file</a></div>}</div>
    <aside className="reader-notes"><label htmlFor="book-note">Session note for {item.title}</label><textarea id="book-note" value={note} onChange={(event) => onNote(event.target.value)} placeholder="Write a temporary note…" /><small>Not saved permanently until Google is connected and you choose save.</small></aside>
  </section>;
}

function Notes({ note, onNote }: { note: string; onNote: (value: string) => void }) {
  return <section className="page-section"><header className="section-title"><div><small>Current session only</small><h2>Notes</h2></div></header><article className="note-card"><textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="Write a reading note…" /><small>Temporary. Google sync is required for permanent notes.</small></article></section>;
}

function Settings({ selected, companionId, themeId, ringColors, onCompanion, onTheme, onRing, onNotice }: { selected: Companion; companionId: AvatarId; themeId: ThemeId; ringColors: Record<string, string>; onCompanion: (id: AvatarId) => void; onTheme: (id: ThemeId) => void; onRing: (id: AvatarId, value: string) => void; onNotice: (value: string) => void }) {
  const colors = ["#ff4fa3", "#ef3340", "#9b6dff", "#58b8ff", "#19c8c2", "#36d399", "#f3bd36", "#ff9f1c", "#ffffff"];
  return <section className="settings-page"><header><div><small>MAKE IT YOURS</small><h2>ReadVerse Settings</h2></div><button className="primary" onClick={() => onNotice("Google is not connected yet. Settings remain temporary and were not saved.")}>Connect Google</button></header><div className="settings-layout"><div className="companion-picker"><h3>Choose your companion</h3><p>Six male · six female · twelve distinct conversation styles</p><div className="companion-grid">{companions.map((item) => <button className={companionId === item.id ? "selected" : ""} key={item.id} onClick={() => onCompanion(item.id)}><img style={{ borderColor: ringColors[item.id] ?? item.ring }} src={avatarImages[item.id]} alt={item.name} /><strong>{item.name}</strong><small>{item.vibe}</small></button>)}</div></div><aside className="customizer"><h3>{selected.name}</h3><img className="large-avatar" style={{ borderColor: ringColors[selected.id] ?? selected.ring }} src={avatarImages[selected.id]} alt={selected.name} /><label>Ring colour</label><div className="color-row">{colors.map((color) => <button key={color} style={{ background: color }} onClick={() => onRing(selected.id, color)} />)}</div><label>Appearance</label><div className="theme-grid">{(Object.entries(themes) as [ThemeId, typeof themes[ThemeId]][]).map(([id, value]) => <button key={id} className={themeId === id ? "chosen" : ""} onClick={() => onTheme(id)}><i style={{ background: `linear-gradient(135deg,${value.accent},${value.accent2})` }} />{value.label}</button>)}</div><p className="privacy-note">Personal settings are not written to Cloudflare. They remain temporary until Google account sync is connected.</p></aside></div></section>;
}

function CompanionChat({ open, companion, ring, messages, question, sending, onClose, onQuestion, onSubmit, onUpload }: { open: boolean; companion: Companion; ring: string; messages: ChatMessage[]; question: string; sending: boolean; onClose: () => void; onQuestion: (value: string) => void; onSubmit: (event: FormEvent) => void; onUpload: () => void }) {
  return <aside className={`chat-panel ${open ? "open" : ""}`} aria-hidden={!open}><header><img style={{ borderColor: ring }} src={avatarImages[companion.id]} alt={companion.name} /><div><strong>{companion.name}</strong><small>{companion.vibe}</small></div><button onClick={onClose}>×</button></header><div className="chat-body"><div className="message companion"><img src={avatarImages[companion.id]} alt="" /><p>{companion.greeting}</p></div>{messages.map((message, index) => <div key={index} className={`message ${message.role}`}>{message.role === "companion" && <img src={avatarImages[companion.id]} alt="" />}<p>{message.text}</p></div>)}{sending && <div className="message companion"><p>Thinking…</p></div>}</div><form onSubmit={onSubmit}><button type="button" onClick={onUpload} title="Open a temporary book">＋</button><input value={question} onChange={(event) => onQuestion(event.target.value)} placeholder={`Ask ${companion.name} anything…`} /><button className="send" type="submit">➤</button></form></aside>;
}

function detectLocalFormat(file: File): string | null {
  const extension = file.name.toLowerCase().split(".").pop() || "";
  if (["pdf", "epub", "cbz", "txt"].includes(extension)) return extension;
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "application/epub+zip") return "epub";
  if (file.type === "text/plain") return "txt";
  return null;
}
