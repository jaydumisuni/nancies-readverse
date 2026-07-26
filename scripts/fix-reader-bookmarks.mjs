import { readFile, writeFile } from "node:fs/promises";

const path = "src/reader/PdfBookReader.tsx";
let source = await readFile(path, "utf8");

const oldPanel = `{panel === "bookmarks" && (bookmarks.length ? bookmarks.map((item) => (\n                <button type="button" className="outline-item" key={item.page} onClick={() => goToPage(item.page)}>\n                  <b>Ribbon bookmark</b><span>Page {item.page}</span>\n                </button>\n              )) : <p className="empty-panel">Place a ribbon bookmark on a page and it will appear here.</p>)}`;
const newPanel = `{panel === "bookmarks" && (\n                <>\n                  <button type="button" className="bookmark-current" onClick={toggleBookmark}>\n                    {bookmarked ? "Remove ribbon from this page" : "Add ribbon to this page"}\n                  </button>\n                  {bookmarks.length ? bookmarks.map((item) => (\n                    <button type="button" className="outline-item" key={item.page} onClick={() => goToPage(item.page)}>\n                      <b>Ribbon bookmark</b><span>Page {item.page}</span>\n                    </button>\n                  )) : <p className="empty-panel">Place a ribbon bookmark on a page and it will appear here.</p>}\n                </>\n              )}`;
if (!source.includes(oldPanel)) throw new Error("Bookmark panel block was not found");
source = source.replace(oldPanel, newPanel);

const oldButton = `<button type="button" className={bookmarked ? "active" : ""} onClick={toggleBookmark}><span>♧</span>Bookmark</button>`;
const newButton = `<button type="button" className={panel === "bookmarks" || bookmarked ? "active" : ""} onClick={() => setPanel(panel === "bookmarks" ? null : "bookmarks")}><span>♧</span>Bookmark</button>`;
if (!source.includes(oldButton)) throw new Error("Bookmark footer control was not found");
source = source.replace(oldButton, newButton);

await writeFile(path, source, "utf8");

const cssPath = "src/reader/pdf-book-reader.css";
let css = await readFile(cssPath, "utf8");
if (!css.includes(".bookmark-current")) {
  css += `\n.bookmark-current { width: 100%; min-height: 38px; border: 1px solid color-mix(in srgb, var(--accent) 38%, rgba(255,255,255,.08)); border-radius: 10px; background: color-mix(in srgb, var(--accent) 10%, rgba(255,255,255,.025)); color: #f7edf2; font-size: .62rem; }\n`;
}
await writeFile(cssPath, css, "utf8");
console.log("Made ribbon bookmarks navigable and removable.");
