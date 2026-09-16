import type {
  CaseMaterial,
  LibraryCase,
  LibraryCaseMedia,
  LibraryExport,
  Treatment,
} from "./types";
import { caseMaterials } from "./types";

const DB_NAME = "smile-case-library";
const CASES = "cases";
const MEDIA = "media";

/** How many of the clinician's cases may be attached to one generation. */
export const MAX_STYLE_REFERENCES = 3;

/**
 * The library lives on the device for now. Every read and write goes through
 * this module, so moving it to a shared store later is a swap here rather than
 * a change everywhere it is used.
 */
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CASES))
        db.createObjectStore(CASES, { keyPath: "id" });
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

/** Composite treatment covers both composite finishes; porcelain covers its own. */
export function matchesTreatment(
  material: CaseMaterial,
  treatment: Treatment,
): boolean {
  return treatment === "Porcelain"
    ? material === "Porcelain"
    : material !== "Porcelain";
}

/**
 * Which cases to attach. A pinned selection always wins, so a chairside
 * override is never quietly replaced by the automatic match.
 */
export function chooseLibraryCases(
  all: LibraryCase[],
  treatment: Treatment,
  pinned: string[] = [],
  limit = MAX_STYLE_REFERENCES,
): LibraryCase[] {
  const newestFirst = [...all].sort((a, b) => b.addedAt - a.addedAt);
  if (pinned.length > 0)
    return newestFirst.filter((c) => pinned.includes(c.id)).slice(0, limit);
  return newestFirst
    .filter((c) => matchesTreatment(c.material, treatment))
    .slice(0, limit);
}

export function isCaseMaterial(value: unknown): value is CaseMaterial {
  return (
    typeof value === "string" && caseMaterials.includes(value as CaseMaterial)
  );
}

export async function addLibraryCase(
  entry: LibraryCase,
  media: LibraryCaseMedia,
): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([CASES, MEDIA], "readwrite");
    tx.objectStore(CASES).put(entry);
    tx.objectStore(MEDIA).put(media);
    await settled(tx);
  } finally {
    db.close();
  }
}

/** Newest first. */
export async function listLibrary(): Promise<LibraryCase[]> {
  const db = await open();
  try {
    const all = await new Promise<LibraryCase[]>((resolve, reject) => {
      const req = db
        .transaction(CASES, "readonly")
        .objectStore(CASES)
        .getAll();
      req.onsuccess = () => resolve((req.result as LibraryCase[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => b.addedAt - a.addedAt);
  } finally {
    db.close();
  }
}

export async function readLibraryMedia(
  id: string,
): Promise<LibraryCaseMedia | null> {
  const db = await open();
  try {
    return await new Promise<LibraryCaseMedia | null>((resolve, reject) => {
      const req = db.transaction(MEDIA, "readonly").objectStore(MEDIA).get(id);
      req.onsuccess = () => resolve((req.result as LibraryCaseMedia) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Full-size style images for the given cases, skipping any whose media is gone. */
export async function loadStyleReferences(ids: string[]): Promise<string[]> {
  const media = await Promise.all(
    ids.map((id) => readLibraryMedia(id).catch(() => null)),
  );
  return media
    .map((m) => m?.image)
    .filter((image): image is string => typeof image === "string" && !!image);
}

export async function deleteLibraryCase(id: string): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([CASES, MEDIA], "readwrite");
    tx.objectStore(CASES).delete(id);
    tx.objectStore(MEDIA).delete(id);
    await settled(tx);
  } finally {
    db.close();
  }
}

export async function clearLibrary(): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([CASES, MEDIA], "readwrite");
    tx.objectStore(CASES).clear();
    tx.objectStore(MEDIA).clear();
    await settled(tx);
  } finally {
    db.close();
  }
}

export async function exportLibrary(): Promise<LibraryExport> {
  const cases = await listLibrary();
  const withMedia = await Promise.all(
    cases.map(async (c) => {
      const media = await readLibraryMedia(c.id).catch(() => null);
      return media ? { ...c, image: media.image, thumb: media.thumb } : null;
    }),
  );
  return {
    version: 1,
    exportedAt: Date.now(),
    cases: withMedia.filter((c): c is LibraryExport["cases"][number] => !!c),
  };
}

/**
 * Add the cases in a library file, keeping anything already here. Returns how
 * many were added and how many were skipped, rather than failing the whole
 * import because one entry is malformed.
 */
export async function importLibrary(
  file: unknown,
): Promise<{ added: number; skipped: number }> {
  const cases = (file as LibraryExport | null)?.cases;
  if ((file as LibraryExport | null)?.version !== 1 || !Array.isArray(cases))
    throw new Error("That file isn’t a smile case library.");
  let added = 0;
  let skipped = 0;
  for (const entry of cases) {
    const ok =
      entry &&
      typeof entry.id === "string" &&
      isCaseMaterial(entry.material) &&
      typeof entry.image === "string" &&
      entry.image.startsWith("data:image/") &&
      typeof entry.thumb === "string" &&
      entry.thumb.startsWith("data:image/");
    if (!ok) {
      skipped += 1;
      continue;
    }
    await addLibraryCase(
      {
        id: entry.id,
        material: entry.material,
        label: typeof entry.label === "string" ? entry.label.slice(0, 80) : "",
        addedAt:
          typeof entry.addedAt === "number" ? entry.addedAt : Date.now(),
      },
      { id: entry.id, image: entry.image, thumb: entry.thumb },
    );
    added += 1;
  }
  return { added, skipped };
}
