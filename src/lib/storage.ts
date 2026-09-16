import type { SmileCase } from "./types";
import { imageSchema, settingsSchema } from "./generation/schema";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("smile-temporary-case", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("case");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function readCase(): Promise<SmileCase | null> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("case", "readonly")
        .objectStore("case")
        .get("current");
      req.onsuccess = () => {
        const c = req.result;
        if (
          !c ||
          !settingsSchema.safeParse(c.settings).success ||
          !imageSchema.safeParse(c.photo?.dataUrl).success ||
          !["start", "design", "preview"].includes(c.screen)
        ) {
          resolve(null);
          return;
        }
        if (
          c.result &&
          (!imageSchema.safeParse(c.result.image).success ||
            !["mock", "live"].includes(c.result.mode))
        )
          c.result = null;
        const validatePreferences = (result: import("./types").GenerationResult | null) => {
          if (!result?.preferences) return;
          const p = result.preferences;
          if (!settingsSchema.safeParse(p.settings).success ||
              (p.referenceUsed !== undefined && typeof p.referenceUsed !== "boolean") ||
              (p.testMode !== undefined && typeof p.testMode !== "boolean")) delete result.preferences;
        };
        validatePreferences(c.result);
        c.variants = Array.isArray(c.variants) ? c.variants.filter((v: import("./types").SmileVariant) =>
          typeof v?.label === "string" && typeof v?.note === "string" && settingsSchema.safeParse(v.settings).success &&
          imageSchema.safeParse(v.result?.image).success && ["mock", "live"].includes(v.result?.mode) && typeof v.result?.variationId === "string"
        ).slice(0, 3) : [];
        c.variants.forEach((v: import("./types").SmileVariant) => validatePreferences(v.result));
        if (c.reference && !imageSchema.safeParse(c.reference.dataUrl).success) c.reference = null;
        if (c.testMode && !imageSchema.safeParse(c.testPreview).success) {
          // Never silently turn an incomplete test case into a paid request.
          resolve(null);
          return;
        }
        if (c.screen === "preview" && !c.result) c.screen = "design";
        resolve(c);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function saveCase(value: SmileCase | null): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("case", "readwrite");
      if (value) tx.objectStore("case").put(value, "current");
      else tx.objectStore("case").delete("current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
// Serialize transactions so a late save cannot undo New Smile.
let pending: Promise<void> = Promise.resolve();
export function persistCase(value: SmileCase | null) {
  const next = pending.catch(() => {}).then(() => saveCase(value));
  pending = next;
  return next;
}
