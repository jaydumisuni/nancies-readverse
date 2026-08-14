from pathlib import Path

path = Path("src/notverse/NotesSocialExperience.tsx")
text = path.read_text()
old = '  const [draft, setDraft] = useState(""); function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const clean = draft.trim(); if (!clean) return; onSend(clean); setDraft(""); }\n  return <div className="note-modal-backdrop replies-backdrop"><section className="replies-drawer"><header><div><strong>Replies</strong><small>{replies.length} saved here{note.replies > replies.length ? ` · ${note.replies} total` : ""}</small></div><button type="button" onClick={onClose} aria-label="Close replies">×</button></header><div className="replies-list">'
new = '  const [draft, setDraft] = useState(""); const listRef = useRef<HTMLDivElement>(null); useEffect(() => { const list = listRef.current; if (!list) return; window.requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; }); }, [replies.length]); function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const clean = draft.trim(); if (!clean) return; onSend(clean); setDraft(""); }\n  return <div className="note-modal-backdrop replies-backdrop"><section className="replies-drawer"><header><div><strong>Replies</strong><small>{replies.length} saved here{note.replies > replies.length ? ` · ${note.replies} total` : ""}</small></div><button type="button" onClick={onClose} aria-label="Close replies">×</button></header><div className="replies-list" ref={listRef}>'
if text.count(old) != 1:
    raise SystemExit(f"RepliesDrawer autoscroll marker mismatch: {text.count(old)}")
path.write_text(text.replace(old, new, 1))
print("Replies auto-follow patch applied.")
