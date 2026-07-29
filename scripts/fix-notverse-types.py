from pathlib import Path

setup = Path("src/notverse/SetupWizard.tsx")
text = setup.read_text()
text = text.replace('  gender: string;', '  gender: "woman" | "man" | "nonbinary" | "prefer_not_to_say";', 1)
text = text.replace('gender: event.target.value })', 'gender: event.target.value as SetupProfile["gender"] })', 1)
text = text.replace('<h2>Created for Nancy.<br />Shared with the world.</h2>', '<h2>Created for Nancy. Shared with the world.</h2>')
text = text.replace('<p><strong>Created for Nancy.<br />Shared with the world.</strong></p>', '<p><strong>Created for Nancy. Shared with the world.</strong></p>')
setup.write_text(text)

materialiser = Path("scripts/materialise-notverse.py")
text = materialiser.read_text()
text = text.replace('  async function openNoTVerseBook(book: Book) {', '  async function openNoTVerseBook(book: Pick<Book, "id" | "title" | "sourceUrl" | "format" | "author" | "offline">) {', 1)
materialiser.write_text(text)
