import type {
  CaseMaterial,
  LibraryCase,
  LibraryCaseMedia,
  LibraryExport,
  Treatment,
  SmileSettings,
  CaseContext,
} from "./types";
import { z } from "zod";
import { supportedTeeth } from "./teeth";
import { caseFeatures, adjunctTreatments } from "./types";
import { caseMaterials } from "./types";

export const contextSchema = z.object({
  features: z.array(z.enum(caseFeatures)).max(6),
  teeth: z.array(z.number().int().refine(id => supportedTeeth.includes(id))).max(28),
  adjuncts: z.array(z.enum(adjunctTreatments)).max(3),
  followUpWeeks: z.number().int().min(0).max(1040).optional(),
});
export function referenceScore(entry: LibraryCase, settings?: Pick<SmileSettings, "caseFeatures" | "selectedTeeth">): number {
  if (!settings || !entry.context) return 0;
  const features = settings.caseFeatures ?? [];
  const matched = entry.context.features.filter(f => features.includes(f)).length;
  const teeth = entry.context.teeth.filter(id => settings.selectedTeeth.includes(id)).length;
  const union = new Set([...entry.context.teeth, ...settings.selectedTeeth]).size;
  // Starting conditions dominate; tooth overlap breaks ties before recency.
  return matched * 10 + (union ? teeth / union : 0);
}
export async function updateLibraryContext(id: string, patch: { context: CaseContext; validationOnly?: boolean }, beforeImage?: string) {
  const entry = (await listLibrary()).find(c => c.id === id);
  const media = await readLibraryMedia(id);
  if (!entry || !media) throw new Error("That case could not be opened.");
  await addLibraryCase({ ...entry, ...patch, context: contextSchema.parse(patch.context) }, { ...media, ...(beforeImage ? { beforeImage } : {}) });
}

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

/** Match the explicit technique; only legacy generic composite pools both. */
export function matchesTreatment(
  material: CaseMaterial,
  treatment: Treatment,
): boolean {
  return treatment === "Composite" ? material !== "Porcelain" : material === treatment;
}

/**
 * Which cases to attach. A pinned selection always wins, so a chairside
 * override is never replaced by an automatic match. Incompatible materials are excluded.
 */
export function chooseLibraryCases(
  all: LibraryCase[],
  treatment: Treatment,
  pinned: string[] = [],
  limit = MAX_STYLE_REFERENCES,
  settings?: Pick<SmileSettings, "caseFeatures" | "selectedTeeth">,
): LibraryCase[] {
  const newestFirst = all.filter(c => !c.validationOnly).sort((a, b) => referenceScore(b, settings) - referenceScore(a, settings) || b.addedAt - a.addedAt);
  if (pinned.length > 0)
    return newestFirst.filter((c) => pinned.includes(c.id) && matchesTreatment(c.material, treatment)).slice(0, limit);
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
export async function loadStyleReferences(ids: string[], excludedImage?: string): Promise<string[]> {
  const media = await Promise.all(
    ids.map((id) => readLibraryMedia(id).catch(() => null)),
  );
  return media
    .map((m) => m?.image)
    .filter((image): image is string => typeof image === "string" && !!image && image !== excludedImage);
}

export async function deleteLibraryCase(id: string): Promise<void> {
  await (await import("./validation")).deleteValidationRecords(id);
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
  for (const c of await listLibrary()) await (await import("./validation")).deleteValidationRecords(c.id);
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
      return media ? { ...c, image: media.image, thumb: media.thumb, beforeImage: media.beforeImage } : null;
    }),
  );
  return {
    version: 1,
    exportedAt: Date.now(),
    cases: withMedia.filter(c => c !== null),
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
        ...(contextSchema.safeParse(entry.context).success ? { context: contextSchema.parse(entry.context) } : {}),
        validationOnly: entry.validationOnly === true,
      },
      { id: entry.id, image: entry.image, thumb: entry.thumb, ...(typeof entry.beforeImage === "string" && entry.beforeImage.startsWith("data:image/") ? { beforeImage: entry.beforeImage } : {}) },
    );
    added += 1;
  }
  return { added, skipped };
}
