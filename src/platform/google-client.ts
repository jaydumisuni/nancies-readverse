import { collectReadVerseSnapshot, restoreReadVerseSnapshot, type ReadVerseSnapshot } from "./storage";

export type GoogleAccountStatus = {
  configured: boolean;
  connected: boolean;
  email?: string;
  name?: string;
  picture?: string;
};

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed with HTTP ${response.status}`);
  return body;
}

export async function getGoogleAccountStatus(): Promise<GoogleAccountStatus> {
  return jsonRequest<GoogleAccountStatus>("/api/auth/google/status");
}

export function beginGoogleConnection(): void {
  window.location.assign("/api/auth/google/start");
}

export async function disconnectGoogle(): Promise<void> {
  await jsonRequest("/api/auth/google/logout", { method: "POST" });
}

export async function pullDriveSnapshot(): Promise<{ snapshot?: ReadVerseSnapshot; updatedAt?: string }> {
  const body = await jsonRequest<{ ok: boolean; snapshot?: ReadVerseSnapshot; updatedAt?: string }>("/api/sync/state");
  return { snapshot: body.snapshot, updatedAt: body.updatedAt };
}

export async function pushDriveSnapshot(snapshot = collectReadVerseSnapshot()): Promise<{ updatedAt: string }> {
  const body = await jsonRequest<{ ok: boolean; updatedAt: string }>("/api/sync/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ snapshot }),
  });
  return { updatedAt: body.updatedAt };
}

export async function restoreDriveSnapshot(): Promise<boolean> {
  const remote = await pullDriveSnapshot();
  return remote.snapshot ? restoreReadVerseSnapshot(remote.snapshot) : false;
}

export async function saveRemoteSourceToDrive(input: {
  sourceUrl: string;
  title: string;
  format: string;
}): Promise<{ id: string; name: string; webViewLink?: string }> {
  return jsonRequest("/api/drive/save-source", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function uploadBlobToDrive(input: {
  blob: Blob;
  title: string;
  format: string;
}): Promise<{ id: string; name: string; webViewLink?: string }> {
  const query = new URLSearchParams({ name: input.title, format: input.format });
  return jsonRequest(`/api/drive/upload?${query}`, {
    method: "POST",
    headers: { "content-type": input.blob.type || "application/octet-stream" },
    body: input.blob,
  });
}
