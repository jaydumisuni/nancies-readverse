import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { avatarImages, type AvatarId } from "./avatars";

type ThemeId = "pink" | "crimson" | "violet" | "blue" | "emerald" | "orange" | "rose" | "teal";
type View = "home" | "library" | "reader" | "notes" | "settings";
type ChatMessage = { role: "user" | "companion"; text: string };
type Companion = { id: AvatarId; name: string; vibe: string; greeting: string; ring: string };
type LibraryItem = { id: string; title: string; creator?: string | null; format: string; file_key?: string; added_at: string; locator: string; percentage: number };

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

function readStored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [companionId, setCompanionId] = useState<AvatarId>(() => readStored("rv-companion", "gojo"));
  const [themeId, setThemeId] = useState<ThemeId>(() => readStored("rv-theme", "pink"));
  const [ringColors, setRingColors] = useState<Record<string, string>>(() => readStored("rv-rings", Object.fromEntries(companions.map((item) => [item.id, item.ring]))));
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [activeBook, setActiveBook] = useState<LibraryItem | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [urlToImport, setUrlToImport] = useState("");
  const [notice, setNotice] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState(() => readStored("rv-note", ""));
  const fileRef = useRef<HTMLInputElement>(null);

  const companion = useMemo(() => companions.find((item) => item.id === companionId) ?? companions[0], [companionId]);
  const theme = themes[themeId];
  const ring = ringColors[companion.id] ?? companion.ring;
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }, []);

  useEffect(() => { localStorage.setItem("rv-companion", JSON.stringify(companionId)); }, [companionId]);
  useEffect(() => { localStorage.setItem("rv-theme", JSON.stringify(themeId)); }, [themeId]);
  useEffect(() => { localStorage.setItem("rv-rings", JSON.stringify(ringColors)); }, [ringColors]);
  useEffect(() => { localStorage.setItem("rv-note", JSON.stringify(note)); }, [note]);
  useEffect(() => { void refreshLibrary(); }, []);

  async function refreshLibrary() {
    setLoadingLibrary(true);
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const data = await response.json() as { ok: boolean; items?: LibraryItem[]; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load library");
      setLibrary(data.items ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load library");
    } finally { setLoadingLibrary(false); }
  }

  async function uploadFile(file: File) {
    setUploading(true); setNotice("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/library/upload", { method: "POST", body: form });
      const data = await response.json() as { ok: boolean; item?: LibraryItem; error?: string };
      if (!response.ok || !data.ok || !data.item) throw new Error(data.error || "Upload failed");
      await refreshLibrary();
      const item = { ...data.item, added_at: new Date().toISOString(), locator: "page:1", percentage: 0 } as LibraryItem;
      setActiveBook(item); setView("reader"); setNotice(`${file.name} added to your library.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function importUrl(event: FormEvent) {
    event.preventDefault();
    if (!urlToImport.trim()) return;
    setImporting(true); setNotice("");
    try {
      const response = await fetch("/api/library/import-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: urlToImport.trim() }) });
      const data = await response.json() as { ok: boolean; item?: LibraryItem; error?: string };
      if (!response.ok || !data.ok || !data.item) throw new Error(data.error || "Import failed");
      await refreshLibrary();
      const item = { ...data.item, added_at: new Date().toISOString(), locator: "page:1", percentage: 0 } as LibraryItem;
      setActiveBook(item); setView("reader"); setUrlToImport(""); setNotice("Link imported successfully.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Import failed"); }
    finally { setImporting(false); }
  }

  async function removeBook(item: LibraryItem) {
    const response = await fetch(`/api/library/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (response.ok) { if (activeBook?.id === item.id) setActiveBook(null); await refreshLibrary(); }
  }

  function openBook(item: LibraryItem) { setActiveBook(item); setView("reader"); }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const clean = question.trim(); if (!clean || sending) return;
    setMessages((current) => [...current, { role: "user", text: clean }]); setQuestion(""); setSending(true);
    try {
      const response = await fetch("/api/companion/help", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: clean, companion: companion.name, vibe: companion.vibe }) });
      const data = await response.json() as { answer?: string; error?: string };
      setMessages((current) => [...current, { role: "companion", text: data.answer ?? data.error ?? "Try again." }]);
    } catch { setMessages((current) => [...current, { role: "companion", text: "The connection failed. Your library is still safe." }]); }
    finally { setSending(false); }
  }

  const appStyle = { "--accent": theme.accent, "--accent-2": theme.accent2, "--ring": ring } as React.CSSProperties;

  return <div className="readverse" style={appStyle}>
    <aside className="sidebar">
      <button className="brand" onClick={() => setView("home")}><span>Nancy’s</span><strong>READVERSE</strong><small>Your stories. Your world.</small></button>
      <nav>
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><i>⌂</i>Home</button>
        <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><i>▤</i>Library</button>
        <button className={view === "reader" ? "active" : ""} onClick={() => activeBook ? setView("reader") : setView("library")}><i>▱</i>Reader</button>
        <button className={view === "notes" ? "active" : ""} onClick={() => setView("notes")}><i>✎</i>Notes</button>
        <button onClick={() => setChatOpen(true)}><i>✦</i>{companion.name}</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><i>⚙</i>Settings</button>
      </nav>
    </aside>

    <main className="workspace">
      <header className="mobile-bar">
        <button onClick={() => document.body.classList.toggle("menu-open")}>☰</button>
        <button className="mobile-brand" onClick={() => setView("home")}><span>Nancy’s</span><strong>READVERSE</strong></button>
        <button onClick={() => setChatOpen(true)}>✦</button>
      </header>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      {view === "home" && <Home greeting={greeting} companion={companion} ring={ring} library={library} onChat={() => setChatOpen(true)} onUpload={() => fileRef.current?.click()} onLibrary={() => setView("library")} onOpen={openBook} />}
      {view === "library" && <Library items={library} loading={loadingLibrary} uploading={uploading} importing={importing} url={urlToImport} onUrl={setUrlToImport} onImport={importUrl} onUpload={() => fileRef.current?.click()} onOpen={openBook} onDelete={removeBook} />}
      {view === "reader" && <Reader item={activeBook} note={note} onNote={setNote} onBack={() => setView("library")} />}
      {view === "notes" && <Notes note={note} onNote={setNote} />}
      {view === "settings" && <Settings selected={companion} companionId={companionId} themeId={themeId} ringColors={ringColors} onCompanion={setCompanionId} onTheme={setThemeId} onRing={(id, value) => setRingColors((current) => ({ ...current, [id]: value }))} />}
    </main>

    {!chatOpen && view !== "reader" && <button className="floating-avatar" style={{ borderColor: ring }} onClick={() => setChatOpen(true)}><img src={avatarImages[companion.id]} alt={companion.name} /><span /></button>}
    <CompanionChat open={chatOpen} companion={companion} ring={ring} messages={messages} question={question} sending={sending} onClose={() => setChatOpen(false)} onQuestion={setQuestion} onSubmit={sendMessage} onUpload={() => fileRef.current?.click()} />
    <input ref={fileRef} hidden type="file" accept="application/pdf,.pdf,.epub,.cbz,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
  </div>;
}

function Home({ greeting, companion, ring, library, onChat, onUpload, onLibrary, onOpen }: { greeting: string; companion: Companion; ring: string; library: LibraryItem[]; onChat: () => void; onUpload: () => void; onLibrary: () => void; onOpen: (item: LibraryItem) => void }) {
  return <>
    <section className="hero-dashboard">
      <div className="hero-copy"><small>YOUR SHELF IS READY</small><h1>{greeting},<br /><span>Nancy!</span></h1><p>Upload a book or import a direct file link, then read it from your library.</p><div><button className="primary" onClick={onUpload}>↑ Upload a book</button><button onClick={onLibrary}>Open library</button></div></div>
      <article className="companion-card"><small>MY COMPANION</small><div><img style={{ borderColor: ring }} src={avatarImages[companion.id]} alt={companion.name} /><span><strong>{companion.name}</strong><small>{companion.vibe}</small></span></div><button className="primary" onClick={onChat}>Chat now</button><button onClick={onUpload}>Upload a file</button></article>
    </section>
    <section className="content-section"><header className="section-title"><div><small>Your saved books</small><h2>Continue Reading</h2></div><button onClick={onLibrary}>View all →</button></header>
      {library.length ? <div className="book-row">{library.slice(0, 5).map((book) => <button className="book-card" key={book.id} onClick={() => onOpen(book)}><div className="book-art"><span>{Math.round(book.percentage || 0)}%</span><b>{book.title.slice(0, 1)}</b></div><strong>{book.title}</strong><small>{book.format.toUpperCase()}</small><div className="progress"><i style={{ width: `${book.percentage || 0}%` }} /></div></button>)}</div> : <EmptyLibrary onUpload={onUpload} />}
    </section>
  </>;
}

function EmptyLibrary({ onUpload }: { onUpload: () => void }) { return <div className="empty-library"><h3>Your library is empty</h3><p>Add a PDF, EPUB, CBZ or TXT file to begin.</p><button className="primary" onClick={onUpload}>Upload your first book</button></div>; }

function Library({ items, loading, uploading, importing, url, onUrl, onImport, onUpload, onOpen, onDelete }: { items: LibraryItem[]; loading: boolean; uploading: boolean; importing: boolean; url: string; onUrl: (value: string) => void; onImport: (event: FormEvent) => void; onUpload: () => void; onOpen: (item: LibraryItem) => void; onDelete: (item: LibraryItem) => void }) {
  return <section className="page-section library-page"><header className="section-title"><div><small>Your saved collection</small><h2>Library</h2></div><button className="primary" onClick={onUpload} disabled={uploading}>{uploading ? "Uploading…" : "Upload file"}</button></header>
    <form className="url-import" onSubmit={onImport}><input type="url" value={url} onChange={(event) => onUrl(event.target.value)} placeholder="Paste a direct PDF, EPUB, CBZ or TXT link" required /><button className="primary" disabled={importing}>{importing ? "Importing…" : "Import link"}</button></form>
    {loading ? <p>Loading your library…</p> : items.length ? <div className="library-grid">{items.map((item) => <article className="library-item" key={item.id}><button className="library-cover" onClick={() => onOpen(item)}><b>{item.title.slice(0, 1)}</b><span>{item.format.toUpperCase()}</span></button><div><h3>{item.title}</h3><p>{Math.round(item.percentage || 0)}% complete</p><div><button className="primary" onClick={() => onOpen(item)}>Read</button><button onClick={() => void onDelete(item)}>Remove</button></div></div></article>)}</div> : <EmptyLibrary onUpload={onUpload} />}
  </section>;
}

function Reader({ item, note, onNote, onBack }: { item: LibraryItem | null; note: string; onNote: (value: string) => void; onBack: () => void }) {
  if (!item) return <section className="page-section"><button onClick={onBack}>← Library</button><EmptyLibrary onUpload={onBack} /></section>;
  const fileUrl = `/api/library/${encodeURIComponent(item.id)}/file`;
  const readableInline = item.format === "pdf" || item.format === "txt";
  return <section className="reader real-reader"><header><button onClick={onBack}>‹</button><div><strong>{item.title}</strong><small>{item.format.toUpperCase()} · saved in your library</small></div><a href={fileUrl} target="_blank" rel="noreferrer">Open file ↗</a></header>
    <div className="reader-document">{readableInline ? <iframe title={item.title} src={fileUrl} /> : <div className="format-message"><h2>{item.format.toUpperCase()} saved successfully</h2><p>This format is stored in your library. Use “Open file” to read it with a compatible reader.</p><a className="primary" href={fileUrl}>Download/Open</a></div>}</div>
    <aside className="reader-notes"><label htmlFor="book-note">Notes for {item.title}</label><textarea id="book-note" value={note} onChange={(event) => onNote(event.target.value)} placeholder="Write a note…" /><small>Saved on this device.</small></aside>
  </section>;
}

function Notes({ note, onNote }: { note: string; onNote: (value: string) => void }) { return <section className="page-section"><header className="section-title"><div><small>Your thoughts</small><h2>Notes</h2></div></header><article className="note-card"><textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="Write a reading note…" /><small>Autosaved locally</small></article></section>; }

function Settings({ selected, companionId, themeId, ringColors, onCompanion, onTheme, onRing }: { selected: Companion; companionId: AvatarId; themeId: ThemeId; ringColors: Record<string, string>; onCompanion: (id: AvatarId) => void; onTheme: (id: ThemeId) => void; onRing: (id: AvatarId, value: string) => void }) {
  const colors = ["#ff4fa3", "#ef3340", "#9b6dff", "#58b8ff", "#19c8c2", "#36d399", "#f3bd36", "#ff9f1c", "#ffffff"];
  return <section className="settings-page"><header><div><small>MAKE IT YOURS</small><h2>ReadVerse Settings</h2></div></header><div className="settings-layout"><div className="companion-picker"><h3>Choose your companion</h3><p>Six male · six female · twelve different vibes</p><div className="companion-grid">{companions.map((item) => <button className={companionId === item.id ? "selected" : ""} key={item.id} onClick={() => onCompanion(item.id)}><img style={{ borderColor: ringColors[item.id] ?? item.ring }} src={avatarImages[item.id]} alt={item.name} /><strong>{item.name}</strong><small>{item.vibe}</small></button>)}</div></div><aside className="customizer"><h3>{selected.name}</h3><img className="large-avatar" style={{ borderColor: ringColors[selected.id] ?? selected.ring }} src={avatarImages[selected.id]} alt={selected.name} /><label>Ring colour</label><div className="color-row">{colors.map((color) => <button key={color} style={{ background: color }} onClick={() => onRing(selected.id, color)} />)}</div><label>Appearance</label><div className="theme-grid">{(Object.entries(themes) as [ThemeId, typeof themes[ThemeId]][]).map(([id, value]) => <button key={id} className={themeId === id ? "chosen" : ""} onClick={() => onTheme(id)}><i style={{ background: `linear-gradient(135deg,${value.accent},${value.accent2})` }} />{value.label}</button>)}</div></aside></div></section>;
}

function CompanionChat({ open, companion, ring, messages, question, sending, onClose, onQuestion, onSubmit, onUpload }: { open: boolean; companion: Companion; ring: string; messages: ChatMessage[]; question: string; sending: boolean; onClose: () => void; onQuestion: (value: string) => void; onSubmit: (event: FormEvent) => void; onUpload: () => void }) {
  return <aside className={`chat-panel ${open ? "open" : ""}`} aria-hidden={!open}><header><img style={{ borderColor: ring }} src={avatarImages[companion.id]} alt={companion.name} /><div><strong>{companion.name}</strong><small>{companion.vibe}</small></div><button onClick={onClose}>×</button></header><div className="chat-body"><div className="message companion"><img src={avatarImages[companion.id]} alt="" /><p>{companion.greeting}</p></div>{messages.map((message, index) => <div key={index} className={`message ${message.role}`}>{message.role === "companion" && <img src={avatarImages[companion.id]} alt="" />}<p>{message.text}</p></div>)}{sending && <div className="message companion"><p>Thinking…</p></div>}</div><form onSubmit={onSubmit}><button type="button" onClick={onUpload} title="Upload a book">＋</button><input value={question} onChange={(event) => onQuestion(event.target.value)} placeholder={`Ask ${companion.name} anything…`} /><button className="send" type="submit">➤</button></form></aside>;
}
