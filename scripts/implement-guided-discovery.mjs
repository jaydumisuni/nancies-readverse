import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
}

function replaceRegex(source, pattern, after, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`${label}: pattern not found`);
  return source.replace(pattern, after);
}

const appPath = "src/App.tsx";
let app = await readFile(appPath, "utf8");

app = replaceOnce(app,
`type Book = {
  id: string;
  title: string;
  subtitle: string;
  progress: number;
  genre: string;
  cover: string;
  badge?: string;
};`,
`type Book = {
  id: string;
  title: string;
  subtitle: string;
  progress: number;
  genre: string;
  cover: string;
  badge?: string;
  sourceUrl?: string;
  format?: string;
  author?: string;
  language?: string;
  savedAt?: string;
};`, "Book metadata");

app = replaceOnce(app,
`type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  upload?: UploadItem;
  time: string;
};`,
`type DiscoveryCandidate = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  cover?: string;
  description?: string;
  whyMatch: string;
  provider: string;
  language?: string;
  downloadUrl?: string;
  identifiers?: Record<string, string>;
};

type SourceCandidate = {
  id: string;
  sourceUrl: string;
  directUrl?: string;
  title: string;
  format: string;
  streamUrl: string;
  temporary: true;
  domain: string;
  sizeBytes?: number;
  sizeLabel?: string;
  contentType?: string;
  author?: string;
  language?: string;
  cover?: string;
  provider?: string;
  verifiedAt?: string;
};

type SourceStage = {
  id: "source" | "file" | "metadata" | "reader";
  label: string;
  status: "waiting" | "active" | "done" | "failed";
};

type SourceCard = {
  source: SourceCandidate;
  status: "found" | "preparing" | "ready" | "failed";
  stages?: SourceStage[];
  error?: string;
};

type DiscoveryCard = {
  query: string;
  candidates: DiscoveryCandidate[];
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  upload?: UploadItem;
  sourceCard?: SourceCard;
  discovery?: DiscoveryCard;
  time: string;
};`, "chat card types");

app = replaceOnce(app,
`type ReaderSource = {
  id: string;
  title: string;
  url: string;
  format: string;
  sourceUrl?: string;
};`,
`type ReaderSource = {
  id: string;
  title: string;
  url: string;
  format: string;
  sourceUrl?: string;
  domain?: string;
  author?: string;
  language?: string;
  cover?: string;
  sizeLabel?: string;
};`, "reader metadata");

app = replaceOnce(app,
`type ResolveSourceResponse = {
  ok: boolean;
  source?: {
    sourceUrl: string;
    title: string;
    format: string;
    streamUrl: string;
    temporary: true;
  };
  error?: string;
};`,
`type ResolveSourceResponse = {
  ok: boolean;
  source?: SourceCandidate;
  sources?: SourceCandidate[];
  error?: string;
  reason?: string;
  next?: string[];
};

type DiscoveryResponse = {
  ok: boolean;
  query?: string;
  candidates?: DiscoveryCandidate[];
  error?: string;
  reason?: string;
  next?: string[];
};`, "API response types");

app = replaceOnce(app,
`  const [sourceError, setSourceError] = useState("");
  const fileInputRef`,
`  const [sourceError, setSourceError] = useState("");
  const [pendingSource, setPendingSource] = useState<SourceCandidate | null>(null);
  const [rejectedCandidates, setRejectedCandidates] = useStoredState<string[]>("readverse.rejected-discovery", []);
  const fileInputRef`, "discovery state");

const newAskCompanion = `  async function askCompanion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || sending) return;

    const userMessage: ChatMessage = {
      id: uid("user"),
      role: "user",
      text: cleanQuestion,
      time: timeNow(),
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setSending(true);

    const lower = cleanQuestion.toLowerCase();
    const directUrl = extractFirstHttpUrl(cleanQuestion);

    if (pendingSource && isPrepareFollowUp(cleanQuestion)) {
      await prepareSource(pendingSource);
      setSending(false);
      return;
    }

    if (directUrl) {
      setSearching(true);
      setMessages((current) => [
        ...current,
        {
          id: uid("source-checking"),
          role: "companion",
          text: characterise(companion, "Lemme get that for you. I am checking the source, following the public route and verifying the actual reading file."),
          time: timeNow(),
        },
      ]);
      try {
        const source = await resolveSourceCandidate(directUrl);
        setPendingSource(source);
        setSourceDialogOpen(false);
        setSourceUrl("");
        setMessages((current) => [
          ...current,
          {
            id: uid("source-found"),
            role: "companion",
            text: characterise(companion, `I found it. This looks like “${source.title}”. Check the details, then tell me whether I should prepare it for reading.`),
            sourceCard: { source, status: "found" },
            time: timeNow(),
          },
        ]);
      } catch (error) {
        explainSourceFailure(error);
      } finally {
        setSearching(false);
        setSending(false);
      }
      return;
    }

    if (looksLikeDiscoveryRequest(cleanQuestion)) {
      await discoverFromMemory(cleanQuestion);
      setSending(false);
      return;
    }

    if (lower.includes("open reader") || lower.includes("continue reading")) {
      setReaderOpen(true);
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: characterise(companion, "Reader opened. Your page was exactly where you left it."),
          time: timeNow(),
        },
      ]);
      setSending(false);
      return;
    }
    if (lower.includes("setting") || lower.includes("change theme")) {
      setSettingsOpen(true);
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: characterise(companion, "Settings are open. Try not to spend twenty minutes choosing between two nearly identical shades. I will notice."),
          time: timeNow(),
        },
      ]);
      setSending(false);
      return;
    }

    try {
      const response = await fetch("/api/companion/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: cleanQuestion,
          companion: companion.name,
          vibe: `${companion.traits.join(", ")}. ${companion.delivery}`,
          history: messages.slice(-12).map((message) => ({
            role: message.role === "companion" ? "assistant" : "user",
            text: message.text,
          })),
        }),
      });
      const body = (await response.json()) as { answer?: string; error?: string };
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: body.answer ?? body.error ?? characterise(companion, "That thought escaped. Ask me once more."),
          time: timeNow(),
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: localFallback(cleanQuestion, companion, messages),
          time: timeNow(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function resolveSourceCandidate(url: string): Promise<SourceCandidate> {
    const response = await fetch("/api/source/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const body = (await response.json()) as ResolveSourceResponse;
    if (!response.ok || !body.ok || !body.source) {
      throw new Error(body.reason || body.error || "ReadVerse could not resolve that source.");
    }
    return body.source;
  }

  async function discoverFromMemory(query: string, exclude = rejectedCandidates) {
    setSearching(true);
    setMessages((current) => [
      ...current,
      {
        id: uid("discovery-start"),
        role: "companion",
        text: characterise(companion, "Give me a moment. I am matching the title, story clues, cover details and likely editions instead of guessing from one word."),
        time: timeNow(),
      },
    ]);
    try {
      const response = await fetch("/api/discovery/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, exclude }),
      });
      const body = (await response.json()) as DiscoveryResponse;
      if (!response.ok || !body.ok || !body.candidates?.length) {
        const detail = body.reason || body.error || "I could not find a strong match yet.";
        const next = body.next?.[0] || "Tell me one more detail: a character, cover colour, author, year, or part of the title.";
        setMessages((current) => [
          ...current,
          {
            id: uid("discovery-empty"),
            role: "companion",
            text: characterise(companion, `${detail} ${next}`),
            time: timeNow(),
          },
        ]);
        return;
      }
      setMessages((current) => [
        ...current,
        {
          id: uid("discovery-results"),
          role: "companion",
          text: characterise(companion, `I found ${body.candidates!.length} likely matches. The first is strongest, but I kept alternatives because “close enough” is how the wrong book wins.`),
          discovery: { query: body.query || query, candidates: body.candidates! },
          time: timeNow(),
        },
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Discovery search failed.";
      setMessages((current) => [
        ...current,
        {
          id: uid("discovery-failed"),
          role: "companion",
          text: characterise(companion, `I could not finish the search because ${reason} Give me another clue or attach the file directly; I will not leave you waiting without a next move.`),
          time: timeNow(),
        },
      ]);
    } finally {
      setSearching(false);
    }
  }

  async function selectDiscoveryCandidate(candidate: DiscoveryCandidate) {
    setSearching(true);
    setMessages((current) => [
      ...current,
      { id: uid("candidate-choice"), role: "user", text: `That is it — ${candidate.title}.`, time: timeNow() },
      { id: uid("source-hunt"), role: "companion", text: characterise(companion, "Good. I have the title now. I am checking public reading sources and verifying the actual file before I offer it."), time: timeNow() },
    ]);
    try {
      const response = await fetch("/api/discovery/source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate }),
      });
      const body = (await response.json()) as ResolveSourceResponse;
      if (!response.ok || !body.ok || !body.sources?.length) {
        const reason = body.reason || body.error || "I identified the book, but no accessible reading file passed verification.";
        const next = body.next?.join(" ") || "You can give me another source, upload your copy, or ask me to search another edition.";
        setMessages((current) => [
          ...current,
          { id: uid("source-none"), role: "companion", text: characterise(companion, `${reason} ${next}`), time: timeNow() },
        ]);
        return;
      }
      const source = body.sources[0];
      setPendingSource(source);
      setMessages((current) => [
        ...current,
        {
          id: uid("source-found"),
          role: "companion",
          text: characterise(companion, `I found a verified ${source.format.toUpperCase()} for “${source.title}”. Check the source details, then choose whether I should prepare it.`),
          sourceCard: { source, status: "found" },
          time: timeNow(),
        },
      ]);
    } catch (error) {
      explainSourceFailure(error, candidate.title);
    } finally {
      setSearching(false);
    }
  }

  function rejectDiscoveryCandidate(candidate: DiscoveryCandidate) {
    const nextRejected = rejectedCandidates.includes(candidate.id) ? rejectedCandidates : [...rejectedCandidates, candidate.id];
    setRejectedCandidates(nextRejected);
    setMessages((current) => [
      ...current,
      { id: uid("candidate-reject"), role: "user", text: `Not ${candidate.title}.`, time: timeNow() },
      {
        id: uid("candidate-clue"),
        role: "companion",
        text: characterise(companion, "Got it. I will not show that one again. Give me one detail that separates it: a character, cover colour, author, setting, year, or a word from the title."),
        time: timeNow(),
      },
    ]);
  }

  async function showMoreDiscovery(query: string) {
    await discoverFromMemory(query, rejectedCandidates);
  }

  function rejectSource(source: SourceCandidate) {
    setPendingSource(null);
    setMessages((current) => [
      ...current,
      { id: uid("source-reject"), role: "user", text: `That is not the right copy of ${source.title}.`, time: timeNow() },
      {
        id: uid("source-correction"),
        role: "companion",
        text: characterise(companion, "Good catch. Tell me what looked wrong—the title page, cover, language, edition, author, or content—and I will narrow the next search instead of repeating this result."),
        time: timeNow(),
      },
    ]);
  }

  function updateSourceCard(sourceId: string, updater: (card: SourceCard) => SourceCard) {
    setMessages((current) => current.map((message) => message.sourceCard?.source.id === sourceId
      ? { ...message, sourceCard: updater(message.sourceCard) }
      : message));
  }

  async function prepareSource(source: SourceCandidate) {
    if (sending || source.id !== pendingSource?.id) return;
    const stages: SourceStage[] = [
      { id: "source", label: "Verified public source", status: "done" },
      { id: "file", label: "Checking the readable file", status: "active" },
      { id: "metadata", label: "Reading document details", status: "waiting" },
      { id: "reader", label: "Preparing the temporary reader", status: "waiting" },
    ];
    updateSourceCard(source.id, (card) => ({ ...card, status: "preparing", stages }));
    setSearching(true);
    try {
      const response = await fetch(source.streamUrl, { method: "HEAD", cache: "no-store" });
      if (!response.ok) throw new Error(`the verified file returned HTTP ${response.status} while preparing`);
      updateSourceCard(source.id, (card) => ({
        ...card,
        stages: card.stages?.map((stage) => stage.id === "file" ? { ...stage, status: "done" } : stage.id === "metadata" ? { ...stage, status: "active" } : stage),
      }));
      const sizeBytes = Number(response.headers.get("content-length") || source.sizeBytes || 0);
      const prepared = { ...source, sizeBytes: sizeBytes || source.sizeBytes, sizeLabel: sizeBytes ? formatFileSize(sizeBytes) : source.sizeLabel };
      setPendingSource(prepared);
      updateSourceCard(source.id, (card) => ({
        ...card,
        source: prepared,
        stages: card.stages?.map((stage) => stage.id === "metadata" ? { ...stage, status: "done" } : stage.id === "reader" ? { ...stage, status: "active" } : stage),
      }));
      setReaderSource({
        id: prepared.id,
        title: prepared.title,
        url: prepared.streamUrl,
        format: prepared.format,
        sourceUrl: prepared.sourceUrl,
        domain: prepared.domain,
        author: prepared.author,
        language: prepared.language,
        cover: prepared.cover,
        sizeLabel: prepared.sizeLabel,
      });
      updateSourceCard(source.id, (card) => ({
        ...card,
        status: "ready",
        source: prepared,
        stages: card.stages?.map((stage) => ({ ...stage, status: "done" })),
      }));
      setMessages((current) => [
        ...current,
        {
          id: uid("source-ready"),
          role: "companion",
          text: characterise(companion, "Done. Open it and check the cover, title page and first few pages. If it is right, use Add to Library inside the reader so I keep the source and your reading record."),
          time: timeNow(),
        },
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "the file could not be prepared";
      updateSourceCard(source.id, (card) => ({
        ...card,
        status: "failed",
        error: reason,
        stages: card.stages?.map((stage) => stage.status === "active" ? { ...stage, status: "failed" } : stage),
      }));
      setMessages((current) => [
        ...current,
        { id: uid("prepare-failed"), role: "companion", text: characterise(companion, `I found the source, but preparation stopped because ${reason}. Nothing was saved. Try another source, another edition, or upload the file directly.`), time: timeNow() },
      ]);
    } finally {
      setSearching(false);
    }
  }

  function openPreparedSource(source: SourceCandidate) {
    setReaderSource({
      id: source.id,
      title: source.title,
      url: source.streamUrl,
      format: source.format,
      sourceUrl: source.sourceUrl,
      domain: source.domain,
      author: source.author,
      language: source.language,
      cover: source.cover,
      sizeLabel: source.sizeLabel,
    });
    setReaderOpen(true);
  }

  function explainSourceFailure(error: unknown, title?: string) {
    const reason = error instanceof Error ? error.message : "ReadVerse could not verify an accessible reading file.";
    setMessages((current) => [
      ...current,
      {
        id: uid("source-blocked"),
        role: "companion",
        text: characterise(companion, `${title ? `I identified “${title}”, but ` : ""}I could not prepare a reading source because ${reason} Nothing was opened or saved. Send another link, upload your copy, or give me another edition clue and I will keep looking.`),
        time: timeNow(),
      },
    ]);
  }

  function chooseMood`;

app = replaceRegex(app, /  async function askCompanion[\s\S]*?\n  function chooseMood/, newAskCompanion, "guided askCompanion");

app = replaceRegex(app, /  async function resolveSource\(event: FormEvent<HTMLFormElement>\)[\s\S]*?\n  function addUploadedToLibrary/, `  async function resolveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUrl = sourceUrl.trim();
    if (!cleanUrl || sourceResolving) return;
    setSourceResolving(true);
    setSourceError("");
    setChatOpen(true);
    setMessages((current) => [
      ...current,
      { id: uid("source-user"), role: "user", text: cleanUrl, time: timeNow() },
      { id: uid("source-checking"), role: "companion", text: characterise(companion, "Lemme get that for you. I am testing the source and verifying the real reading file."), time: timeNow() },
    ]);
    try {
      const source = await resolveSourceCandidate(cleanUrl);
      setPendingSource(source);
      setSourceDialogOpen(false);
      setSourceUrl("");
      setMessages((current) => [
        ...current,
        {
          id: uid("source-found"),
          role: "companion",
          text: characterise(companion, `I found “${source.title}”. Check the details and choose Prepare to read when you are happy with the result.`),
          sourceCard: { source, status: "found" },
          time: timeNow(),
        },
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "ReadVerse could not resolve that source.";
      setSourceError(reason);
      explainSourceFailure(error);
    } finally {
      setSourceResolving(false);
    }
  }

  function addReaderSourceToLibrary(source: ReaderSource) {
    const newBook: Book = {
      id: source.id,
      title: source.title.replace(/\.[^.]+$/, ""),
      subtitle: [source.author, source.format.toUpperCase(), source.domain].filter(Boolean).join(" · "),
      progress: 0,
      genre: "Saved source",
      cover: source.cover || avatarImages[companion.id],
      badge: "Saved",
      sourceUrl: source.sourceUrl,
      format: source.format,
      author: source.author,
      language: source.language,
      savedAt: new Date().toISOString(),
    };
    setLibraryBooks((current) => current.some((book) => book.id === newBook.id || (book.sourceUrl && book.sourceUrl === newBook.sourceUrl)) ? current : [newBook, ...current]);
    setMessages((current) => [
      ...current,
      {
        id: uid("reader-library-added"),
        role: "companion",
        text: characterise(companion, "Added to your library. I kept the title, source, reading mode and progress record. The full file is still temporary until Google Drive saving is connected."),
        time: timeNow(),
      },
    ]);
  }

  function addUploadedToLibrary`, "guided source dialog");

app = replaceOnce(app,
`        onAddUpload={addUploadedToLibrary}
      />`,
`        onAddUpload={addUploadedToLibrary}
        onPrepareSource={prepareSource}
        onOpenSource={openPreparedSource}
        onRejectSource={rejectSource}
        onSelectDiscovery={selectDiscoveryCandidate}
        onRejectDiscovery={rejectDiscoveryCandidate}
        onMoreDiscovery={showMoreDiscovery}
      />`, "panel callbacks");

app = replaceOnce(app,
`          onCloseNotes={() => setNotesOpen(false)}
        />`,
`          onCloseNotes={() => setNotesOpen(false)}
          inLibrary={Boolean(readerSource && libraryBooks.some((book) => book.id === readerSource.id || (book.sourceUrl && book.sourceUrl === readerSource.sourceUrl)))}
          onAddToLibrary={() => readerSource && addReaderSourceToLibrary(readerSource)}
        />`, "reader library callbacks");

const discoveryComponents = `
function DiscoveryResults({ card, onSelect, onReject, onMore }: {
  card: DiscoveryCard;
  onSelect: (candidate: DiscoveryCandidate) => void;
  onReject: (candidate: DiscoveryCandidate) => void;
  onMore: (query: string) => void;
}) {
  return (
    <div className="discovery-results-card">
      {card.candidates.map((candidate) => (
        <article className="discovery-result" key={candidate.id}>
          <span className="discovery-cover">
            {candidate.cover ? <img src={candidate.cover} alt="" /> : <b>{candidate.title.slice(0, 1)}</b>}
          </span>
          <div className="discovery-copy">
            <strong>{candidate.title}</strong>
            <small>{candidate.authors.join(", ") || "Unknown creator"}{candidate.year ? ` · ${candidate.year}` : ""}</small>
            {candidate.description && <p>{candidate.description}</p>}
            <i>{candidate.whyMatch}</i>
            <div className="discovery-actions">
              <button type="button" onClick={() => onSelect(candidate)}>That&apos;s it</button>
              <button type="button" onClick={() => onReject(candidate)}>Not this one</button>
            </div>
          </div>
        </article>
      ))}
      <button className="show-more-discovery" type="button" onClick={() => onMore(card.query)}>Show more matches</button>
    </div>
  );
}

function SourceResultCard({ card, onPrepare, onOpen, onReject }: {
  card: SourceCard;
  onPrepare: (source: SourceCandidate) => void;
  onOpen: (source: SourceCandidate) => void;
  onReject: (source: SourceCandidate) => void;
}) {
  const source = card.source;
  return (
    <div className={`source-result-card status-${card.status}`}>
      <header>
        <span>{source.format.toUpperCase()}</span>
        <div><strong>{source.title}</strong><small>{source.domain}</small></div>
        <i>{card.status === "ready" ? "Ready" : card.status === "preparing" ? "Preparing" : card.status === "failed" ? "Stopped" : "Verified"}</i>
      </header>
      <dl>
        {source.author && <><dt>Author</dt><dd>{source.author}</dd></>}
        {source.language && <><dt>Language</dt><dd>{source.language}</dd></>}
        <dt>Format</dt><dd>{source.format.toUpperCase()}</dd>
        {source.sizeLabel && <><dt>Size</dt><dd>{source.sizeLabel}</dd></>}
        <dt>Storage</dt><dd>Temporary until you save it</dd>
      </dl>
      {card.stages && (
        <div className="source-stages">
          {card.stages.map((stage) => <span className={stage.status} key={stage.id}><i />{stage.label}</span>)}
        </div>
      )}
      {card.error && <p className="source-card-error">{card.error}</p>}
      <div className="source-card-actions">
        {card.status === "found" && <button type="button" onClick={() => onPrepare(source)}>Prepare to read</button>}
        {card.status === "ready" && <button type="button" onClick={() => onOpen(source)}>Open and read</button>}
        {card.status !== "preparing" && <button type="button" className="secondary" onClick={() => onReject(source)}>Not the right one</button>}
      </div>
    </div>
  );
}

`;
app = replaceOnce(app, `function CompanionPanel({`, discoveryComponents + `function CompanionPanel({`, "discovery components");

app = replaceOnce(app,
`  onReadUpload,
  onAddUpload,
}: {`,
`  onReadUpload,
  onAddUpload,
  onPrepareSource,
  onOpenSource,
  onRejectSource,
  onSelectDiscovery,
  onRejectDiscovery,
  onMoreDiscovery,
}: {`, "panel destructure");

app = replaceOnce(app,
`  onReadUpload: (upload: UploadItem) => void;
  onAddUpload: (upload: UploadItem) => void;
}) {`,
`  onReadUpload: (upload: UploadItem) => void;
  onAddUpload: (upload: UploadItem) => void;
  onPrepareSource: (source: SourceCandidate) => void;
  onOpenSource: (source: SourceCandidate) => void;
  onRejectSource: (source: SourceCandidate) => void;
  onSelectDiscovery: (candidate: DiscoveryCandidate) => void;
  onRejectDiscovery: (candidate: DiscoveryCandidate) => void;
  onMoreDiscovery: (query: string) => void;
}) {`, "panel prop types");

app = replaceOnce(app,
`              )}
              <time>{message.time}</time>`,
`              )}
              {message.discovery && <DiscoveryResults card={message.discovery} onSelect={onSelectDiscovery} onReject={onRejectDiscovery} onMore={onMoreDiscovery} />}
              {message.sourceCard && <SourceResultCard card={message.sourceCard} onPrepare={onPrepareSource} onOpen={onOpenSource} onReject={onRejectSource} />}
              <time>{message.time}</time>`, "chat rich cards");

app = replaceOnce(app,
`  onNoteChange,
}: {`,
`  onNoteChange,
  inLibrary,
  onAddToLibrary,
}: {`, "ReaderModal destructure");

app = replaceOnce(app,
`  onNoteChange: (value: string) => void;
  onCloseNotes: () => void;
}) {`,
`  onNoteChange: (value: string) => void;
  onCloseNotes: () => void;
  inLibrary: boolean;
  onAddToLibrary: () => void;
}) {`, "ReaderModal prop types");

app = replaceOnce(app,
`             <nav><button type="button" onClick={onFullscreen}><Icon name="expand" size={19} /></button></nav>`,
`             <nav><button type="button" className="reader-add-library" onClick={onAddToLibrary} disabled={inLibrary}>{inLibrary ? "✓ In Library" : "+ Add to Library"}</button><button type="button" onClick={onFullscreen}><Icon name="expand" size={19} /></button></nav>`, "fallback library button");

app = replaceOnce(app,
`      onNoteChange={onNoteChange}
    />`,
`      onNoteChange={onNoteChange}
      inLibrary={inLibrary}
      onAddToLibrary={onAddToLibrary}
    />`, "PDF reader library props");

app = replaceOnce(app,
`function isSourceFollowUp(value: string) {
  return /^(?:ok(?:ay)?[,.!]?\s*)?(?:let me have it|lemme have it|open it|test it|try it|check it|read it|go ahead|proceed|yes|do it)[.!?]*$/i.test(value.trim());
}`,
`function isSourceFollowUp(value: string) {
  return /^(?:ok(?:ay)?[,.!]?\s*)?(?:let me have it|lemme have it|open it|test it|try it|check it|read it|go ahead|proceed|yes|do it)[.!?]*$/i.test(value.trim());
}

function isPrepareFollowUp(value: string) {
  return /^(?:ok(?:ay)?[,.!]?\s*)?(?:prepare it|prepare to read|let me have it|lemme have it|go ahead|proceed|yes|do it)[.!?]*$/i.test(value.trim());
}

function looksLikeDiscoveryRequest(value: string) {
  const clean = value.toLowerCase();
  return /(?:help me find|find me|search for|looking for|trying to remember|can(?:not|'t) remember|what(?:'s| is) the (?:book|manga|comic|novel)|title of|book called)/i.test(clean)
    || /\b(book|manga|comic|novel|story|magazine)\b.{0,80}\b(about|where|with|called|remember|cover|character|author)\b/i.test(clean);
}`,
"discovery intent helpers");

await writeFile(appPath, app, "utf8");

const readerPath = "src/reader/PdfBookReader.tsx";
let reader = await readFile(readerPath, "utf8");
reader = replaceOnce(reader,
`  note: string;
  onClose: () => void;
  onFullscreen: () => void;
  onNoteChange: (value: string) => void;
};`,
`  note: string;
  inLibrary: boolean;
  onClose: () => void;
  onFullscreen: () => void;
  onNoteChange: (value: string) => void;
  onAddToLibrary: () => void;
};`, "reader prop type");
reader = replaceOnce(reader,
`  note,
  onClose,
  onFullscreen,
  onNoteChange,
}: Props) {`,
`  note,
  inLibrary,
  onClose,
  onFullscreen,
  onNoteChange,
  onAddToLibrary,
}: Props) {`, "reader destructure");
reader = replaceOnce(reader,
`        <button type="button" className="reader-fullscreen" onClick={onFullscreen} aria-label="Toggle fullscreen">⛶</button>`,
`        <button type="button" className="reader-library-action" onClick={onAddToLibrary} disabled={inLibrary}>{inLibrary ? "✓ In Library" : "+ Add to Library"}</button>
        <button type="button" className="reader-fullscreen" onClick={onFullscreen} aria-label="Toggle fullscreen">⛶</button>`, "desktop reader library button");
reader = replaceOnce(reader,
`        <div className="marker-palette" aria-label="Marker colour">`,
`        <button type="button" className="reader-library-mobile" onClick={onAddToLibrary} disabled={inLibrary}>{inLibrary ? "✓ In Library" : "+ Add to Library"}</button>
        <div className="marker-palette" aria-label="Marker colour">`, "mobile reader library button");
await writeFile(readerPath, reader, "utf8");

const workerPath = "worker/index.ts";
let worker = await readFile(workerPath, "utf8");
worker = replaceOnce(worker,
`type ResolveBody = { url?: unknown };`,
`type ResolveBody = { url?: unknown };
type DiscoveryBody = { query?: unknown; exclude?: unknown };
type DiscoverySourceBody = { candidate?: unknown };

type DiscoveryCandidate = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  cover?: string;
  description?: string;
  whyMatch: string;
  provider: string;
  language?: string;
  downloadUrl?: string;
  identifiers?: Record<string, string>;
};`, "worker discovery types");
worker = replaceOnce(worker,
`type ResolvedSource = {
  sourceUrl: string;
  directUrl: string;
  title: string;
  format: string;
  contentType: string;
};`,
`type ResolvedSource = {
  sourceUrl: string;
  directUrl: string;
  title: string;
  format: string;
  contentType: string;
  sizeBytes?: number;
  author?: string;
  language?: string;
  cover?: string;
  provider?: string;
};`, "worker source metadata");
worker = replaceOnce(worker,
`    if (url.pathname === "/api/companion/help") return handleCompanion(request, env, ctx);
    if (url.pathname === "/api/source/resolve") return resolveSourceRequest(request);`,
`    if (url.pathname === "/api/companion/help") return handleCompanion(request, env, ctx);
    if (url.pathname === "/api/discovery/search") return handleDiscoverySearch(request);
    if (url.pathname === "/api/discovery/source") return handleDiscoverySource(request);
    if (url.pathname === "/api/source/resolve") return resolveSourceRequest(request);`, "worker routes");

worker = replaceOnce(worker,
`        streamUrl: \`/api/source/stream?url=\${encodeURIComponent(resolved.directUrl)}\`,
        temporary: true,`,
`        streamUrl: \`/api/source/stream?url=\${encodeURIComponent(resolved.directUrl)}\`,
        temporary: true,
        domain: new URL(resolved.sourceUrl).hostname.replace(/^www\./, ""),
        sizeBytes: resolved.sizeBytes,
        sizeLabel: resolved.sizeBytes ? formatBytes(resolved.sizeBytes) : undefined,
        contentType: resolved.contentType,
        author: resolved.author,
        language: resolved.language,
        cover: resolved.cover,
        provider: resolved.provider,
        verifiedAt: new Date().toISOString(),`, "resolve response metadata");

worker = replaceOnce(worker,
`      contentType: contentType || mimeForFormat(directFormat),
    };`,
`      contentType: contentType || mimeForFormat(directFormat),
      sizeBytes: Number(response.headers.get("content-length") || 0) || undefined,
    };`, "direct source size");

worker = replaceOnce(worker,
`        contentType: candidateType || mimeForFormat(format),
      };`,
`        contentType: candidateType || mimeForFormat(format),
        sizeBytes: size || undefined,
        author: extractMeta(html, "author"),
        language: extractLanguage(html),
      };`, "page source metadata");

const discoveryWorker = `
async function handleDiscoverySearch(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: DiscoveryBody;
  try { body = await request.json() as DiscoveryBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 500) : "";
  const excluded = new Set(Array.isArray(body.exclude) ? body.exclude.filter((item): item is string => typeof item === "string") : []);
  if (query.length < 3) return json({ ok: false, error: "Give me at least one useful clue" }, 400);

  const [google, openLibrary] = await Promise.allSettled([
    searchGoogleBooks(query),
    searchOpenLibrary(query),
  ]);
  const candidates = [
    ...(google.status === "fulfilled" ? google.value : []),
    ...(openLibrary.status === "fulfilled" ? openLibrary.value : []),
  ];
  const deduped = dedupeDiscovery(candidates)
    .filter((item) => !excluded.has(item.id))
    .sort((a, b) => discoveryScore(b, query) - discoveryScore(a, query))
    .slice(0, 6);

  if (!deduped.length) {
    const failed = [google, openLibrary].filter((item) => item.status === "rejected").length;
    return json({
      ok: false,
      reason: failed === 2
        ? "The discovery providers were unreachable, so I could not verify any candidates."
        : "I searched the available catalogues but none matched those clues strongly enough.",
      next: ["Add a character, author, cover colour, year, language, setting, or one word from the title."],
    }, 404);
  }
  return json({ ok: true, query, candidates: deduped, providers: ["Google Books", "Open Library"] });
}

async function handleDiscoverySource(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  let body: DiscoverySourceBody;
  try { body = await request.json() as DiscoverySourceBody; }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const candidate = normalizeDiscoveryCandidate(body.candidate);
  if (!candidate) return json({ ok: false, error: "Choose a valid discovery result" }, 400);

  const verified: ResolvedSource[] = [];
  if (candidate.downloadUrl) {
    try {
      const direct = await resolveSource(validatePublicHttpUrl(new URL(candidate.downloadUrl)));
      verified.push({ ...direct, author: candidate.authors[0], language: candidate.language, cover: candidate.cover, provider: candidate.provider });
    } catch {
      // Continue into public archive discovery.
    }
  }

  const archiveResults = await searchInternetArchive(candidate);
  const lanes = archiveResults.slice(0, 10).map((item) => verifyArchiveItem(item, candidate));
  const settled = await Promise.allSettled(lanes);
  for (const item of settled) {
    if (item.status === "fulfilled" && item.value) verified.push(item.value);
    if (verified.length >= 3) break;
  }
  const unique = dedupeSources(verified).slice(0, 3);
  if (!unique.length) {
    return json({
      ok: false,
      reason: `I identified “${candidate.title}”, but the public sources I checked did not expose a supported file that passed both metadata and live-file verification.`,
      next: ["Try another edition or language.", "Paste a source link you trust.", "Upload your own copy."],
    }, 404);
  }
  return json({
    ok: true,
    sources: unique.map((source) => ({
      sourceUrl: source.sourceUrl,
      directUrl: source.directUrl,
      title: source.title,
      format: source.format,
      streamUrl: `/api/source/stream?url=${encodeURIComponent(source.directUrl)}`,
      temporary: true,
      domain: new URL(source.sourceUrl).hostname.replace(/^www\./, ""),
      sizeBytes: source.sizeBytes,
      sizeLabel: source.sizeBytes ? formatBytes(source.sizeBytes) : undefined,
      contentType: source.contentType,
      author: source.author,
      language: source.language,
      cover: source.cover,
      provider: source.provider,
      verifiedAt: new Date().toISOString(),
      id: sourceId(source),
    })),
  });
}

async function searchGoogleBooks(query: string): Promise<DiscoveryCandidate[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("printType", "books");
  const data = await fetchJson(url) as { items?: Array<Record<string, any>> };
  return (data.items || []).map((item) => {
    const info = item.volumeInfo || {};
    const access = item.accessInfo || {};
    const downloadUrl = access?.pdf?.downloadLink || access?.epub?.downloadLink || undefined;
    return {
      id: `google:${item.id}`,
      title: String(info.title || "Untitled"),
      authors: Array.isArray(info.authors) ? info.authors.map(String) : [],
      year: parseYear(info.publishedDate),
      cover: cleanCover(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
      description: cleanDescription(info.description),
      whyMatch: "Matched against Google Books title, creator and description data.",
      provider: "Google Books",
      language: typeof info.language === "string" ? info.language : undefined,
      downloadUrl: access.accessViewStatus === "FULL_PUBLIC" ? downloadUrl : undefined,
      identifiers: Object.fromEntries((info.industryIdentifiers || []).map((entry: any) => [String(entry.type), String(entry.identifier)])),
    };
  });
}

async function searchOpenLibrary(query: string): Promise<DiscoveryCandidate[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i,edition_key,language,subject,isbn");
  const data = await fetchJson(url) as { docs?: Array<Record<string, any>> };
  return (data.docs || []).map((item) => ({
    id: `openlibrary:${String(item.key || item.edition_key?.[0] || item.title)}`,
    title: String(item.title || "Untitled"),
    authors: Array.isArray(item.author_name) ? item.author_name.map(String) : [],
    year: typeof item.first_publish_year === "number" ? item.first_publish_year : undefined,
    cover: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` : undefined,
    description: Array.isArray(item.subject) ? item.subject.slice(0, 5).join(" · ") : undefined,
    whyMatch: "Matched against Open Library title, author, year and subject data.",
    provider: "Open Library",
    language: Array.isArray(item.language) ? item.language[0] : undefined,
    identifiers: Array.isArray(item.isbn) && item.isbn[0] ? { ISBN: String(item.isbn[0]) } : undefined,
  }));
}

async function searchInternetArchive(candidate: DiscoveryCandidate): Promise<Array<Record<string, any>>> {
  const url = new URL("https://archive.org/advancedsearch.php");
  const creator = candidate.authors[0] ? ` AND creator:("${escapeArchive(candidate.authors[0])}")` : "";
  url.searchParams.set("q", `title:("${escapeArchive(candidate.title)}")${creator} AND mediatype:texts`);
  for (const field of ["identifier", "title", "creator", "year", "language", "collection"]) url.searchParams.append("fl[]", field);
  url.searchParams.set("rows", "10");
  url.searchParams.set("page", "1");
  url.searchParams.set("output", "json");
  const data = await fetchJson(url) as { response?: { docs?: Array<Record<string, any>> } };
  return data.response?.docs || [];
}

async function verifyArchiveItem(item: Record<string, any>, candidate: DiscoveryCandidate): Promise<ResolvedSource | null> {
  const identifier = typeof item.identifier === "string" ? item.identifier : "";
  if (!identifier) return null;
  const metadata = await fetchJson(new URL(`https://archive.org/metadata/${encodeURIComponent(identifier)}`)) as Record<string, any>;
  const meta = metadata.metadata || {};
  if (meta.private === "true" || meta.access_restricted_item === "true" || meta.is_dark === "true" || meta.noindex === "true") return null;
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const ranked = files
    .filter((file: any) => file && typeof file.name === "string" && !file.private)
    .map((file: any) => ({ file, format: detectFormat(String(file.format || ""), file.name) || detectFormat("", file.name) }))
    .filter((entry: any) => entry.format && Number(entry.file.size || 0) <= MAX_REMOTE_BYTES)
    .sort((a: any, b: any) => sourceFormatRank(a.format) - sourceFormatRank(b.format));
  for (const entry of ranked.slice(0, 6)) {
    const direct = new URL(`https://archive.org/download/${encodeURIComponent(identifier)}/${entry.file.name.split("/").map(encodeURIComponent).join("/")}`);
    try {
      const probe = await fetchWithSafeRedirects(direct, { method: "HEAD", headers: sourceHeaders() });
      if (!probe.ok) continue;
      const finalUrl = validatePublicHttpUrl(new URL(probe.url || direct.toString()));
      const contentType = cleanContentType(probe.headers.get("content-type"));
      const filename = filenameFromResponse(probe, finalUrl);
      const format = detectFormat(contentType, filename);
      if (!format) continue;
      const sizeBytes = Number(probe.headers.get("content-length") || entry.file.size || 0) || undefined;
      return {
        sourceUrl: `https://archive.org/details/${identifier}`,
        directUrl: stripTracking(finalUrl).toString(),
        title: String(meta.title || item.title || candidate.title),
        format,
        contentType: contentType || mimeForFormat(format),
        sizeBytes,
        author: stringValue(meta.creator) || candidate.authors[0],
        language: stringValue(meta.language) || candidate.language,
        cover: candidate.cover,
        provider: "Internet Archive",
      };
    } catch {
      // Second verifier failed; continue to the next file.
    }
  }
  return null;
}

function normalizeDiscoveryCandidate(value: unknown): DiscoveryCandidate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim().slice(0, 300) : "";
  if (!title) return null;
  return {
    id: typeof item.id === "string" ? item.id.slice(0, 300) : `candidate:${title}`,
    title,
    authors: Array.isArray(item.authors) ? item.authors.filter((author): author is string => typeof author === "string").slice(0, 8) : [],
    year: typeof item.year === "number" ? item.year : undefined,
    cover: typeof item.cover === "string" ? item.cover : undefined,
    description: typeof item.description === "string" ? item.description.slice(0, 600) : undefined,
    whyMatch: typeof item.whyMatch === "string" ? item.whyMatch.slice(0, 300) : "Selected by the reader.",
    provider: typeof item.provider === "string" ? item.provider.slice(0, 80) : "Discovery",
    language: typeof item.language === "string" ? item.language.slice(0, 40) : undefined,
    downloadUrl: typeof item.downloadUrl === "string" ? item.downloadUrl : undefined,
    identifiers: item.identifiers && typeof item.identifiers === "object" ? item.identifiers as Record<string, string> : undefined,
  };
}

function dedupeDiscovery(items: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalise(item.title)}|${normalise(item.authors[0] || "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function discoveryScore(item: DiscoveryCandidate, query: string): number {
  const tokens = tokenise(query);
  const haystack = normalise(`${item.title} ${item.authors.join(" ")} ${item.description || ""}`);
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  const titleBonus = tokens.filter((token) => normalise(item.title).includes(token)).length * 2;
  return matched + titleBonus + (item.cover ? 0.35 : 0) + (item.authors.length ? 0.25 : 0);
}

function dedupeSources(items: ResolvedSource[]): ResolvedSource[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = stripTracking(new URL(item.directUrl)).toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceId(source: ResolvedSource): string {
  let hash = 2166136261;
  for (const char of source.directUrl) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `source-${(hash >>> 0).toString(16)}`;
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url.toString(), {
    headers: { "user-agent": "NancyReadVerse/1.0", "accept": "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${url.hostname} returned HTTP ${response.status}`);
  return response.json();
}

function cleanCover(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/^http:/, "https:") : undefined;
}
function cleanDescription(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 260) : undefined;
}
function parseYear(value: unknown): number | undefined {
  const match = typeof value === "string" ? value.match(/\d{4}/) : null;
  return match ? Number(match[0]) : undefined;
}
function tokenise(value: string): string[] {
  return [...new Set(normalise(value).split(" ").filter((token) => token.length > 2 && !["the", "and", "book", "manga", "comic", "novel", "story", "about", "with", "that", "this"].includes(token)))];
}
function normalise(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
function escapeArchive(value: string): string {
  return value.replace(/["\\]/g, " ").slice(0, 180);
}
function sourceFormatRank(format: string): number {
  return ({ pdf: 0, epub: 1, cbz: 2, txt: 3 } as Record<string, number>)[format] ?? 9;
}
function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string" && item.trim())?.trim();
  return undefined;
}
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function extractMeta(html: string, name: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1]?.replace(/&amp;/g, "&").trim();
    if (value) return value.slice(0, 180);
  }
  return undefined;
}
function extractLanguage(html: string): string | undefined {
  return html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1]?.slice(0, 20);
}

`;
worker = replaceOnce(worker, `async function resolveSourceRequest(request: Request): Promise<Response> {`, discoveryWorker + `async function resolveSourceRequest(request: Request): Promise<Response> {`, "worker discovery implementation");
await writeFile(workerPath, worker, "utf8");

const stylePath = "src/styles.css";
let styles = await readFile(stylePath, "utf8");
styles += `

/* Guided discovery and source preparation */
.discovery-results-card,.source-result-card{margin-top:12px;border:1px solid color-mix(in srgb,var(--accent) 32%,var(--line));border-radius:16px;background:rgba(5,4,7,.76);overflow:hidden}.discovery-result{display:grid;grid-template-columns:62px 1fr;gap:10px;padding:12px;border-bottom:1px solid var(--line)}.discovery-cover{width:62px;height:88px;border-radius:9px;overflow:hidden;background:linear-gradient(145deg,var(--accent),#24101d);display:grid;place-items:center}.discovery-cover img{width:100%;height:100%;object-fit:cover}.discovery-cover b{font:700 1.5rem Georgia,serif}.discovery-copy{min-width:0}.discovery-copy>strong{display:block;font-size:.92rem}.discovery-copy>small{display:block;margin-top:3px;color:var(--muted);font-size:.72rem}.discovery-copy>p{margin:7px 0 0!important;color:#cfc3cb;font-size:.75rem!important;line-height:1.42}.discovery-copy>i{display:block;margin-top:7px;color:var(--accent-2);font-size:.69rem;font-style:normal}.discovery-actions,.source-card-actions{display:flex;gap:8px;margin-top:10px}.discovery-actions button,.source-card-actions button,.show-more-discovery{border:1px solid color-mix(in srgb,var(--accent) 48%,transparent);border-radius:10px;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 56%,#431129));color:white;padding:8px 10px;font:700 .72rem inherit;cursor:pointer}.discovery-actions button+button,.source-card-actions .secondary{background:transparent;color:var(--muted);border-color:var(--line-strong)}.show-more-discovery{margin:10px 12px;width:calc(100% - 24px);background:transparent}.source-result-card{padding:13px}.source-result-card>header{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center}.source-result-card>header>span{width:44px;height:44px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,var(--accent),#391225);font-size:.68rem;font-weight:900}.source-result-card header div{min-width:0}.source-result-card header strong,.source-result-card header small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-result-card header small{color:var(--muted);font-size:.7rem;margin-top:3px}.source-result-card header>i{font-style:normal;font-size:.65rem;color:var(--accent-2);border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);border-radius:999px;padding:4px 7px}.source-result-card dl{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;margin:12px 0 0;font-size:.72rem}.source-result-card dt{color:var(--faint)}.source-result-card dd{margin:0;color:#e8dfe5}.source-stages{display:grid;gap:7px;margin-top:12px}.source-stages span{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:.72rem}.source-stages span i{width:9px;height:9px;border:1px solid var(--line-strong);border-radius:50%}.source-stages span.done{color:#c8f4df}.source-stages span.done i{background:#35d790;border-color:#35d790}.source-stages span.active{color:#fff}.source-stages span.active i{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent);animation:pulse 1s infinite}.source-stages span.failed{color:#ff8b9d}.source-stages span.failed i{background:#ff526f;border-color:#ff526f}.source-card-error{color:#ff9aab!important;font-size:.73rem!important}.source-card-actions button:disabled{opacity:.55;cursor:default}.reader-add-library,.reader-library-action,.reader-library-mobile{border:1px solid color-mix(in srgb,var(--accent) 48%,transparent)!important;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 58%,#361020))!important;color:#fff!important;border-radius:10px!important;padding:9px 13px!important;font-weight:800!important;white-space:nowrap}.reader-add-library:disabled,.reader-library-action:disabled,.reader-library-mobile:disabled{background:rgba(72,180,126,.18)!important;border-color:rgba(72,180,126,.42)!important;color:#a9edc9!important}.reader-library-mobile{display:none}.pdf-reader-toolbar .reader-library-action{height:38px}.document-fallback .reader-toolbar nav{display:flex;gap:8px;align-items:center}
@media(max-width:760px){.discovery-result{grid-template-columns:52px 1fr;padding:10px}.discovery-cover{width:52px;height:74px}.discovery-copy>p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.source-result-card>header{grid-template-columns:40px minmax(0,1fr)}.source-result-card header>i{grid-column:2;justify-self:start}.reader-library-action{display:none!important}.reader-library-mobile{display:inline-flex;align-items:center;justify-content:center;min-width:124px}.pdf-reader-footer{gap:8px}.pdf-reader-footer .reader-tools{overflow-x:auto}}
`;
await writeFile(stylePath, styles, "utf8");

console.log("Guided discovery, source preparation and reader library actions implemented.");
