import { FormEvent, useMemo, useRef, useState, type CSSProperties } from "react";
import { avatarImages, type AvatarId } from "./avatars";

type ThemeId = "pink" | "violet" | "blue" | "emerald" | "orange" | "rose";
type View = "home" | "library" | "notes";
type SettingsTab = "profile" | "companion" | "appearance" | "reader" | "storage";
type Message = { role: "user" | "companion"; text: string; attachment?: string };

type Companion = {
  id: AvatarId;
  name: string;
  series: "JJK" | "Naruto";
  vibe: string;
  shortVibe: string;
  greeting: string;
  ring: string;
};

const companions: Companion[] = [
  { id: "gojo", name: "Gojo", series: "JJK", vibe: "Playful · Confident · Teasing", shortVibe: "Playful · Confident", greeting: "I’m ready when you are, pretty reader. Try not to choose something boring; I have a reputation.", ring: "#ff4fa3" },
  { id: "itachi", name: "Itachi", series: "Naruto", vibe: "Calm · Loyal · Observant", shortVibe: "Calm · Loyal", greeting: "Take your time. A good story reveals itself when you stop forcing the page.", ring: "#ef3340" },
  { id: "naruto", name: "Naruto", series: "Naruto", vibe: "Energetic · Loyal · Warm", shortVibe: "Energetic · Loyal", greeting: "Okay! Pick a story and let’s finish one more chapter than we promised.", ring: "#ff9f1c" },
  { id: "kakashi", name: "Kakashi", series: "Naruto", vibe: "Relaxed · Wise · Dry humour", shortVibe: "Relaxed · Wise", greeting: "I was going to suggest an early night. Then I saw your reading list.", ring: "#66b8ff" },
  { id: "megumi", name: "Megumi", series: "JJK", vibe: "Reserved · Thoughtful · Quietly caring", shortVibe: "Reserved · Thoughtful", greeting: "I filtered out the noisy recommendations. You’re welcome.", ring: "#6c73ff" },
  { id: "sasuke", name: "Sasuke", series: "Naruto", vibe: "Intense · Driven · Direct", shortVibe: "Intense · Driven", greeting: "Choose. I already removed the weak options.", ring: "#8d5cff" },
  { id: "maki", name: "Maki", series: "JJK", vibe: "Strong · Blunt · Protective", shortVibe: "Strong · Blunt", greeting: "Read what you like. Anyone judging your shelf can leave.", ring: "#39d98a" },
  { id: "nobara", name: "Nobara", series: "JJK", vibe: "Bold · Sassy · Stylish", shortVibe: "Bold · Sassy", greeting: "We’re picking something with taste. That narrows the internet considerably.", ring: "#ff5f8f" },
  { id: "hinata", name: "Hinata", series: "Naruto", vibe: "Gentle · Sweet · Supportive", shortVibe: "Gentle · Sweet", greeting: "Your page is safe. We can continue whenever you feel ready.", ring: "#c78cff" },
  { id: "sakura", name: "Sakura", series: "Naruto", vibe: "Caring · Fiery · Practical", shortVibe: "Caring · Fiery", greeting: "Drink water, fix your posture, then open the next chapter.", ring: "#ff719f" },
  { id: "temari", name: "Temari", series: "Naruto", vibe: "Strategic · Confident · Witty", shortVibe: "Strategic · Confident", greeting: "I ranked the choices. Yes, your chaotic favourite still made the list.", ring: "#f3bd36" },
  { id: "mei", name: "Mei Mei", series: "JJK", vibe: "Elegant · Calm · Calculating", shortVibe: "Elegant · Calm", greeting: "Your time is valuable. I selected only stories worth spending it on.", ring: "#7bd6ff" },
];

const themes: Record<ThemeId, { label: string; accent: string; accent2: string }> = {
  pink: { label: "Pink Glow", accent: "#ff4fa3", accent2: "#ff8bc5" },
  violet: { label: "Midnight Violet", accent: "#9b6dff", accent2: "#cf9cff" },
  blue: { label: "Icy Blue", accent: "#58b8ff", accent2: "#9edaff" },
  emerald: { label: "Emerald Shadow", accent: "#36d399", accent2: "#7be8be" },
  orange: { label: "Orange Gold", accent: "#ff9f1c", accent2: "#ffd166" },
  rose: { label: "Rose Gold", accent: "#e98b93", accent2: "#ffc2c7" },
};

const books = [
  { title: "Jujutsu Kaisen", meta: "Chapter 186", progress: 68, art: "linear-gradient(145deg,#ac8bff,#1c1738)" },
  { title: "Chainsaw Man", meta: "Chapter 42", progress: 34, art: "linear-gradient(145deg,#7d224d,#121018)" },
  { title: "Solo Leveling", meta: "Chapter 188", progress: 82, art: "linear-gradient(145deg,#e7c793,#2f2119)" },
  { title: "One Piece", meta: "Chapter 1041", progress: 47, art: "linear-gradient(145deg,#f39ac5,#41263f)" },
  { title: "Blue Lock", meta: "Volume 21", progress: 25, art: "linear-gradient(145deg,#ef744d,#29141a)" },
];

const ringPalette = ["#ff4fa3", "#ef3340", "#9b6dff", "#58b8ff", "#19c8c2", "#36d399", "#f3bd36", "#ff9f1c", "#ffffff"];

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [companionId, setCompanionId] = useState<AvatarId>("gojo");
  const [themeId, setThemeId] = useState<ThemeId>("pink");
  const [ringColors, setRingColors] = useState<Record<string, string>>(() => Object.fromEntries(companions.map((item) => [item.id, item.ring])));
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("companion");
  const [readerOpen, setReaderOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [page, setPage] = useState(186);
  const [note, setNote] = useState("Reminder to self: this passage matters. Come back later. ✨");
  const [highlighted, setHighlighted] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const companion = useMemo(() => companions.find((item) => item.id === companionId) ?? companions[0], [companionId]);
  const theme = themes[themeId];
  const ring = ringColors[companion.id] ?? companion.ring;
  const appStyle = { "--accent": theme.accent, "--accent2": theme.accent2, "--ring": ring } as CSSProperties;

  function openSettings(tab: SettingsTab = "companion") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text && !attachedFile) return;
    const outgoing: Message = { role: "user", text: text || `Open ${attachedFile?.name}`, attachment: attachedFile?.name };
    setMessages((current) => [...current, outgoing]);
    setQuestion("");
    if (attachedFile) {
      const name = attachedFile.name;
      setAttachedFile(null);
      setMessages((current) => [...current, { role: "companion", text: `${name} is ready for this reading session. Open it now, then decide whether it deserves a permanent place in Drive.` }]);
      return;
    }
    setMessages((current) => [...current, { role: "companion", text: companion.greeting }]);
  }

  function attachFile(file: File | null) {
    setAttachedFile(file);
    if (file) setChatOpen(true);
  }

  function useSource(event: FormEvent) {
    event.preventDefault();
    if (!sourceUrl.trim()) return;
    setSourceOpen(false);
    setChatOpen(true);
    setMessages((current) => [...current, { role: "user", text: `Open this source: ${sourceUrl.trim()}` }, { role: "companion", text: "I’ve queued the source for a temporary reading session. We’ll keep the link, not a permanent Cloudflare copy." }]);
    setSourceUrl("");
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await readerRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  }

  return (
    <div className="rv-app" style={appStyle}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("home")}>
          <span className="nancy">Nancy’s</span>
          <span className="readverse">READVERSE</span>
          <span className="tagline">Your stories. Your world.</span>
        </button>
        <label className="side-search"><span>⌕</span><input placeholder="Search your ReadVerse" /></label>
        <nav>
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><i>⌂</i>Home</button>
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><i>▤</i>Library</button>
          <button onClick={() => setReaderOpen(true)}><i>▱</i>Continue Reading</button>
          <button><i>♡</i>Favourites</button>
          <button><i>◫</i>Collections</button>
          <button onClick={() => setSourceOpen(true)}><i>⌁</i>Sources</button>
          <button><i>↺</i>History</button>
          <button className={view === "notes" ? "active" : ""} onClick={() => setView("notes")}><i>✎</i>Notes & Highlights</button>
          <button onClick={() => openSettings()}><i>⚙</i>Settings</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="streak"><small>READING STREAK</small><strong>27 days</strong><p>One more chapter and today stays pink.</p></div>
          <button className="profile" onClick={() => openSettings("profile")}><span className="photo">N</span><span><strong>Nancy</strong><small>Personal ReadVerse</small></span><b>⋯</b></button>
        </div>
      </aside>

      <main className="workspace">
        <header className="mobile-header">
          <button className="mobile-brand" onClick={() => setView("home")}><span className="nancy">Nancy’s</span><span className="readverse">READVERSE</span></button>
          <label className="mobile-search"><span>⌕</span><input placeholder="Search manga, comics, novels" /></label>
          <button className="profile-mini" onClick={() => openSettings("profile")}>N</button>
        </header>

        {view === "home" && <Home greeting={timeGreeting()} companion={companion} ring={ring} onChat={() => setChatOpen(true)} onReader={() => setReaderOpen(true)} onUpload={() => fileRef.current?.click()} onSettings={() => openSettings()} />}
        {view === "library" && <Library onReader={() => setReaderOpen(true)} />}
        {view === "notes" && <Notes note={note} onNote={setNote} />}
      </main>

      <nav className="bottom-nav">
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><i>⌂</i>Home</button>
        <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><i>▤</i>Library</button>
        <button><i>⌕</i>Search</button>
        <button onClick={() => setChatOpen(true)}><i>✦</i>{companion.name}</button>
        <button onClick={() => openSettings()}><i>⚙</i>Settings</button>
      </nav>

      {!chatOpen && !readerOpen && !settingsOpen && (
        <div className="floating-companion">
          <div className="speech">{companion.greeting}</div>
          <button className="float-avatar" style={{ borderColor: ring }} onClick={() => setChatOpen(true)}><img src={avatarImages[companion.id]} alt={companion.name} /><span /></button>
        </div>
      )}

      <ChatPanel open={chatOpen} companion={companion} ring={ring} messages={messages} question={question} file={attachedFile} onClose={() => setChatOpen(false)} onQuestion={setQuestion} onSubmit={submitMessage} onAttach={() => fileRef.current?.click()} onClearFile={() => setAttachedFile(null)} />
      <SettingsModal open={settingsOpen} tab={settingsTab} onTab={setSettingsTab} companions={companions} selected={companion} ring={ring} ringColors={ringColors} themeId={themeId} onClose={() => setSettingsOpen(false)} onCompanion={(id) => { setCompanionId(id); setMessages([]); }} onRing={(color) => setRingColors((current) => ({ ...current, [companion.id]: color }))} onTheme={setThemeId} />
      <ReaderOverlay open={readerOpen} refEl={readerRef} page={page} note={note} notesOpen={notesOpen} highlighted={highlighted} onClose={() => setReaderOpen(false)} onTurn={(direction) => setPage((current) => Math.max(1, current + direction * 2))} onFullscreen={toggleFullscreen} onNotes={() => setNotesOpen(true)} onCloseNotes={() => setNotesOpen(false)} onNote={setNote} onHighlight={() => setHighlighted((current) => !current)} />
      <SourceDialog open={sourceOpen} value={sourceUrl} onValue={setSourceUrl} onSubmit={useSource} onClose={() => setSourceOpen(false)} />

      <input ref={fileRef} hidden type="file" accept="application/pdf,.pdf,.epub,.cbz,.txt" onChange={(event) => attachFile(event.target.files?.[0] ?? null)} />
      <div className="lock-badge">APPROVED UI · VISUAL STRUCTURE LOCKED</div>
    </div>
  );
}

function Home({ greeting, companion, ring, onChat, onReader, onUpload, onSettings }: { greeting: string; companion: Companion; ring: string; onChat: () => void; onReader: () => void; onUpload: () => void; onSettings: () => void }) {
  return (
    <>
      <article className="hero">
        <div className="hero-copy">
          <div className="eyebrow">YOUR SHELF IS READY</div>
          <h1>{greeting},<br /><span>Nancy!</span> ✦</h1>
          <p>Your stories stay temporary unless you choose to save them. Find comics, manga, novels and books, then read them your way.</p>
          <div className="hero-actions"><button className="btn primary" onClick={onReader}>Continue Reading</button><button className="btn" onClick={onChat}>Find something with {companion.name}</button></div>
          <div className="genre-pills"><span>Manga</span><span>Comics</span><span>Novels</span><span>Books</span><span>PDF</span></div>
        </div>
        <div className="hero-character">
          <div className="hero-orbit" style={{ borderColor: ring }} />
          <img src={avatarImages[companion.id]} alt={companion.name} />
          <div className="hero-signature">{companion.name}</div>
        </div>
        <aside className="companion-card">
          <div className="eyebrow">MY COMPANION</div>
          <div className="mini"><img className="avatar" style={{ borderColor: ring }} src={avatarImages[companion.id]} alt={companion.name} /><span><strong>{companion.name}</strong><small>{companion.vibe}</small></span></div>
          <button className="btn primary" onClick={onChat}>Chat now</button>
          <button className="btn" onClick={onUpload}>Upload a file</button>
          <button className="btn" onClick={onSettings}>Customise</button>
        </aside>
      </article>

      <section className="section"><SectionTitle eyebrow="BACK TO YOUR STORIES" title="Continue Reading" /><BookRow onReader={onReader} /></section>
      <section className="dashboard-grid">
        <article className="feature"><small>✦ {companion.name}’S PICK</small><h3>Velvet Eclipse</h3><p>A deal. A lie. A vow that binds. What could possibly go wrong?</p><button className="btn primary" onClick={onReader}>Read now</button></article>
        <article className="feature"><small>♡ FAVOURITES</small><h3>Your forever shelf</h3><p>Everything you loved enough to admit publicly.</p><button className="btn">Open shelf</button></article>
        <article className="feature"><small>☁ SYNC & OFFLINE</small><h3>Google Drive ready</h3><p>Your personal saves, settings, notes and progress belong to your account.</p><button className="btn">Storage settings</button></article>
      </section>
      <section className="section"><SectionTitle eyebrow="MATCH YOUR ENERGY" title="Mood Vibes" /><div className="mood-row"><button>♡ Sweet & Heartwarming</button><button>◐ Dark & Mysterious</button><button>⚔ Fierce & Epic</button><button>☁ Soft & Healing</button><button>✦ Fun & Chaotic</button></div></section>
    </>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <header className="section-title"><div><small>{eyebrow}</small><h2>{title}</h2></div><button className="link-btn">View all →</button></header>;
}

function BookRow({ onReader }: { onReader: () => void }) {
  return <div className="book-row">{books.map((book) => <button className="book-card" key={book.title} onClick={onReader}><div className="cover" style={{ "--cover": book.art } as CSSProperties}><b>{book.title.slice(0, 1)}</b><span>{book.progress}%</span></div><strong>{book.title}</strong><small>{book.meta}</small><div className="progress"><i style={{ width: `${book.progress}%` }} /></div></button>)}</div>;
}

function Library({ onReader }: { onReader: () => void }) {
  return <section className="page-section"><SectionTitle eyebrow="YOUR COLLECTION" title="Library" /><div className="library-banner"><div><small>PERSONAL READVERSE</small><h2>Everything she chose to keep.</h2><p>Saved files, favourites and reading progress will live in her Google account—not as permanent Cloudflare copies.</p></div><button className="btn primary">Connect Google</button></div><BookRow onReader={onReader} /></section>;
}

function Notes({ note, onNote }: { note: string; onNote: (value: string) => void }) {
  return <section className="page-section"><SectionTitle eyebrow="YOUR THOUGHTS" title="Notes & Highlights" /><div className="notes-grid"><article className="note-card"><textarea value={note} onChange={(event) => onNote(event.target.value)} /><small>Temporary until Google sync is connected</small></article><blockquote>Strength is not just what you have. It is what you choose to protect when no one is watching.<small>Chapter 15 · page 186</small></blockquote></div></section>;
}

function ChatPanel({ open, companion, ring, messages, question, file, onClose, onQuestion, onSubmit, onAttach, onClearFile }: { open: boolean; companion: Companion; ring: string; messages: Message[]; question: string; file: File | null; onClose: () => void; onQuestion: (value: string) => void; onSubmit: (event: FormEvent) => void; onAttach: () => void; onClearFile: () => void }) {
  return <aside className={`chat-panel ${open ? "open" : ""}`} aria-hidden={!open}>
    <header className="chat-head"><img style={{ borderColor: ring }} src={avatarImages[companion.id]} alt={companion.name} /><div><strong>{companion.name}</strong><small>{companion.vibe}</small></div><button className="icon-btn" onClick={onClose}>×</button></header>
    <div className="chat-body"><div className="message companion"><img src={avatarImages[companion.id]} alt="" /><p>{companion.greeting}</p></div>{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`message ${message.role}`}>{message.role === "companion" && <img src={avatarImages[companion.id]} alt="" />}<div><p>{message.text}</p>{message.attachment && <small>📎 {message.attachment}</small>}</div></div>)}</div>
    <div className="quick-actions"><button onClick={() => onQuestion("Find me something sweet and heartwarming")}>♡ Sweet</button><button onClick={() => onQuestion("Find me something dark and mysterious")}>◐ Dark</button><button onClick={() => onQuestion("Surprise me, but protect my sleep")}>✦ Surprise me</button></div>
    {file && <div className="file-pill show"><span>PDF</span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · temporary session</small></div><button onClick={onClearFile}>×</button></div>}
    <form className="chat-form" onSubmit={onSubmit}><button type="button" onClick={onAttach}>＋</button><input value={question} onChange={(event) => onQuestion(event.target.value)} placeholder={`Ask ${companion.name} anything…`} /><button className="send" type="submit">➤</button></form>
  </aside>;
}

function SettingsModal({ open, tab, onTab, companions, selected, ring, ringColors, themeId, onClose, onCompanion, onRing, onTheme }: { open: boolean; tab: SettingsTab; onTab: (tab: SettingsTab) => void; companions: Companion[]; selected: Companion; ring: string; ringColors: Record<string, string>; themeId: ThemeId; onClose: () => void; onCompanion: (id: AvatarId) => void; onRing: (value: string) => void; onTheme: (id: ThemeId) => void }) {
  return <div className={`modal ${open ? "open" : ""}`}>
    <section className="settings">
      <header className="settings-head"><div><small>MAKE IT YOURS</small><h2>ReadVerse Settings</h2></div><button className="icon-btn" onClick={onClose}>×</button></header>
      <div className="settings-body">
        <nav className="settings-tabs">
          {([['profile','♙','Profile'],['companion','✦','Companion'],['appearance','◉','Appearance'],['reader','▥','Reader'],['storage','☁','Storage & Sync']] as [SettingsTab,string,string][]).map(([id, icon, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => onTab(id)}><i>{icon}</i>{label}</button>)}
        </nav>
        <div className="settings-content">
          {tab === "companion" && <CompanionSettings companions={companions} selected={selected} ring={ring} ringColors={ringColors} onCompanion={onCompanion} onRing={onRing} />}
          {tab === "appearance" && <AppearanceSettings themeId={themeId} onTheme={onTheme} />}
          {tab === "profile" && <SimpleSettings eyebrow="PERSONALISE THE EXPERIENCE" title="Nancy’s profile" text="Profile picture, display name, birthday and account preferences will sync to her Google account." />}
          {tab === "reader" && <SimpleSettings eyebrow="READ YOUR WAY" title="Reader preferences" text="Page flip, swipe sensitivity, fullscreen, font size, brightness, highlights and notepad behaviour." />}
          {tab === "storage" && <SimpleSettings eyebrow="YOUR DATA, YOUR ACCOUNT" title="Storage & Sync" text="Temporary source files stay in-session. Permanent saves, notes, settings and progress belong in Google Drive." />}
        </div>
      </div>
    </section>
  </div>;
}

function CompanionSettings({ companions, selected, ring, ringColors, onCompanion, onRing }: { companions: Companion[]; selected: Companion; ring: string; ringColors: Record<string, string>; onCompanion: (id: AvatarId) => void; onRing: (value: string) => void }) {
  return <section className="settings-panel active">
    <div className="selected-row"><img className="selected-portrait" style={{ borderColor: ring }} src={avatarImages[selected.id]} alt={selected.name} /><article className="selected-copy"><small>SELECTED COMPANION</small><h3>{selected.name}</h3><p>{selected.vibe}. Keeps the humour in character without taking away ReadVerse’s sweet, dependable personality.</p></article><aside className="ring-panel"><strong>Ring colour for {selected.name}</strong><div className="color-row">{ringPalette.map((color) => <button key={color} className={`color-dot ${ring === color ? "active" : ""}`} style={{ background: color }} onClick={() => onRing(color)} />)}</div><p>Each companion remembers a separate ring colour. The site theme stays independent.</p></aside></div>
    <div className="settings-subhead"><small>CHOOSE YOUR COMPANION</small><h3>Six male · six female · twelve different vibes</h3></div>
    <div className="companion-grid">{companions.map((item) => <button className={`companion-option ${selected.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => onCompanion(item.id)}><img style={{ borderColor: ringColors[item.id] ?? item.ring }} src={avatarImages[item.id]} alt={item.name} /><strong>{item.name}</strong><small>{item.shortVibe}</small></button>)}</div>
  </section>;
}

function AppearanceSettings({ themeId, onTheme }: { themeId: ThemeId; onTheme: (id: ThemeId) => void }) {
  return <section className="settings-panel active"><div className="settings-subhead"><small>COLOUR THE READVERSE</small><h3>Theme colours</h3></div><div className="theme-grid">{(Object.entries(themes) as [ThemeId, (typeof themes)[ThemeId]][]).map(([id, theme]) => <button className={`theme-tile ${themeId === id ? "active" : ""}`} key={id} onClick={() => onTheme(id)}><i className="theme-swatch" style={{ "--c1": theme.accent, "--c2": theme.accent2 } as CSSProperties} /><span><strong>{theme.label}</strong><small>Independent from companion ring</small></span></button>)}</div></section>;
}

function SimpleSettings({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <section className="settings-panel active"><div className="simple-settings"><small>{eyebrow}</small><h3>{title}</h3><p>{text}</p><div className="placeholder-lines"><i /><i /><i /></div></div></section>;
}

function ReaderOverlay({ open, refEl, page, note, notesOpen, highlighted, onClose, onTurn, onFullscreen, onNotes, onCloseNotes, onNote, onHighlight }: { open: boolean; refEl: React.RefObject<HTMLDivElement | null>; page: number; note: string; notesOpen: boolean; highlighted: boolean; onClose: () => void; onTurn: (direction: 1 | -1) => void; onFullscreen: () => void; onNotes: () => void; onCloseNotes: () => void; onNote: (value: string) => void; onHighlight: () => void }) {
  return <section className={`reader-overlay ${open ? "open" : ""}`} ref={refEl}>
    <header className="reader-toolbar"><button onClick={onClose}>×</button><div className="title"><strong>Thorny Crown</strong><small>Chapter 15 · Faint Light in the Rain</small></div><nav><button onClick={onNotes}>✎ Notes</button><button onClick={onFullscreen}>⛶ Fullscreen</button></nav></header>
    <div className="reader-window"><div className="book-spread"><button className="page-edge prev" onClick={() => onTurn(-1)} /><article className="page left"><small>CHAPTER 15</small><h2>Faint Light in the Rain</h2><p>The rain had not stopped since the evening before. It drummed against the windows of the old dormitory, like fingers tapping out a restless song.</p><p className={highlighted ? "highlight" : ""} onClick={onHighlight}>Strength is not just what you have. It is what you choose to protect when no one is watching.</p><p>Yuji thought about that as he walked the empty hallways, the words echoing louder than the rain.</p><b>{page}</b></article><article className="page right"><p>Outside, somewhere beyond the glass, the city glowed faintly—uncaring, relentless.</p><p>But inside, even in the darkest moments, a choice could still be made.</p><hr /><p className="center">End of Chapter 15</p><b>{page + 1}</b></article><button className="page-edge next" onClick={() => onTurn(1)} /></div></div>
    <footer className="reader-footer"><button onClick={() => onTurn(-1)}>←</button><span>{page} / 240</span><button onClick={() => onTurn(1)}>→</button></footer>
    <aside className={`notepad ${notesOpen ? "open" : ""}`}><header><strong>My Note</strong><button onClick={onCloseNotes}>×</button></header><textarea value={note} onChange={(event) => onNote(event.target.value)} /><small>Linked to page {page}</small></aside>
  </section>;
}

function SourceDialog({ open, value, onValue, onSubmit, onClose }: { open: boolean; value: string; onValue: (value: string) => void; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return <div className={`source-dialog ${open ? "open" : ""}`}><form className="source-card" onSubmit={onSubmit}><div className="eyebrow">ADD A SOURCE</div><h2>Paste a reading link</h2><p>ReadVerse will use the link for a temporary session and remember only the source unless the user chooses to save the file.</p><input value={value} onChange={(event) => onValue(event.target.value)} placeholder="https://example.com/book-or-reader" /><div className="actions"><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="submit">Use source</button></div></form></div>;
}
