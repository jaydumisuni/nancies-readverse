from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"missing patch target: {label}")
    return text.replace(old, new, 1)

# package.json
package_path = Path("package.json")
package = json.loads(package_path.read_text())
package["dependencies"]["epubjs"] = "^0.3.93"
package["dependencies"]["jszip"] = "^3.10.1"
package["scripts"]["verify:finish"] = "node scripts/verify-finished-readverse.mjs"
package["scripts"]["build"] = "npm run verify:architecture && tsc --noEmit && vite build && npm run verify:guided && npm run verify:finish"
package_path.write_text(json.dumps(package, indent=2) + "\n")

# wrangler.jsonc
wrangler_path = Path("wrangler.jsonc")
wrangler = json.loads(wrangler_path.read_text())
wrangler["kv_namespaces"] = [{"binding": "SESSION_KV"}]
wrangler_path.write_text(json.dumps(wrangler, indent=2) + "\n")

# Worker platform routing
worker_path = Path("worker/index.ts")
worker = worker_path.read_text()
if 'from "./platform"' not in worker:
    worker = 'import { handlePlatformRoute } from "./platform";\n\n' + worker
worker = replace_once(worker, '''  AI_MODEL: string;\n}''', '''  AI_MODEL: string;\n  SESSION_KV?: KVNamespace;\n  GOOGLE_CLIENT_ID?: string;\n  GOOGLE_CLIENT_SECRET?: string;\n  GOOGLE_REDIRECT_URI?: string;\n  TOKEN_ENCRYPTION_KEY?: string;\n}''', "worker env")
worker = replace_once(worker, '''    const url = new URL(request.url);\n\n    if (url.pathname === "/api/health") {''', '''    const url = new URL(request.url);\n    const platformResponse = await handlePlatformRoute(request, env);\n    if (platformResponse) return platformResponse;\n\n    if (url.pathname === "/api/health") {''', "worker platform route")
worker_path.write_text(worker)

# main.tsx service worker
main_path = Path("src/main.tsx")
main = main_path.read_text()
if 'registerReadVerseServiceWorker' not in main:
    main = main.replace('import "./styles.css";', 'import "./styles.css";\nimport { registerReadVerseServiceWorker } from "./platform/storage";')
    main += '\nvoid registerReadVerseServiceWorker();\n'
main_path.write_text(main)

# App imports and durable state
app_path = Path("src/App.tsx")
app = app_path.read_text()
app = replace_once(app, 'import PdfBookReader from "./reader/PdfBookReader";', '''import PdfBookReader from "./reader/PdfBookReader";\nimport UniversalReader, { type ReaderActionStatus } from "./reader/UniversalReader";\nimport GoogleStoragePanel from "./platform/GoogleStoragePanel";\nimport { useGoogleDriveSync } from "./platform/useGoogleDriveSync";\nimport { cacheSourceForOffline, getOfflineFile, markSnapshotUpdated, saveOfflineBlob } from "./platform/storage";\nimport { getGoogleAccountStatus, saveRemoteSourceToDrive, uploadBlobToDrive } from "./platform/google-client";''', "App imports")
app = replace_once(app, '''  savedAt?: string;\n};''', '''  savedAt?: string;\n  currentPage?: number;\n  totalPages?: number;\n  readerMode?: string;\n  lastOpened?: string;\n  offline?: boolean;\n  driveFileId?: string;\n};''', "Book progress fields")
app = replace_once(app, '''  sizeLabel?: string;\n};\n\ntype ResolveSourceResponse''', '''  sizeLabel?: string;\n  mimeType?: string;\n  blobId?: string;\n};\n\ntype ResolveSourceResponse''', "ReaderSource storage fields")
app = app.replace("sessionStorage.getItem(key)", "localStorage.getItem(key)")
app = replace_once(app, '''  useEffect(() => {\n    sessionStorage.setItem(key, JSON.stringify(value));\n  }, [key, value]);''', '''  useEffect(() => {\n    localStorage.setItem(key, JSON.stringify(value));\n    markSnapshotUpdated();\n    window.dispatchEvent(new Event("readverse:state-changed"));\n  }, [key, value]);''', "durable useStoredState")
app = replace_once(app, '''  const sessionFileUrls = useRef<Map<string, string>>(new Map());\n\n  const theme =''', '''  const sessionFileUrls = useRef<Map<string, string>>(new Map());\n  const sessionFileBlobs = useRef<Map<string, Blob>>(new Map());\n  const [offlineStatus, setOfflineStatus] = useState<Record<string, ReaderActionStatus>>({});\n  const [driveStatus, setDriveStatus] = useState<Record<string, ReaderActionStatus>>({});\n  useGoogleDriveSync();\n\n  const theme =''', "App storage states")
app = replace_once(app, '''    const objectUrl = URL.createObjectURL(file);\n    sessionFileUrls.current.set(upload.id, objectUrl);''', '''    const objectUrl = URL.createObjectURL(file);\n    sessionFileUrls.current.set(upload.id, objectUrl);\n    sessionFileBlobs.current.set(upload.id, file);''', "retain upload blob")
app = replace_once(app, '''    setReaderSource({ id: upload.id, title: upload.name, url, format });''', '''    setReaderSource({ id: upload.id, title: upload.name, url, format, mimeType: upload.type, blobId: upload.id });''', "uploaded reader source")
app = app.replace("Google Drive saving joins in the final account phase.", "You can open it temporarily, save it offline, add it to the library, or save the full file to Drive after connecting Google.")
app = app.replace("No copy was uploaded to Cloudflare. Google Drive is not connected yet, so the file remains in this browser session only.", "No copy was uploaded to Cloudflare. Use Save offline or Save to Drive only when you want to keep it.")
app = replace_once(app, '''      savedAt: new Date().toISOString(),\n    };''', '''      savedAt: new Date().toISOString(),\n      currentPage: 1,\n      totalPages: 1,\n      readerMode: source.format,\n      lastOpened: new Date().toISOString(),\n      offline: offlineStatus[source.id] === "done",\n    };''', "library initial progress")
app = app.replace("The full file is still temporary until Google Drive saving is connected.", "The source record and progress are now durable. Use Save offline or Save to Drive when you want the full file kept.")

helpers_target = '''  function turnPage(direction: "next" | "previous") {'''
helpers = '''  function handleReaderProgress(progress: { page: number; totalPages: number; percent: number; mode: string }) {\n    if (!readerSource) return;\n    setLibraryBooks((current) => current.map((book) =>\n      book.id === readerSource.id || (book.sourceUrl && readerSource.sourceUrl && book.sourceUrl === readerSource.sourceUrl)\n        ? { ...book, currentPage: progress.page, totalPages: progress.totalPages, progress: progress.percent, readerMode: progress.mode, lastOpened: new Date().toISOString() }\n        : book,\n    ));\n  }\n\n  async function saveReaderOffline() {\n    const source = readerSource;\n    if (!source || offlineStatus[source.id] === "working") return;\n    setOfflineStatus((current) => ({ ...current, [source.id]: "working" }));\n    try {\n      const localBlob = source.blobId ? sessionFileBlobs.current.get(source.blobId) : null;\n      if (localBlob) {\n        await saveOfflineBlob({ id: source.id, title: source.title, format: source.format, mimeType: source.mimeType || localBlob.type, blob: localBlob });\n      } else {\n        await cacheSourceForOffline({ id: source.id, title: source.title, url: source.url, format: source.format, mimeType: source.mimeType });\n      }\n      setOfflineStatus((current) => ({ ...current, [source.id]: "done" }));\n      setLibraryBooks((current) => current.map((book) => book.id === source.id ? { ...book, offline: true } : book));\n      setMessages((current) => [...current, { id: uid("offline-saved"), role: "companion", text: characterise(companion, `“${source.title}” is available offline on this device.`), time: timeNow() }]);\n    } catch (error) {\n      setOfflineStatus((current) => ({ ...current, [source.id]: "error" }));\n      setMessages((current) => [...current, { id: uid("offline-error"), role: "companion", text: characterise(companion, `Offline saving stopped because ${error instanceof Error ? error.message : "the browser storage failed"}.`), time: timeNow() }]);\n    }\n  }\n\n  async function saveReaderToDrive() {\n    const source = readerSource;\n    if (!source || driveStatus[source.id] === "working") return;\n    setDriveStatus((current) => ({ ...current, [source.id]: "working" }));\n    try {\n      const account = await getGoogleAccountStatus();\n      if (!account.connected) {\n        setDriveStatus((current) => ({ ...current, [source.id]: "idle" }));\n        setSettingsTab("storage");\n        setSettingsOpen(true);\n        throw new Error(account.configured ? "connect Google Drive first" : "the Google OAuth secrets are not configured yet");\n      }\n      const localBlob = source.blobId ? sessionFileBlobs.current.get(source.blobId) : null;\n      const saved = localBlob\n        ? await uploadBlobToDrive({ blob: localBlob, title: source.title, format: source.format })\n        : await saveRemoteSourceToDrive({ sourceUrl: source.url, title: source.title, format: source.format });\n      setDriveStatus((current) => ({ ...current, [source.id]: "done" }));\n      setLibraryBooks((current) => current.map((book) => book.id === source.id ? { ...book, driveFileId: saved.id } : book));\n      setMessages((current) => [...current, { id: uid("drive-saved"), role: "companion", text: characterise(companion, `Saved “${saved.name}” in the Nancy's ReadVerse folder on Google Drive.`), time: timeNow() }]);\n    } catch (error) {\n      setDriveStatus((current) => ({ ...current, [source.id]: "error" }));\n      setMessages((current) => [...current, { id: uid("drive-error"), role: "companion", text: characterise(companion, `Drive saving stopped because ${error instanceof Error ? error.message : "Google Drive failed"}. Nothing was silently saved.`), time: timeNow() }]);\n    }\n  }\n\n  async function openOfflineReaderSource(source: ReaderSource) {\n    const record = await getOfflineFile(source.id);\n    if (!record) return false;\n    const url = URL.createObjectURL(record.blob);\n    sessionFileUrls.current.set(source.id, url);\n    setReaderSource({ ...source, url, blobId: source.id, mimeType: record.mimeType });\n    setOfflineStatus((current) => ({ ...current, [source.id]: "done" }));\n    return true;\n  }\n\n  function turnPage(direction: "next" | "previous") {'''
app = replace_once(app, helpers_target, helpers, "reader persistence helpers")

# Replace static storage settings pane with functional component.
start = '''            {activeTab === "storage" && (\n              <div className="settings-pane storage-pane">'''
end = '''              </div>\n            )}'''
if start in app:
    start_index = app.index(start)
    end_index = app.index(end, start_index) + len(end)
    app = app[:start_index] + '''            {activeTab === "storage" && <GoogleStoragePanel />}''' + app[end_index:]
elif '<GoogleStoragePanel />' not in app:
    raise SystemExit("missing patch target: storage settings panel")

# Add reader action props at invocation.
app = replace_once(app, '''          onAddToLibrary={() => readerSource && addReaderSourceToLibrary(readerSource)}\n        />''', '''          onAddToLibrary={() => readerSource && addReaderSourceToLibrary(readerSource)}\n          offlineStatus={readerSource ? offlineStatus[readerSource.id] || "idle" : "idle"}\n          driveStatus={readerSource ? driveStatus[readerSource.id] || "idle" : "idle"}\n          onSaveOffline={saveReaderOffline}\n          onSaveToDrive={saveReaderToDrive}\n          onProgress={handleReaderProgress}\n        />''', "ReaderModal action props")

# ReaderModal signature and readers.
app = replace_once(app, '''  inLibrary,\n  onAddToLibrary,\n}: {''', '''  inLibrary,\n  onAddToLibrary,\n  offlineStatus,\n  driveStatus,\n  onSaveOffline,\n  onSaveToDrive,\n  onProgress,\n}: {''', "ReaderModal destructure")
app = replace_once(app, '''  inLibrary: boolean;\n  onAddToLibrary: () => void;\n}) {''', '''  inLibrary: boolean;\n  onAddToLibrary: () => void;\n  offlineStatus: ReaderActionStatus;\n  driveStatus: ReaderActionStatus;\n  onSaveOffline: () => void;\n  onSaveToDrive: () => void;\n  onProgress: (progress: { page: number; totalPages: number; percent: number; mode: string }) => void;\n}) {''', "ReaderModal prop types")

fallback_start = '''  if (activeSource.format.toLowerCase() !== "pdf") {\n    return ('''
fallback_end = '''    );\n  }\n\n  return (\n    <PdfBookReader'''
if fallback_start in app:
    start_index = app.index(fallback_start)
    end_index = app.index(fallback_end, start_index)
    replacement = '''  if (activeSource.format.toLowerCase() !== "pdf") {\n    return (\n      <UniversalReader\n        sourceId={activeSource.id}\n        sourceUrl={activeSource.url}\n        title={activeSource.title}\n        format={activeSource.format}\n        fullscreen={fullscreen}\n        readerRef={readerRef}\n        note={note}\n        inLibrary={inLibrary}\n        offlineStatus={offlineStatus}\n        driveStatus={driveStatus}\n        onClose={onClose}\n        onFullscreen={onFullscreen}\n        onNoteChange={onNoteChange}\n        onAddToLibrary={onAddToLibrary}\n        onSaveOffline={onSaveOffline}\n        onSaveToDrive={onSaveToDrive}\n        onProgress={onProgress}\n      />\n    );\n  }\n\n  return (\n    <PdfBookReader'''
    app = app[:start_index] + replacement + app[end_index + len(fallback_end):]
elif '<UniversalReader' not in app:
    raise SystemExit("missing patch target: non-PDF reader")
app = replace_once(app, '''      inLibrary={inLibrary}\n      onAddToLibrary={onAddToLibrary}\n    />''', '''      inLibrary={inLibrary}\n      onAddToLibrary={onAddToLibrary}\n      offlineStatus={offlineStatus}\n      driveStatus={driveStatus}\n      onSaveOffline={onSaveOffline}\n      onSaveToDrive={onSaveToDrive}\n      onProgress={onProgress}\n    />''', "PDF action props")
app_path.write_text(app)

# PdfBookReader durable progress and save controls.
pdf_path = Path("src/reader/PdfBookReader.tsx")
pdf = pdf_path.read_text()
pdf = pdf.replace("sessionStorage.getItem(key)", "localStorage.getItem(key)")
pdf = pdf.replace("sessionStorage.setItem", "localStorage.setItem")
pdf = replace_once(pdf, '''  onAddToLibrary: () => void;\n};''', '''  onAddToLibrary: () => void;\n  offlineStatus: "idle" | "working" | "done" | "error";\n  driveStatus: "idle" | "working" | "done" | "error";\n  onSaveOffline: () => void;\n  onSaveToDrive: () => void;\n  onProgress: (progress: { page: number; totalPages: number; percent: number; mode: string }) => void;\n};''', "PDF props")
pdf = replace_once(pdf, '''  onNoteChange,\n  onAddToLibrary,\n}: Props) {''', '''  onNoteChange,\n  onAddToLibrary,\n  offlineStatus,\n  driveStatus,\n  onSaveOffline,\n  onSaveToDrive,\n  onProgress,\n}: Props) {''', "PDF destructure")
progress_target = '''  useEffect(() => {\n    localStorage.setItem(storageKey(sourceId, "bookmarks"), JSON.stringify(bookmarks));\n  }, [bookmarks, sourceId]);'''
progress_new = progress_target + '''\n\n  useEffect(() => {\n    if (!pdf) return;\n    onProgress({\n      page: visiblePages[0] ?? page,\n      totalPages: pdf.numPages,\n      percent: Math.round(((visiblePages[0] ?? page) / pdf.numPages) * 100),\n      mode: experience,\n    });\n  }, [experience, page, pdf, visiblePages]);'''
pdf = replace_once(pdf, progress_target, progress_new, "PDF progress callback")
pdf = replace_once(pdf, '''        <button type="button" className="reader-library-action" onClick={onAddToLibrary} disabled={inLibrary}>{inLibrary ? "✓ In Library" : "+ Add to Library"}</button>\n        <button type="button" className="reader-fullscreen"''', '''        <button type="button" className="reader-library-action" onClick={onAddToLibrary} disabled={inLibrary}>{inLibrary ? "✓ In Library" : "+ Add to Library"}</button>\n        <button type="button" className="reader-persist-action" onClick={onSaveOffline} disabled={offlineStatus === "working" || offlineStatus === "done"}>{offlineStatus === "working" ? "Saving offline…" : offlineStatus === "done" ? "✓ Offline" : offlineStatus === "error" ? "Retry offline" : "Save offline"}</button>\n        <button type="button" className="reader-persist-action" onClick={onSaveToDrive} disabled={driveStatus === "working" || driveStatus === "done"}>{driveStatus === "working" ? "Saving to Drive…" : driveStatus === "done" ? "✓ In Drive" : driveStatus === "error" ? "Retry Drive" : "Save to Drive"}</button>\n        <button type="button" className="reader-fullscreen"''', "PDF save buttons")
pdf_path.write_text(pdf)

# CSS additions.
styles_path = Path("src/styles.css")
styles = styles_path.read_text()
extra = '''\n.reader-persist-action{border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.06)!important;color:#f6edf3!important;border-radius:999px!important;padding:9px 13px!important}.reader-persist-action:disabled{opacity:.62}.google-storage-pane{display:grid;gap:16px}.google-account-card{align-items:flex-start}.storage-cloud{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:rgba(255,255,255,.07);font-size:22px}.storage-actions{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}.storage-actions button{border:0;border-radius:999px;padding:10px 15px;background:var(--accent);color:#fff;font-weight:700}.storage-actions button.secondary{background:rgba(255,255,255,.08)}.sync-message{display:block;color:#8ce0bb;margin-top:8px}.sync-error{display:block;color:#ff8a9a;margin-top:8px}@media(max-width:760px){.storage-actions{width:100%;margin-left:0}.reader-persist-action{font-size:0!important;width:38px;height:38px;padding:0!important}.reader-persist-action:before{content:"↓";font-size:16px}.reader-persist-action+ .reader-persist-action:before{content:"☁"}}\n'''
if ".google-storage-pane" not in styles:
    styles += extra
styles_path.write_text(styles)

print("Materialised persistence, Google sync, offline caching and native reader integrations")
