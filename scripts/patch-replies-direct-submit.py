from pathlib import Path

path = Path("src/notverse/NotesSocialExperience.tsx")
text = path.read_text()
old = '''  const [draft, setDraft] = useState(""); const listRef = useRef<HTMLDivElement>(null); useEffect(() => { const list = listRef.current; if (!list) return; window.requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; }); }, [replies.length]); function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const clean = draft.trim(); if (!clean) return; onSend(clean); setDraft(""); }\n'''
new = '''  const [draft, setDraft] = useState(""); const listRef = useRef<HTMLDivElement>(null); const submitting = useRef(false); useEffect(() => { const list = listRef.current; if (!list) return; window.requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; }); }, [replies.length]); function sendDraft() { const clean = draft.trim(); if (!clean || submitting.current) return; submitting.current = true; onSend(clean); setDraft(""); window.setTimeout(() => { submitting.current = false; }, 450); } function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); sendDraft(); }\n'''
if text.count(old) != 1:
    raise SystemExit(f"Replies direct-submit function marker mismatch: {text.count(old)}")
text = text.replace(old, new, 1)
old_button = '<button type="submit" disabled={!draft.trim()}>Send</button>'
new_button = '<button type="button" onPointerDown={(event) => { event.preventDefault(); sendDraft(); }} onClick={sendDraft} disabled={!draft.trim()}>Send</button>'
if text.count(old_button) != 1:
    raise SystemExit(f"Replies direct-submit button marker mismatch: {text.count(old_button)}")
path.write_text(text.replace(old_button, new_button, 1))
print("Replies pointer-first tap and Enter submission ownership applied.")
