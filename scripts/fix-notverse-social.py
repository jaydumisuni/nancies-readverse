from pathlib import Path

path = Path("social-worker/index.ts")
text = path.read_text()
old = '''    else if (view === "books") { clauses.push("n.book_id IN (SELECT json_extract(value,'$.id') FROM json_each(COALESCE((SELECT payload FROM social_library WHERE account_id=?),'[]'))) "); values.push(auth.sub); }'''
new = '''    else if (view === "books") { clauses.push("n.book_id IS NOT NULL"); }'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("NoTVerse social books-view target missing")
path.write_text(text)
