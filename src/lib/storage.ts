import { captureWorkspace, workspaceDatabase, guardStore, type WorkspaceLease } from "./workspace";
import { validCaseCosts } from "./generation/cost";
import type { SmileCase } from "./types";
import { imageSchema, settingsSchema } from "./generation/schema";
import { AI_CONSENT_VERSION } from "./aiConsent";
import { isValidToothMap } from "./toothMap/types";
// Serialize transactions so a late save cannot undo New Smile.
const pending = new Map<string, Promise<void>>();

export function createDraftStore(scope: WorkspaceLease, factory:IDBFactory=globalThis.indexedDB) {
  function open(): Promise<IDBDatabase> {
    scope.assert();
    return new Promise((resolve, reject) => {
      const req = factory.open(workspaceDatabase("smile-temporary-case", scope), 1);
      req.onupgradeneeded = () => req.result.createObjectStore("case");
      req.onsuccess = () => { try { scope.assert(); req.result.onversionchange = () => req.result.close(); resolve(req.result); } catch (error) { req.result.close(); reject(error); } };
      req.onerror = () => reject(req.error);
    });
  }

  async function readCase({ forLaunch = false }: { forLaunch?: boolean } = {}): Promise<SmileCase | null> {
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
            !["start", "photo", "design", "preview"].includes(c.screen)
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
            if (result?.review && (typeof result.review.reviewer !== "string" || !result.review.reviewer.trim() || typeof result.review.notes !== "string" || !Number.isFinite(result.review.reviewedAt))) delete result.review;
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
          ).slice(0, 4) : [];
          c.variants.forEach((v: import("./types").SmileVariant) => validatePreferences(v.result));
          if (c.photo.editMask && !imageSchema.safeParse(c.photo.editMask).success) { resolve(null); return; }
          // A damaged tooth map is dropped (it is found again), never trusted.
          if (c.photo.toothMap && !isValidToothMap(c.photo.toothMap)) delete c.photo.toothMap;
          if (c.reference && !imageSchema.safeParse(c.reference.dataUrl).success) c.reference = null;
          if (c.testMode && !imageSchema.safeParse(c.testPreview).success) {
            // Never silently turn an incomplete test case into a paid request.
            resolve(null);
            return;
          }
          if (typeof c.validationCaseId !== "string") delete c.validationCaseId;
          if (typeof c.caseId !== "string" || !c.caseId) delete c.caseId;
          if (c.uploadAuthority && (typeof c.uploadAuthority.version !== "string" || !Number.isFinite(c.uploadAuthority.confirmedAt))) delete c.uploadAuthority;
          if (![0,3,5,10,20].includes(c.requestLimit)) delete c.requestLimit;
          if (c.costs !== undefined && !validCaseCosts(c.costs)) delete c.costs;
          if (c.resolution !== undefined && !["512", "1K"].includes(c.resolution)) delete c.resolution;
          if (typeof c.patientName !== "string") delete c.patientName;
          if (c.aiConsent !== null && c.aiConsent !== undefined &&
              (c.aiConsent.version !== AI_CONSENT_VERSION ||
               !/^[a-f0-9]{64}$/.test(c.aiConsent.photoFingerprint) ||
               !Number.isFinite(c.aiConsent.confirmedAt))) delete c.aiConsent;
          if (c.screen === "preview" && !c.result) c.screen = "design";
          // A cold launch restores the work, but opens Home. Ordinary reads and
          // explicit case reopening keep their saved navigation unchanged.
          if (forLaunch) c.screen = "start";
          resolve(c);
        };
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function saveCase(value: SmileCase | null): Promise<void> {
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

  function persistCase(value: SmileCase | null) {
    const key = workspaceDatabase("smile-temporary-case", scope);
    const next = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(() => saveCase(value));
    pending.set(key, next);
    const release = () => { if (pending.get(key) === next) pending.delete(key); };
    void next.then(release, release);
    return next;
  }
  return guardStore(scope, { readCase, saveCase, persistCase });

}
export const readCase = (...args: Parameters<ReturnType<typeof createDraftStore>["readCase"]>) => createDraftStore(captureWorkspace()).readCase(...args);
export const saveCase = (...args: Parameters<ReturnType<typeof createDraftStore>["saveCase"]>) => createDraftStore(captureWorkspace()).saveCase(...args);
export const persistCase = (...args: Parameters<ReturnType<typeof createDraftStore>["persistCase"]>) => createDraftStore(captureWorkspace()).persistCase(...args);
