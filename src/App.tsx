import { FormEvent, useEffect, useMemo, useState } from "react";

type ChatMessage = {
  role: "gogo" | "nancy";
  text: string;
};

type AuthMode =
  | "checking"
  | "direct"
  | "signed-out"
  | "signed-in"
  | "misconfigured"
  | "unavailable";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string;
};

type GoogleAuthStatus = {
  ok: boolean;
  enabled: boolean;
  configured: boolean;
};

type AuthSessionResponse = {
  ok: boolean;
  authenticated: boolean;
  authEnabled: boolean;
  user?: AuthUser;
};

const starterMessages: ChatMessage[] = [
  {
    role: "gogo",
    text: "There you are. I kept your shelf quiet and your page safe.",
  },
];

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);

  useEffect(() => {
    let active = true;

    async function loadAuth() {
      try {
        const statusResponse = await fetch("/api/auth/google/status", {
          headers: { accept: "application/json" },
        });

        if (!statusResponse.ok) {
          if (active) setAuthMode("unavailable");
          return;
        }

        const status = (await statusResponse.json()) as GoogleAuthStatus;
        if (!status.enabled) {
          if (active) setAuthMode("direct");
          return;
        }

        if (!status.configured) {
          if (active) setAuthMode("misconfigured");
          return;
        }

        const sessionResponse = await fetch("/api/auth/session", {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const session = (await sessionResponse.json()) as AuthSessionResponse;

        if (!active) return;
        if (sessionResponse.ok && session.authenticated && session.user) {
          setAuthUser(session.user);
          setAuthMode("signed-in");
        } else {
          setAuthMode("signed-out");
        }
      } catch {
        if (active) setAuthMode("unavailable");
      }
    }

    void loadAuth();
    return () => {
      active = false;
    };
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning, Nancy";
    if (hour < 18) return "Good afternoon, Nancy";
    return "Good evening, Nancy";
  }, []);

  const authError = useMemo(() => {
    const code = new URLSearchParams(window.location.search).get("auth_error");
    if (!code) return "";
    if (code === "account_not_allowed") return "That Google account is not approved for this ReadVerse.";
    if (code === "access_denied") return "Google sign-in was cancelled.";
    return "Google sign-in did not finish. Please try again.";
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

  async function signOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.reload();
    }
  }

  if (authMode === "checking") {
    return (
      <main className="gate-screen">
        <div className="gate-orbit" />
        <section className="gate-card" aria-live="polite">
          <span className="eyebrow">Nancy's private universe</span>
          <h1>Opening ReadVerse</h1>
          <p>Checking this device and preparing your shelves.</p>
          <div className="loading-line"><span /></div>
        </section>
      </main>
    );
  }

  if (authMode === "signed-out") {
    return (
      <main className="gate-screen">
        <div className="gate-orbit" />
        <section className="gate-card locked-card">
          <span className="eyebrow">Nancy's private universe</span>
          <h1>Enter ReadVerse</h1>
          <p>Continue with an approved Google account to open your shelves and sync your reading profile.</p>
          <a className="primary-action google-auth-button" href="/api/auth/google/start?returnTo=/">
            Continue with Google
          </a>
          {authError && <small className="auth-error">{authError}</small>}
        </section>
      </main>
    );
  }

  if (authMode === "misconfigured" || authMode === "unavailable") {
    return (
      <main className="gate-screen">
        <div className="gate-orbit" />
        <section className="gate-card locked-card">
          <span className="eyebrow">Protected shelf</span>
          <h1>Sign-in is not ready</h1>
          <p>
            {authMode === "misconfigured"
              ? "The Google connection is switched on, but its Cloudflare settings are incomplete."
              : "ReadVerse could not verify the sign-in service."}
          </p>
          <small>Direct access stays blocked while Google sign-in is enabled.</small>
        </section>
      </main>
    );
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
        <div className="topbar-actions">
          <button className="profile-button" type="button" onClick={() => setChatOpen(true)}>
            Ask Gogo
          </button>
          {authUser && (
            <button className="profile-button quiet-button" type="button" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
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
