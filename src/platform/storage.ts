export type OfflineFileRecord = {
  id: string;
  title: string;
  mimeType: string;
  format: string;
  size: number;
  savedAt: string;
  blob: Blob;
};

export type ReadVerseSnapshot = {
  version: 1;
  updatedAt: string;
  values: Record<string, unknown>;
};

const DB_NAME = "nancies-readverse";
const DB_VERSION = 1;
const FILE_STORE = "reading-files";
const SNAPSHOT_PREFIX = "readverse.";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("ReadVerse offline storage could not open"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(FILE_STORE, mode);
      const request = action(transaction.objectStore(FILE_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("ReadVerse offline storage failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("ReadVerse offline transaction was cancelled"));
    });
  } finally {
    database.close();
  }
}

export async function saveOfflineBlob(input: Omit<OfflineFileRecord, "savedAt" | "size"> & { savedAt?: string }): Promise<OfflineFileRecord> {
  const record: OfflineFileRecord = {
    ...input,
    size: input.blob.size,
    savedAt: input.savedAt ?? new Date().toISOString(),
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function cacheSourceForOffline(input: {
  id: string;
  title: string;
  url: string;
  format: string;
  mimeType?: string;
  onProgress?: (percent: number | null) => void;
}): Promise<OfflineFileRecord> {
  const response = await fetch(input.url, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`The reading file returned HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      input.onProgress?.(total ? Math.min(100, Math.round((received / total) * 100)) : null);
    }
  }
  const blob = new Blob(chunks, { type: input.mimeType || response.headers.get("content-type") || mimeForFormat(input.format) });
  input.onProgress?.(100);
  return saveOfflineBlob({ id: input.id, title: input.title, format: input.format, mimeType: blob.type || mimeForFormat(input.format), blob });
}

export async function getOfflineFile(id: string): Promise<OfflineFileRecord | null> {
  const value = await withStore<OfflineFileRecord | undefined>("readonly", (store) => store.get(id));
  return value ?? null;
}

export async function removeOfflineFile(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function listOfflineFiles(): Promise<Array<Omit<OfflineFileRecord, "blob">>> {
  const records = await withStore<OfflineFileRecord[]>("readonly", (store) => store.getAll());
  return records.map(({ blob: _blob, ...metadata }) => metadata);
}

export function collectReadVerseSnapshot(): ReadVerseSnapshot {
  const values: Record<string, unknown> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(SNAPSHOT_PREFIX)) continue;
    try { values[key] = JSON.parse(localStorage.getItem(key) || "null"); }
    catch { values[key] = localStorage.getItem(key); }
  }
  return { version: 1, updatedAt: new Date().toISOString(), values };
}

export function snapshotTimestamp(): string {
  return localStorage.getItem("readverse.snapshot-updated-at") || "";
}

export function markSnapshotUpdated(updatedAt = new Date().toISOString()): void {
  localStorage.setItem("readverse.snapshot-updated-at", updatedAt);
}

export function restoreReadVerseSnapshot(snapshot: ReadVerseSnapshot): boolean {
  if (!snapshot || snapshot.version !== 1 || !snapshot.values) return false;
  const remoteTime = Date.parse(snapshot.updatedAt || "");
  const localTime = Date.parse(snapshotTimestamp() || "");
  if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime >= remoteTime) return false;
  for (const [key, value] of Object.entries(snapshot.values)) {
    if (!key.startsWith(SNAPSHOT_PREFIX)) continue;
    localStorage.setItem(key, JSON.stringify(value));
  }
  markSnapshotUpdated(snapshot.updatedAt);
  return true;
}

export function mimeForFormat(format: string): string {
  return ({ pdf: "application/pdf", epub: "application/epub+zip", cbz: "application/vnd.comicbook+zip", txt: "text/plain;charset=utf-8" } as Record<string, string>)[format.toLowerCase()] || "application/octet-stream";
}

export async function registerReadVerseServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); }
  catch (error) { console.warn("ReadVerse service worker registration failed", error); }
}
