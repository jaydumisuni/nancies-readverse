import { readFile, writeFile } from "node:fs/promises";

const path = "src/notverse/NoTVerseViews.tsx";
const source = await readFile(path, "utf8");

if (source.includes("type InboxMessageRecord =")) {
  console.log("Inbox functionality is already applied.");
  process.exit(0);
}

const start = source.indexOf("function InboxView(");
const end = source.indexOf("function ProfileNotebook(");
if (start < 0 || end < 0 || end <= start) {
  throw new Error("Could not locate the canonical InboxView block");
}

const replacement = `type InboxMessageRecord = {
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
      id: \`message-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`,
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

`;

const updated = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
await writeFile(path, updated);
console.log("Applied functional persistent NoTVerse Inbox.");
