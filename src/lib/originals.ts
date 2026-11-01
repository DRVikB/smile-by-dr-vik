import { guardStore, workspaceDatabase, type WorkspaceLease } from "./workspace";

/**
 * The full-size original of each patient photograph, exactly as it arrived from the camera, the photo library or a
 * file (never re-encoded or scaled). The design itself works from a smaller copy (at most 2048 px, src/lib/photos.ts)
 * and the photo set from 1600 px copies; this file is kept on the device beside its case so the clinician can send
 * it to a lab or add it to the patient's records. It is deleted with its case, and with the rest of the device's
 * data (src/lib/localData.ts).
 */
export interface OriginalPhoto {
  id: string;
  caseId: string;
  /** What it is in the case: "design" (the photo a design is made from) or "photo-set:<view>". */
  role: string;
  /** The file's own name, for the share sheet. */
  name: string;
  type: string;
  bytes: number;
  createdAt: number;
  blob: Blob;
}
export type OriginalInfo = Omit<OriginalPhoto, "blob">;

export const ORIGINALS_DATABASE = "smile-originals";

/**
 * An original waits here between the photo being read and the case accepting it; only a small token rides on the
 * working Photo (`pendingOriginal`), so the file itself is never copied into the working case or its autosaves.
 */
const held = new Map<string, { blob: Blob; name: string }>();
export function holdOriginal(blob: Blob, name: string): string {
  const token = crypto.randomUUID();
  held.set(token, { blob, name });
  // Only the last few photos read can still be accepted; older ones were replaced before they were used.
  while (held.size > 4) held.delete(held.keys().next().value as string);
  return token;
}
export function takeHeldOriginal(token: string | undefined): { blob: Blob; name: string } | null {
  if (!token) return null;
  const value = held.get(token) ?? null;
  held.delete(token);
  return value;
}

/** A name a lab can open: the case's name if it has one, the role, and the file's own extension. */
export function originalFileName(original: Pick<OriginalPhoto, "name" | "type" | "role">, label?: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(original.name)?.[1]?.toLowerCase()
    ?? ({ "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[original.type]
    ?? "jpg";
  const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const role = original.role === "design" ? "photo" : original.role.replace(/^photo-set:/, "");
  const base = [label ? slug(label) : "", slug(role), "original"].filter(Boolean).join("-");
  return `${base || "original"}.${ext === "jpeg" ? "jpg" : ext}`;
}

export function createOriginalStore(scope: WorkspaceLease, factory: IDBFactory = globalThis.indexedDB) {
  // Two stores: the details (small, listed freely) and the files, read only when one is shared.
  const META = "originals", FILES = "files";
  function open(): Promise<IDBDatabase> {
    scope.assert();
    return new Promise((resolve, reject) => {
      const req = factory.open(workspaceDatabase(ORIGINALS_DATABASE, scope), 1);
      req.onupgradeneeded = () => {
        const meta = req.result.createObjectStore(META, { keyPath: "id" });
        meta.createIndex("caseId", "caseId");
        meta.createIndex("caseRole", ["caseId", "role"]);
        req.result.createObjectStore(FILES);
      };
      req.onsuccess = () => { try { scope.assert(); req.result.onversionchange = () => req.result.close(); resolve(req.result); } catch (error) { req.result.close(); reject(error); } };
      req.onerror = () => reject(req.error);
    });
  }
  function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  }
  function settled(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  }
  /** Removes the originals under these ids, details and files, in one transaction. */
  function drop(tx: IDBTransaction, ids: IDBValidKey[]) {
    for (const id of ids) { tx.objectStore(META).delete(id); tx.objectStore(FILES).delete(id); }
  }

  /** Keeps the file. `replace` drops the case's earlier originals in the same role (a photo-set view retaken). */
  async function save(input: { caseId: string; role: string; blob: Blob; name: string; replace?: boolean }): Promise<OriginalInfo> {
    const record: OriginalInfo = {
      id: crypto.randomUUID(), caseId: input.caseId, role: input.role, name: input.name || "photo",
      type: input.blob.type || "image/jpeg", bytes: input.blob.size, createdAt: Date.now(),
    };
    // Stored as bytes: WebKit can't keep a Blob in IndexedDB in a private or ephemeral session.
    const data = await input.blob.arrayBuffer();
    const db = await open();
    try {
      const tx = db.transaction([META, FILES], "readwrite");
      if (input.replace) drop(tx, await request(tx.objectStore(META).index("caseRole").getAllKeys([input.caseId, input.role])));
      tx.objectStore(META).put(record);
      tx.objectStore(FILES).put(data, record.id);
      await settled(tx);
      return record;
    } finally { db.close(); }
  }
  async function get(id: string): Promise<OriginalPhoto | null> {
    const db = await open();
    try {
      const tx = db.transaction([META, FILES], "readonly");
      const [meta, data] = await Promise.all([request(tx.objectStore(META).get(id)) as Promise<OriginalInfo | undefined>, request(tx.objectStore(FILES).get(id)) as Promise<ArrayBuffer | undefined>]);
      return meta && data ? { ...meta, blob: new Blob([data], { type: meta.type }) } : null;
    } finally { db.close(); }
  }
  /** The case's originals, newest first, without their files. */
  async function list(caseId: string): Promise<OriginalInfo[]> {
    const db = await open();
    try {
      const all = await request(db.transaction(META, "readonly").objectStore(META).index("caseId").getAll(caseId)) as OriginalInfo[];
      return all.sort((a, b) => b.createdAt - a.createdAt);
    } finally { db.close(); }
  }
  /** The newest original in this role (a photo-set view), with its file. */
  async function latest(caseId: string, role: string): Promise<OriginalPhoto | null> {
    const found = (await list(caseId)).find(o => o.role === role);
    return found ? get(found.id) : null;
  }
  async function remove(id: string): Promise<void> {
    const db = await open();
    try { const tx = db.transaction([META, FILES], "readwrite"); drop(tx, [id]); await settled(tx); }
    finally { db.close(); }
  }
  async function removeRole(caseId: string, role: string): Promise<void> {
    const db = await open();
    try {
      const tx = db.transaction([META, FILES], "readwrite");
      drop(tx, await request(tx.objectStore(META).index("caseRole").getAllKeys([caseId, role])));
      await settled(tx);
    } finally { db.close(); }
  }
  async function removeCase(caseId: string): Promise<void> {
    const db = await open();
    try {
      const tx = db.transaction([META, FILES], "readwrite");
      drop(tx, await request(tx.objectStore(META).index("caseId").getAllKeys(caseId)));
      await settled(tx);
    } finally { db.close(); }
  }
  /** Drops originals whose case is no longer on this device (a case deleted while the app was elsewhere). */
  async function prune(keep: ReadonlySet<string>): Promise<number> {
    const db = await open();
    try {
      const tx = db.transaction([META, FILES], "readwrite");
      const all = await request(tx.objectStore(META).getAll()) as OriginalInfo[];
      const gone = all.filter(o => !keep.has(o.caseId)).map(o => o.id);
      drop(tx, gone);
      await settled(tx);
      return gone.length;
    } finally { db.close(); }
  }
  return guardStore(scope, { save, get, list, latest, remove, removeRole, removeCase, prune });
}
export type OriginalStore = ReturnType<typeof createOriginalStore>;
