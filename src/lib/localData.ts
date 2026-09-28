/**
 * Every place SmileCompose keeps case data on this device. "Delete all data on
 * this device" removes all of them. Keep this list in step with new stores.
 */
export const LOCAL_DATABASES = ["smile-temporary-case", "smile-case-log", "smile-case-library", "smile-validation"] as const;
const PREFERENCE_PREFIX = "smile.";

function deleteDatabase(name: string, factory: IDBFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${name}.`));
    // Another tab holds it open: deletion completes once that tab closes.
    request.onblocked = () => resolve();
  });
}

/** Cases, photos, results, library, validation scores and preferences. Sign-in is kept. */
export async function deleteAllLocalData(factory: IDBFactory = indexedDB, storage: Storage | null = globalThis.localStorage ?? null): Promise<void> {
  await Promise.all(LOCAL_DATABASES.map(name => deleteDatabase(name, factory)));
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFERENCE_PREFIX)) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
}

/** Delete every case (current case and saved visualisations with their photos). The case library is kept. */
export async function deleteAllCases(factory: IDBFactory = indexedDB): Promise<void> {
  await Promise.all(["smile-temporary-case", "smile-case-log"].map(name => deleteDatabase(name, factory)));
}
