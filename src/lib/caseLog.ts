import type { CaseLogEntry, CaseLogMedia } from "./types";

const DB_NAME = "smile-case-log";
const ENTRIES = "entries";
const MEDIA = "media";

/** Metadata and images are kept in separate stores so search never loads full photos. */
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTRIES))
        db.createObjectStore(ENTRIES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(MEDIA))
        db.createObjectStore(MEDIA, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function settled(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function formatLogDate(createdAt: number): string {
  const d = new Date(createdAt);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/** Filename-safe label: patient name, date and time. */
export function logFileName(entry: CaseLogEntry): string {
  const d = new Date(entry.createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const name =
    (entry.patientName || "Unnamed")
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "Unnamed";
  return `${name}_${stamp}`;
}

export function matchesQuery(entry: CaseLogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const iso = new Date(entry.createdAt).toISOString().slice(0, 10);
  return [
    entry.patientName,
    entry.summary,
    entry.label ?? "",
    formatLogDate(entry.createdAt),
    iso,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export async function addLogEntry(
  entry: CaseLogEntry,
  media: CaseLogMedia,
): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([ENTRIES, MEDIA], "readwrite");
    tx.objectStore(ENTRIES).put(entry);
    tx.objectStore(MEDIA).put(media);
    await settled(tx);
  } finally {
    db.close();
  }
}

/** Newest first. */
export async function listLog(): Promise<CaseLogEntry[]> {
  const db = await open();
  try {
    const all = await new Promise<CaseLogEntry[]>((resolve, reject) => {
      const req = db
        .transaction(ENTRIES, "readonly")
        .objectStore(ENTRIES)
        .getAll();
      req.onsuccess = () => resolve((req.result as CaseLogEntry[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

export async function searchLog(query: string): Promise<CaseLogEntry[]> {
  const all = await listLog();
  return all.filter((entry) => matchesQuery(entry, query));
}

export async function readLogMedia(id: string): Promise<CaseLogMedia | null> {
  const db = await open();
  try {
    return await new Promise<CaseLogMedia | null>((resolve, reject) => {
      const req = db.transaction(MEDIA, "readonly").objectStore(MEDIA).get(id);
      req.onsuccess = () => resolve((req.result as CaseLogMedia) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteLogEntry(id: string): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([ENTRIES, MEDIA], "readwrite");
    tx.objectStore(ENTRIES).delete(id);
    tx.objectStore(MEDIA).delete(id);
    await settled(tx);
  } finally {
    db.close();
  }
}

export async function clearLog(): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([ENTRIES, MEDIA], "readwrite");
    tx.objectStore(ENTRIES).clear();
    tx.objectStore(MEDIA).clear();
    await settled(tx);
  } finally {
    db.close();
  }
}
