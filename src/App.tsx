import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { avatarImages, type AvatarId } from "./avatars";

type ThemeId = "pink" | "crimson" | "violet" | "blue" | "emerald" | "orange" | "rose" | "teal";
type View = "home" | "library" | "reader" | "notes" | "settings";
type ChatMessage = { role: "user" | "companion"; text: string; attachment?: string };
type Companion = { id: AvatarId; name: string; series: "JJK" | "Naruto"; vibe: string; greeting: string; ring: string };

const companions: Companion[] = [
  { id: "gojo", name: "Gojo", series: "JJK", vibe: "Playful · confident · teasing", greeting: "I’m ready when you are, pretty reader. Try not to choose something boring; I have a reputation.", ring: "#ff4fa3" },
  { id: "itachi", name: "Itachi", series: "Naruto", vibe: "Calm · observant · mysterious", greeting: "Take your time. A good story reveals itself when you stop forcing the page.", ring: "#ef3340" },
  { id: "naruto", name: "Naruto", series: "Naruto", vibe: "Warm · loyal · energetic", greeting: "Okay! Pick a story and let’s finish one more chapter than we promised.", ring: "#ff9f1c" },
  { id: "kakashi", name: "Kakashi", series: "Naruto", vibe: "Relaxed · clever · dry humour", greeting: "I was going to suggest an early night. Then I saw your reading list.", ring: "#66b8ff" },
  { id: "megumi", name: "Megumi", series: "JJK", vibe: "Reserved · thoughtful · quietly caring", greeting: "I filtered out the noisy recommendations. You’re welcome.", ring: "#14d9c4" },
  { id: "sasuke", name: "Sasuke", series: "Naruto", vibe: "Direct · intense · attentive", greeting: "Choose. I already removed the weak options.", ring: "#8d5cff" },
  { id: "maki", name: "Maki", series: "JJK", vibe: "Strong · blunt · protective", greeting: "Read what you like. Anyone judging your shelf can leave.", ring: "#39d98a" },
  { id: "nobara", name: "Nobara", series: "JJK", vibe: "Bold · stylish · sassy", greeting: "We’re picking something with taste. That narrows the internet considerably.", ring: "#ff5f8f" },
  { id: "hinata", name: "Hinata", series: "Naruto", vibe: "Gentle · supportive · sweet", greeting: "Your page is safe. We can continue whenever you feel ready.", ring: "#c78cff" },
  { id: "sakura", name: "Sakura", series: "Naruto", vibe: "Caring · practical · fiery", greeting: "Drink water, fix your posture, then open the next chapter.", ring: "#ff719f" },
  { id: "temari", name: "Temari", series: "Naruto", vibe: "Sharp · strategic · witty", greeting: "I ranked the choices. Yes, your chaotic favourite still made the list.", ring: "#f3bd36" },
  { id: "mei", name: "Mei Mei", series: "JJK", vibe: "Elegant · composed · calculating", greeting: "Your time is valuable. I selected only stories worth spending it on.", ring: "#7bd6ff" },
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

const books = [
  { title: "Thorns of Destiny", genre: "Fantasy", progress: 72, art: "linear-gradient(145deg,#d3d8ff,#252a54)" },
  { title: "Moonlit Requiem", genre: "Romance", progress: 61, art: "linear-gradient(145deg,#4a203d,#11131f)" },
  { title: "Silent Crown", genre: "Fantasy", progress: 33, art: "linear-gradient(145deg,#e8cda7,#38291e)" },
  { title: "Hearts in Orbit", genre: "Romance", progress: 48, art: "linear-gradient(145deg,#f4a8c6,#453152)" },
  { title: "Inkbound", genre: "Adventure", progress: 25, art: "linear-gradient(145deg,#ef744d,#2a1619)" },
];

function getInitial<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [companionId, setCompanionId] = useState<AvatarId>(() => getInitial("rv-companion", "gojo"));
  const [themeId, setThemeId] = useState<ThemeId>(() => getInitial("rv-theme", "pink"));
  const [ringColors, setRingColors] = useState<Record<string, string>>(() => getInitial("rv-rings", Object.fromEntries(companions.map((item) => [item.id, item.ring]))));
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [page, setPage] = useState(186);
  const [flipping, setFlipping] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(() => getInitial("rv-note", "Reminder to self: this passage matters. Come back later. ✨"));
  const [highlights, setHighlights] = useState<string[]>(() => getInitial("rv-highlights", ["Strength is not just what you have. It is what you choose to protect when no one is watching."]));
  const fileRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const companion = useMemo(() => companions.find((item) => item.id === companionId) ?? companions[0], [companionId]);
  const theme = themes[themeId];
  const ring = ringColors[companion.id] ?? companion.ring;
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  useEffect(() => { localStorage.setItem("rv-companion", JSON.stringify(companionId)); }, [companionId]);
  useEffect(() => { localStorage.setItem("rv-theme", JSON.stringify(themeId)); }, [themeId]);
  useEffect(() => { localStorage.setItem("rv-rings", JSON.stringify(ringColors)); }, [ringColors]);
  useEffect(() => { localStorage.setItem("rv-note", JSON.stringify(note)); }, [note]);
  useEffect(() => { localStorage.setItem("rv-highlights", JSON.stringify(highlights)); }, [highlights]);

  function chooseCompanion(id: AvatarId) {
    setCompanionId(id);
    setMessages([]);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const clean = question.trim();
    if ((!clean && !uploadedFile) || sending) return;
    const outgoing: ChatMessage = { role: "user", text: clean || `Open ${uploadedFile?.name}`, attachment: uploadedFile?.name };
    setMessages((current) => [...current, outgoing]);
    setQuestion("");
    if (uploadedFile) {
      const file = uploadedFile;
      setUploadedFile(null);
      setMessages((current) => [...current, { role: "companion", text: `${file.name} is ready. Read it now, add it to your library, keep it offline, or save it to Drive later. I promise not to judge the file name. Much.` }]);
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/companion/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: clean, companion: companion.name, vibe: companion.vibe }),
      });
      const body = await response.json() as { answer?: string; error?: string };
      setMessages((current) => [...current, { role: "companion", text: body.answer ?? body.error ?? "That thought escaped. Very dramatic of it." }]);
    } catch {
      setMessages((current) => [...current, { role: "companion", text: "The connection wandered off. Your library didn’t. Try again in a moment." }]);
    } finally { setSending(false); }
  }

  function turnPage(direction: 1 | -1) {
    if (flipping) return;
    setFlipping(true);
    window.setTimeout(() => { setPage((current) => Math.max(1, current + direction * 2)); setFlipping(false); }, 320);
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await readerRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  }

  const appStyle = { "--accent": theme.accent, "--accent-2": theme.accent2, "--ring": ring } as React.CSSProperties;

  return (
    <div className="readverse" style={appStyle}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("home")}><span>Nancy’s</span><strong>READVERSE</strong><small>Your stories. Your world.</small></button>
        <nav>
          {([['home','⌂','Home'],['library','▤','Library'],['reader','▱','Continue Reading'],['notes','✎','Notes & Highlights']] as [View,string,string][]).map(([id, icon, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><i>{icon}</i>{label}</button>
          ))}
          <button onClick={() => setChatOpen(true)}><i>✦</i>Companion</button>
          <button onClick={() => { setSettingsOpen(true); setView("settings"); }}><i>⚙</i>Settings</button>
        </nav>
        <div className="streak"><small>Reading streak</small><strong>27 <em>days</em></strong><p>Plot twist: you’re the main character.</p></div>
        <button className="profile-card" onClick={() => setSettingsOpen(true)}><span className="profile-photo">N</span><span><strong>Nancy</strong><small>Pretty reader ✨</small></span><b>⌄</b></button>
      </aside>

      <main className="workspace">
        <header className="mobile-bar"><button onClick={() => document.body.classList.toggle('menu-open')}>☰</button><strong>READVERSE</strong><button onClick={() => setChatOpen(true)}>✦</button></header>
        {view === "reader" ? (
          <Reader refEl={readerRef} page={page} flipping={flipping} note={note} noteOpen={noteOpen} highlights={highlights} onTurn={turnPage} onFullscreen={toggleFullscreen} onNote={() => setNoteOpen(true)} onCloseNote={() => setNoteOpen(false)} onNoteChange={setNote} onHighlight={(text) => setHighlights((current) => current.includes(text) ? current : [...current, text])} />
        ) : view === "settings" ? (
          <Settings companions={companions} selected={companion} ring={ring} themeId={themeId} ringColors={ringColors} onCompanion={chooseCompanion} onRing={(value) => setRingColors((current) => ({ ...current, [companion.id]: value }))} onTheme={setThemeId} onClose={() => { setSettingsOpen(false); setView("home"); }} />
        ) : view === "notes" ? (
          <section className="page-section"><SectionTitle eyebrow="Your thoughts" title="Notes & Highlights" /><div className="notes-grid"><article className="note-card"><textarea value={note} onChange={(event) => setNote(event.target.value)} /><small>Autosaved locally · Drive sync connects later</small></article>{highlights.map((item) => <blockquote key={item}>{item}<small>Chapter 15 · page {page}</small></blockquote>)}</div></section>
        ) : (
          <Dashboard greeting={greeting} companion={companion} ring={ring} onChat={() => setChatOpen(true)} onReader={() => setView("reader")} onSettings={() => setView("settings")} />
        )}
      </main>

      {!chatOpen && view !== "reader" && <div className="companion-dock"><div className="speech">{companion.greeting}</div><button className="floating-avatar" style={{ borderColor: ring }} onClick={() => setChatOpen(true)}><img src={avatarImages[companion.id]} alt={companion.name} /><span /></button></div>}
      <CompanionChat open={chatOpen} companion={companion} ring={ring} messages={messages} question={question} sending={sending} file={uploadedFile} onClose={() => setChatOpen(false)} onQuestion={setQuestion} onSubmit={sendMessage} onAttach={() => fileRef.current?.click()} onFile={setUploadedFile} />
      <input ref={fileRef} hidden type="file" accept="application/pdf,.pdf,.epub,.cbz,.txt,image/*" onChange={(event) => setUploadedFile(event.target.files?.[0] ?? null)} />
      {settingsOpen && view !== "settings" && <button className="screen-dimmer" onClick={() => setSettingsOpen(false)} aria-label="Close settings" />}
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <header className="section-title"><div><small>{eyebrow}</small><h2>{title}</h2></div><button>View all →</button></header>; }

function Dashboard({ greeting, companion, ring, onChat, onReader, onSettings }: { greeting: string; companion: Companion; ring: string; onChat: () => void; onReader: () => void; onSettings: () => void }) {
  return <>
    <section className="hero-dashboard">
      <div className="hero-copy"><small>COMICS · MANGA · NOVELS · BOOKS</small><h1>{greeting},<br /><span>Nancy.</span></h1><p>Your stories stay temporary unless you choose to add them, favourite them, save the file, or keep them offline.</p><div><button className="primary" onClick={onReader}>▤ Continue Reading</button><button onClick={onChat}>✦ Find with {companion.name}</button></div><div className="genre-pills"><span>Romance</span><span>Dark Fantasy</span><span>Action</span><span>Mystery</span></div></div>
      <div className="hero-companion"><div className="hero-orbit" style={{ borderColor: ring }} /><img src={avatarImages[companion.id]} alt={companion.name} /><div className="hero-signature">{companion.name}</div></div>
      <article className="companion-card"><small>MY COMPANION</small><div><img style={{ borderColor: ring }} src={avatarImages[companion.id]} alt="" /><span><strong>{companion.name}</strong><small>{companion.vibe}</small></span></div><button className="primary" onClick={onChat}>Chat now</button><button onClick={onSettings}>Customize</button></article>
    </section>
    <section className="content-section"><SectionTitle eyebrow="Pick up where you left off" title="Continue Reading" /><div className="book-row">{books.map((book) => <article className="book-card" key={book.title} onClick={onReader}><div className="book-art" style={{ background: book.art }}><span>{book.progress}%</span><b>{book.title.slice(0,1)}</b></div><strong>{book.title}</strong><small>{book.genre}</small><div className="progress"><i style={{ width: `${book.progress}%` }} /></div></article>)}</div></section>
    <section className="dashboard-grid"><article className="feature-card"><small>✦ {companion.name}’s Pick</small><h3>Velvet Eclipse</h3><p>A deal. A lie. A vow that binds. What could possibly go wrong?</p><button className="primary" onClick={onReader}>Read now</button></article><article className="feature-card"><small>♡ Favourites</small><h3>Your forever shelf</h3><p>Everything you loved enough to admit publicly.</p><button>Open shelf</button></article><article className="feature-card"><small>☁ Sync & Offline</small><h3>12 books ready</h3><p>Read anywhere. Google Drive connects after the full experience passes testing.</p><button>Manage storage</button></article></section>
    <section className="content-section"><SectionTitle eyebrow="Match your energy" title="Mood Vibes" /><div className="mood-row"><button>♡ Sweet & Heartwarming</button><button>◐ Dark & Mysterious</button><button>⚔ Fierce & Epic</button><button>☁ Soft & Healing</button><button>✦ Fun & Chaotic</button></div></section>
  </>;
}

function CompanionChat({ open, companion, ring, messages, question, sending, file, onClose, onQuestion, onSubmit, onAttach, onFile }: { open: boolean; companion: Companion; ring: string; messages: ChatMessage[]; question: string; sending: boolean; file: File | null; onClose: () => void; onQuestion: (value: string) => void; onSubmit: (event: FormEvent) => void; onAttach: () => void; onFile: (file: File | null) => void }) {
  return <aside className={`chat-panel ${open ? "open" : ""}`} aria-hidden={!open}>
    <header><img style={{ borderColor: ring }} src={avatarImages[companion.id]} alt={companion.name} /><div><strong>{companion.name}</strong><small>{companion.vibe}</small></div><button onClick={onClose}>×</button></header>
    <div className="chat-body"><div className="message companion"><img src={avatarImages[companion.id]} alt="" /><p>{companion.greeting}</p></div>{messages.map((message, index) => <div key={index} className={`message ${message.role}`}>{message.role === "companion" && <img src={avatarImages[companion.id]} alt="" />}<div><p>{message.text}</p>{message.attachment && <small>📎 {message.attachment}</small>}</div></div>)}{sending && <div className="message companion"><img src={avatarImages[companion.id]} alt="" /><p className="typing">thinking ···</p></div>}</div>
    {file && <div className="attachment-preview"><span>PDF</span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · ready to open</small></div><button onClick={() => onFile(null)}>×</button></div>}
    <div className="quick-actions"><button onClick={() => onQuestion("Find me something sweet and heartwarming")}>♡ Sweet</button><button onClick={() => onQuestion("Find me something dark and mysterious")}>◐ Dark</button><button onClick={() => onQuestion("Surprise me, but protect my sleep")}>✦ Surprise me</button></div>
    <form onSubmit={onSubmit}><button type="button" onClick={onAttach} title="Upload PDF">＋</button><input value={question} onChange={(event) => onQuestion(event.target.value)} placeholder={`Ask ${companion.name} anything…`} /><button className="send" type="submit">➤</button></form>
  </aside>;
}

function Settings({ companions, selected, ring, themeId, ringColors, onCompanion, onRing, onTheme, onClose }: { companions: Companion[]; selected: Companion; ring: string; themeId: ThemeId; ringColors: Record<string,string>; onCompanion: (id: AvatarId) => void; onRing: (value: string) => void; onTheme: (id: ThemeId) => void; onClose: () => void }) {
  const colors = ["#ff4fa3","#ef3340","#9b6dff","#58b8ff","#19c8c2","#36d399","#f3bd36","#ff9f1c","#ffffff"];
  return <section className="settings-page"><header><div><small>Make it yours</small><h2>Appearance & Companion</h2></div><button onClick={onClose}>×</button></header>
    <div className="settings-layout"><div className="companion-picker"><h3>Choose your companion</h3><p>Each keeps ReadVerse reliable, but brings their own humour and delivery.</p><div className="companion-grid">{companions.map((item) => <button className={selected.id === item.id ? "selected" : ""} key={item.id} onClick={() => onCompanion(item.id)}><img style={{ borderColor: ringColors[item.id] ?? item.ring }} src={avatarImages[item.id]} alt={item.name} /><strong>{item.name}</strong><small>{item.vibe}</small></button>)}</div></div>
    <aside className="customizer"><h3>Customize {selected.name}</h3><img className="large-avatar" style={{ borderColor: ring }} src={avatarImages[selected.id]} alt={selected.name} /><label>Companion ring color</label><div className="color-row">{colors.map((color) => <button key={color} className={ring === color ? "chosen" : ""} style={{ background: color }} onClick={() => onRing(color)} />)}</div><label>Site theme</label><div className="theme-grid">{(Object.entries(themes) as [ThemeId, typeof themes[ThemeId]][]).map(([id, value]) => <button key={id} className={themeId === id ? "chosen" : ""} onClick={() => onTheme(id)}><i style={{ background: `linear-gradient(135deg,${value.accent},${value.accent2})` }} />{value.label}</button>)}</div><div className="toggle-line"><span>Ring glow</span><input type="checkbox" defaultChecked /></div><div className="toggle-line"><span>Page flip animation</span><input type="checkbox" defaultChecked /></div></aside></div>
  </section>;
}

function Reader({ refEl, page, flipping, note, noteOpen, highlights, onTurn, onFullscreen, onNote, onCloseNote, onNoteChange, onHighlight }: { refEl: React.RefObject<HTMLDivElement | null>; page: number; flipping: boolean; note: string; noteOpen: boolean; highlights: string[]; onTurn: (direction: 1 | -1) => void; onFullscreen: () => void; onNote: () => void; onCloseNote: () => void; onNoteChange: (value: string) => void; onHighlight: (value: string) => void }) {
  const passage = "Strength is not just what you have. It is what you choose to protect when no one is watching.";
  return <section className="reader" ref={refEl}><header><button onClick={() => history.back()}>‹</button><div><strong>Thorny Crown</strong><small>Chapter 15 · Faint Light in the Rain</small></div><div><button onClick={onNote}>✎</button><button onClick={onFullscreen}>⛶</button></div></header>
    <div className={`book ${flipping ? "flipping" : ""}`}><button className="page-edge left" onClick={() => onTurn(-1)}>‹</button><article className="paper left-page"><small>CHAPTER 15</small><h2>Faint Light in the Rain</h2><p>The rain had not stopped since the evening before. It drummed against the windows of the old dormitory, like fingers tapping out a restless song.</p><p className="highlight" onClick={() => onHighlight(passage)}>{passage}</p><p>Yuji thought about that as he walked the empty hallways, the words echoing louder than the rain.</p><b>{page}</b></article><article className="paper right-page"><p>Outside, somewhere beyond the glass, the city glowed faintly—uncaring, relentless.</p><p>But inside, even in the darkest moments, a choice could still be made.</p><hr /><p className="center">End of Chapter 15</p><b>{page + 1}</b></article><button className="page-edge right" onClick={() => onTurn(1)}>›</button></div>
    <footer><button onClick={() => onTurn(-1)}>←</button><div><i style={{ width: `${Math.min(100, page / 3)}%` }} /></div><span>{page} / 240</span><button onClick={() => onTurn(1)}>→</button></footer>
    {noteOpen && <aside className="notepad"><header><strong>My Note</strong><button onClick={onCloseNote}>×</button></header><div className="note-tools">B&nbsp;&nbsp; <i>I</i>&nbsp;&nbsp; <u>U</u>&nbsp;&nbsp; • List</div><textarea value={note} onChange={(event) => onNoteChange(event.target.value)} /><small>Autosaved · linked to page {page}</small></aside>}
    <div className="reader-hint">Swipe or tap the page edge to turn</div>{highlights.length > 0 && <button className="highlight-count" onClick={onNote}>✦ {highlights.length} highlight{highlights.length === 1 ? "" : "s"}</button>}
  </section>;
}
