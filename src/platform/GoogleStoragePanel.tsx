import { useEffect, useState } from "react";
import { beginGoogleConnection, disconnectGoogle, getGoogleAccountStatus, pushDriveSnapshot, type GoogleAccountStatus, type SyncStatus } from "./google-client";
import { collectReadVerseSnapshot, markSnapshotUpdated } from "./storage";

export default function GoogleStoragePanel() {
  const [account, setAccount] = useState<GoogleAccountStatus>({ configured: true, connected: false });
  const [sync, setSync] = useState<SyncStatus>("idle");
  const [message, setMessage] = useState("");

  async function refresh() {
    try { setAccount(await getGoogleAccountStatus()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Google status failed"); }
  }

  useEffect(() => { void refresh(); }, []);

  async function syncNow() {
    setSync("syncing");
    setMessage("");
    try {
      const snapshot = collectReadVerseSnapshot();
      const result = await pushDriveSnapshot(snapshot);
      markSnapshotUpdated(result.updatedAt);
      setSync("synced");
      setMessage("Profile, settings, library, progress, notes, bookmarks and highlights are synced.");
    } catch (error) {
      setSync("error");
      setMessage(error instanceof Error ? error.message : "Google Drive sync failed");
    }
  }

  async function disconnect() {
    await disconnectGoogle();
    setAccount({ configured: account.configured, connected: false });
    setSync("idle");
    setMessage("Google disconnected. Local and offline reading data remains on this device.");
  }

  return (
    <div className="settings-pane storage-pane google-storage-pane">
      <div className="storage-card google-account-card">
        <span className="storage-cloud">☁</span>
        <div>
          <strong>{account.connected ? account.name || "Google Drive connected" : "Google Drive"}</strong>
          <p>{account.connected ? `${account.email} · One Nancy's ReadVerse folder keeps account data and files the reader explicitly saves.` : account.configured ? "Connect once to sync profile, settings, library, reading progress, notes, highlights and selected files." : "Google OAuth is ready in the app but its Cloudflare secrets still need to be configured."}</p>
          {message && <small className={sync === "error" ? "sync-error" : "sync-message"}>{message}</small>}
        </div>
        <div className="storage-actions">
          {!account.connected && account.configured && <button type="button" onClick={beginGoogleConnection}>Connect Google</button>}
          {account.connected && <><button type="button" onClick={syncNow} disabled={sync === "syncing"}>{sync === "syncing" ? "Syncing…" : sync === "synced" ? "✓ Synced" : "Sync now"}</button><button type="button" className="secondary" onClick={disconnect}>Disconnect</button></>}
          {!account.configured && <span>Needs secrets</span>}
        </div>
      </div>
      <div className="storage-card">
        <span className="storage-cloud">↓</span>
        <div><strong>Offline reading</strong><p>PDF, EPUB, CBZ and TXT files saved offline are stored in this browser with IndexedDB. The app shell is cached by its service worker.</p></div>
        <span>Ready</span>
      </div>
    </div>
  );
}
