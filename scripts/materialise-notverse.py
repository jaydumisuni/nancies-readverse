from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f"Missing App integration target: {label}")

app_path = Path("src/App.tsx")
app = app_path.read_text()

imports_old = 'import { getGoogleAccountStatus, saveRemoteSourceToDrive, uploadBlobToDrive } from "./platform/google-client";'
imports_new = '''import { getGoogleAccountStatus, saveRemoteSourceToDrive, uploadBlobToDrive } from "./platform/google-client";
import SetupWizard from "./notverse/SetupWizard";
import NoTVerseViews from "./notverse/NoTVerseViews";
import { defaultNoTVersePreferences } from "./notverse/storage";
import type { NoTVerseNav, NoTVersePreferences, PresenceReader } from "./notverse/types";
import "./notverse/notverse.css";'''
app = replace_once(app, imports_old, imports_new, "imports")

app = replace_once(app, '  const [activeSection, setActiveSection] = useState("home");', '  const [activeSection, setActiveSection] = useState<NoTVerseNav>("home");\n  const [notversePreferences, setNoTVersePreferences] = useStoredState<NoTVersePreferences>("notverse.preferences", defaultNoTVersePreferences);', "section and preferences")

insert_after = '''  const ringColor = ringColors[companion.id] ?? companion.defaultRing;
'''
insert_new = insert_after + '''  const presenceReaders = useMemo<PresenceReader[]>(() => companions.slice(0, 8).map((item, index) => ({
    id: `presence-${item.id}`,
    name: item.name,
    avatar: avatarImages[item.id],
    book: libraryBooks[index % Math.max(1, libraryBooks.length)]?.title || "One Piece",
    nearProgress: index < 4,
  })), [libraryBooks]);
'''
app = replace_once(app, insert_after, insert_new, "presence")

anchor = '''  function chooseMood(mood: string) {
    setQuestion(`Find something ${mood.toLowerCase()}`);
  }
'''
functions = anchor + '''
  function launchNoTVerseDiscovery(query: string) {
    const clean = query.trim();
    if (!clean) return;
    setActiveSection("search");
    setChatOpen(true);
    setMessages((current) => [...current, { id: uid("notverse-search-user"), role: "user", text: clean, time: timeNow() }]);
    void discoverFromMemory(clean);
  }

  async function openNoTVerseBook(book: Book) {
    if (book.format) {
      const source: ReaderSource = {
        id: book.id,
        title: book.title,
        url: book.sourceUrl || "/fixtures/sample.pdf",
        format: book.format,
        sourceUrl: book.sourceUrl,
        author: book.author,
      };
      if (book.offline && await openOfflineReaderSource(source)) {
        setReaderOpen(true);
        return;
      }
      if (book.sourceUrl) {
        try {
          const resolved = await resolveSourceCandidate(book.sourceUrl);
          setReaderSource({ id: resolved.id, title: resolved.title, url: resolved.streamUrl, format: resolved.format, sourceUrl: resolved.sourceUrl, domain: resolved.domain, author: resolved.author, language: resolved.language, cover: resolved.cover, sizeLabel: resolved.sizeLabel });
          setReaderOpen(true);
          return;
        } catch (error) {
          explainSourceFailure(error, book.title);
          setChatOpen(true);
          return;
        }
      }
      setReaderSource(source);
    } else {
      setReaderSource(null);
    }
    setReaderOpen(true);
  }
'''
app = replace_once(app, anchor, functions, "NoTVerse actions")

app = app.replace('className="readverse-app"', 'className="readverse-app notverse-app"')
app = app.replace('className={`main-shell ${chatOpen ? "with-chat" : ""}`}', 'className={`main-shell notverse-shell ${chatOpen ? "with-chat" : ""}`}' )

brand_start = '''        <a className="brand" href="#home" onClick={() => setActiveSection("home")}>
          <span>Nancy&apos;s</span>
          <strong>ReadVerse</strong>
          <small>Your stories. Your world.</small>
        </a>'''
brand_new = '''        <a className="brand notverse-brand" href="#home" onClick={() => setActiveSection("home")}>
          <span>▤</span>
          <strong>NoTVerse</strong>
          <small className="notverse-origin">Created for Nancy.<br />Shared with the world.</small>
        </a>'''
app = replace_once(app, brand_start, brand_new, "desktop brand")

nav_start = '''          {[
            ["home", "home", "Home"],
            ["library", "book", "Library"],
            ["continue", "clock", "Continue Reading"],
            ["favourites", "heart", "Favourites"],
            ["discover", "search", "Discover"],
            ["sources", "sparkle", "Sources"],
            ["notes", "note", "Notes & Highlights"],
            ["downloads", "download", "Downloads"],
          ].map(([id, icon, label]) => ('''
nav_new = '''          {[
            ["home", "home", "Home"],
            ["search", "search", "Search"],
            ["notes", "note", "Notes"],
            ["library", "book", "Library"],
            ["inbox", "send", "Inbox"],
            ["me", "user", "Me"],
          ].map(([id, icon, label]) => ('''
app = replace_once(app, nav_start, nav_new, "desktop nav")
old_handler = '''              onClick={() => {
                setActiveSection(id);
                if (id === "sources") {
                  setSourceError("");
                  setSourceDialogOpen(true);
                } else if (id === "continue") {
                  setReaderSource(null);
                  setReaderOpen(true);
                } else if (id === "notes") {
                  setReaderSource(null);
                  setReaderOpen(true);
                  setNotesOpen(true);
                }
              }}'''
new_handler = '''              onClick={() => setActiveSection(id as NoTVerseNav)}'''
app = replace_once(app, old_handler, new_handler, "desktop nav handler")

app = replace_once(app, '<div className="mobile-brand"><span>Nancy’s</span><strong>READVERSE</strong></div>', '<div className="mobile-brand"><span>▤</span><strong>NoTVerse</strong></div>', "mobile brand")
app = app.replace('placeholder="Search manga, comics, novels..."', 'placeholder="Search books, manga, comics, PDFs…"')
app = app.replace('onFocus={() => setActiveSection("discover")}', 'onFocus={() => setActiveSection("search")}')

# Replace the old dashboard while preserving all established reader/chat/settings systems.
start_marker = '        <section className="dashboard" id="home">'
end_marker = '        </section>\n\n        <button\n          className="floating-companion"'
if start_marker in app:
    start = app.index(start_marker)
    end = app.index(end_marker, start)
    dashboard = '''        <NoTVerseViews
          active={activeSection}
          displayName={profile.displayName || profile.name}
          avatar={profile.avatarDataUrl}
          status={profile.status}
          greeting={greeting}
          companion={{ name: companion.name, avatar: avatarImages[companion.id], ring: ringColor, summary: companion.summary }}
          books={libraryBooks}
          preferences={notversePreferences}
          presence={presenceReaders}
          onDiscover={launchNoTVerseDiscovery}
          onSource={() => { setSourceError(""); setSourceDialogOpen(true); }}
          onUpload={() => fileInputRef.current?.click()}
          onChat={() => setChatOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onOpenBook={openNoTVerseBook}
        />

'''
    app = app[:start] + dashboard + app[end + len('        </section>\n\n'):]
elif '<NoTVerseViews' not in app:
    raise SystemExit("Missing old dashboard block")

# Insert setup overlay immediately after the cosmic background.
setup_anchor = '      <div className="cosmic-grid" />\n'
setup_block = setup_anchor + '''      {!notversePreferences.setupComplete && (
        <SetupWizard
          profile={profile}
          preferences={notversePreferences}
          selectedTheme={themeId}
          selectedCompanion={selectedCompanionId}
          themes={themes}
          companions={companions.map((item) => ({ id: item.id, name: item.name, summary: item.summary, avatar: avatarImages[item.id], ring: ringColors[item.id] || item.defaultRing }))}
          onProfile={setProfile}
          onPreferences={setNoTVersePreferences}
          onTheme={(id) => setThemeId(id as ThemeId)}
          onCompanion={(id) => updateCompanion(id as AvatarId)}
          onComplete={() => setNoTVersePreferences((current) => ({ ...current, setupComplete: true }))}
        />
      )}
'''
app = replace_once(app, setup_anchor, setup_block, "setup overlay")

mobile_nav_old = '''        {[
          ["home", "home", "Home"],
          ["library", "book", "Library"],
          ["discover", "search", "Search"],
          ["companion", "sparkle", companion.name],
          ["settings", "settings", "Settings"],
        ].map(([id, icon, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => {
              if (id === "companion") setChatOpen(true);
              else if (id === "settings") setSettingsOpen(true);
              else setActiveSection(id);
            }}
          >'''
mobile_nav_new = '''        {[
          ["home", "home", "Home"],
          ["search", "search", "Search"],
          ["notes", "note", "Notes"],
          ["library", "book", "Library"],
          ["inbox", "send", "Inbox"],
          ["me", "user", "Me"],
        ].map(([id, icon, label]) => (
          <button
            type="button"
            key={id}
            className={activeSection === id ? "active" : ""}
            onClick={() => setActiveSection(id as NoTVerseNav)}
          >'''
app = replace_once(app, mobile_nav_old, mobile_nav_new, "mobile nav")
app = app.replace('className="mobile-nav"', 'className="mobile-nav notverse-mobile-nav"')

# Visible product-language corrections.
for old, new in [
    ("ReadVerse Settings", "NoTVerse Settings"),
    ("ReadVerse verifies it", "NoTVerse verifies it"),
    ("ReadVerse could not resolve", "NoTVerse could not resolve"),
    ("Nancy's ReadVerse Sample", "NoTVerse Sample"),
    ("I attached this for ReadVerse.", "I attached this for NoTVerse."),
    ("in the Nancy's ReadVerse folder", "in the NoTVerse folder"),
    ("ReadVerse searches sources", "NoTVerse searches sources"),
    ("ReadVerse will", "NoTVerse will"),
    ("ReadVerse could", "NoTVerse could"),
    ("ReadVerse can", "NoTVerse can"),
    ("ReadVerse keeps", "NoTVerse keeps"),
    ("ReadVerse to", "NoTVerse to"),
]:
    app = app.replace(old, new)

app_path.write_text(app)

# Rebrand Worker-visible product text while preserving route compatibility.
worker_path = Path("worker/index.ts")
worker = worker_path.read_text()
worker = worker.replace("Nancy's ReadVerse", "NoTVerse")
worker = worker.replace("NancyReadVerse", "NoTVerse")
worker = worker.replace("NancysReadVerse", "NoTVerse")
worker = worker.replace("ReadVerse", "NoTVerse")
worker_path.write_text(worker)

platform_path = Path("worker/platform.ts")
platform = platform_path.read_text().replace("Nancy's ReadVerse", "NoTVerse").replace("readverse-state.json", "notverse-state.json")
platform_path.write_text(platform)

# Package identity and strict build tracks.
package_path = Path("package.json")
package = json.loads(package_path.read_text())
package["name"] = "notverse"
package["version"] = "2.0.0"
package.setdefault("scripts", {})["verify:notverse"] = "node scripts/verify-notverse-build.mjs"
package["scripts"]["build"] = "npm run verify:architecture && tsc --noEmit && vite build && npm run verify:guided && npm run verify:finish && npm run verify:notverse"
package_path.write_text(json.dumps(package, indent=2) + "\n")

print("Materialised NoTVerse product expansion")
