import { FormEvent, useMemo, useState } from "react";

type ChatMessage = {
  role: "gogo" | "nancy";
  text: string;
};

const starterMessages: ChatMessage[] = [
  {
    role: "gogo",
    text: "There you are. I kept your shelf quiet and your page safe.",
  },
];

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning, Nancy";
    if (hour < 18) return "Good afternoon, Nancy";
    return "Good evening, Nancy";
  }, []);

  async function askGogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || sending) return;

    setMessages((current) => [...current, { role: "nancy", text: cleanQuestion }]);
    setQuestion("");
    setSending(true);

    try {
      const response = await fetch("/api/gogo/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion }),
      });

      const body = (await response.json()) as { answer?: string; error?: string };
      const reply = body.answer ?? body.error ?? "I lost that thought. Try me once more.";
      setMessages((current) => [...current, { role: "gogo", text: reply }]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "gogo",
          text: "The connection slipped away, but your library is still safe. Try me again in a moment.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Nancy's ReadVerse home">
          <span>Nancy's</span>
          <strong>ReadVerse</strong>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#library">Library</a>
          <a href="#discover">Discover</a>
          <a href="#sources">Sources</a>
        </nav>
        <button className="profile-button" type="button" onClick={() => setChatOpen(true)}>
          Ask Gogo
        </button>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">Comics · Manga · Novels · Books</span>
            <h1>{greeting}.</h1>
            <p>
              Your stories stay temporary unless you choose to add them, favourite them,
              save the file, or keep them offline.
            </p>
            <div className="hero-actions">
              <button className="primary-action" type="button">Continue reading</button>
              <button className="secondary-action" type="button" onClick={() => setChatOpen(true)}>
                Find something with Gogo
              </button>
            </div>
          </div>

          <div className="hero-art" aria-label="Gogo artwork placeholder">
            <div className="gogo-placeholder large">
              <span>G</span>
              <small>Approved Gogo artwork goes here</small>
            </div>
            <div className="hero-quote">
              <span>Gogo's note</span>
              <p>“I’m ready when you are, pretty reader.”</p>
            </div>
          </div>
        </section>

        <section className="quick-grid" aria-label="Reading overview">
          <article className="glass-card continue-card">
            <span className="card-label">Continue reading</span>
            <h2>Your current story will appear here</h2>
            <p>Page and chapter progress will sync after the library phase is connected.</p>
            <button type="button">Open reader</button>
          </article>

          <article className="glass-card metric-card">
            <span className="card-label">Library</span>
            <strong>0</strong>
            <p>Titles added</p>
          </article>

          <article className="glass-card metric-card">
            <span className="card-label">Favourites</span>
            <strong>0</strong>
            <p>Stories loved</p>
          </article>
        </section>

        <section className="section-block" id="discover">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Search formation</span>
              <h2>Discover across all your sources</h2>
            </div>
            <button type="button" onClick={() => setChatOpen(true)}>Ask Gogo to search</button>
          </div>
          <div className="empty-panel">
            <div className="search-rings" aria-hidden="true"><i /><i /><i /></div>
            <div>
              <h3>SRG-style parallel search is coming next</h3>
              <p>Ten fetch lanes, two verification lanes, progressive verified results.</p>
            </div>
          </div>
        </section>

        <section className="two-column" id="library">
          <article className="section-panel">
            <span className="eyebrow">Your shelves</span>
            <h2>Library</h2>
            <p>Add to Library will keep metadata and progress. Save File will be a separate choice.</p>
          </article>
          <article className="section-panel" id="sources">
            <span className="eyebrow">Teach Gogo</span>
            <h2>Sources</h2>
            <p>Paste a source into Gogo and choose what it may search, open, or save.</p>
          </article>
        </section>
      </main>

      <button
        className={`mini-gogo ${chatOpen ? "is-open" : ""}`}
        type="button"
        onClick={() => setChatOpen((current) => !current)}
        aria-label="Open Gogo assistant"
      >
        <span>G</span>
        <i />
      </button>

      <aside className={`gogo-panel ${chatOpen ? "is-open" : ""}`} aria-hidden={!chatOpen}>
        <header>
          <div className="gogo-avatar"><span>G</span></div>
          <div>
            <strong>Gogo</strong>
            <small>Sweet reading companion</small>
          </div>
          <button type="button" onClick={() => setChatOpen(false)} aria-label="Close Gogo">×</button>
        </header>

        <div className="chat-stream">
          {messages.map((message, index) => (
            <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
              {message.text}
            </div>
          ))}
          {sending && <div className="chat-bubble gogo typing">Gogo is thinking…</div>}
        </div>

        <form onSubmit={askGogo}>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask how to use ReadVerse…"
            maxLength={1000}
          />
          <button type="submit" disabled={sending || !question.trim()}>Send</button>
        </form>
      </aside>
    </div>
  );
}
