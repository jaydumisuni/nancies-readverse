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

ui_test = Path("scripts/verify-notverse-ui.mjs")
text = ui_test.read_text()
text = text.replace('assert(await page.getByText("Created for Nancy.").isVisible(), "complete origin line is not visible on setup cover");', 'assert(await page.locator(".setup-cover-page h2").filter({ hasText: "Created for Nancy. Shared with the world." }).isVisible(), "complete origin line is not visible on setup cover");')
text = text.replace('await page.locator(\'.setup-sheet-2 input\').first().fill("Nancy");', 'await page.locator(\'.setup-sheet-2 input:not([type="file"])\').first().fill("Nancy");')
ui_test.write_text(text)
