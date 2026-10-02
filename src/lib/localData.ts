import { captureWorkspace, invalidateWorkspace, workspaceDatabase, type WorkspaceLease } from "./workspace";
/** Original databases are explicitly legacy/unowned; never read as an account's cache. */
export const LOCAL_DATABASES = ["smile-temporary-case", "smile-case-log", "smile-case-library", "smile-validation", "smile-patient-sync"] as const;
/** A blocked request remains pending. onversionchange on our connections releases it. */
export function deleteDatabase(name: string, factory: IDBFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${name}.`));
    request.onblocked = () => { /* Wait for onsuccess/onerror, never claim deletion. */ };
  });
}
export async function deleteWorkspaceData(scope: WorkspaceLease, factory: IDBFactory = indexedDB): Promise<void> {
  const names = LOCAL_DATABASES.map(name => workspaceDatabase(name, scope));
  invalidateWorkspace();
  await Promise.all(names.map(name => deleteDatabase(name, factory)));
}
/** Explicit device-wide erase includes other accounts and unowned cases, never auth. */
export async function deleteAllLocalData(factory: IDBFactory = indexedDB, storage: Storage | null = globalThis.localStorage ?? null, scope = captureWorkspace()): Promise<void> {
  // The database inventory is available in Safari/iPadOS and modern WebViews.
  // If unavailable, fail visibly rather than claim a complete multi-account erase.
  if (typeof factory.databases !== "function") throw new Error("This browser cannot list device databases. Delete cases from each account instead.");
  scope.assert();
  const inventory = await factory.databases();
  scope.assert();
  const names = new Set<string>([...LOCAL_DATABASES, ...LOCAL_DATABASES.map(base => workspaceDatabase(base, scope))]);
  invalidateWorkspace();
  for (const db of inventory) if (db.name && LOCAL_DATABASES.some(base => db.name === base || db.name?.startsWith(`${base}:v1:`))) names.add(db.name);
  await Promise.all([...names].map(name => deleteDatabase(name, factory)));
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith("smile.")) keys.push(key); }
  keys.forEach(key => storage.removeItem(key));
}
/** Only this workspace's cases/draft. Other accounts and references are kept. */
export async function deleteAllCases(factory: IDBFactory = indexedDB, scope = captureWorkspace()): Promise<void> {
  const names = ["smile-temporary-case", "smile-case-log", "smile-patient-sync"].map(name => workspaceDatabase(name, scope));
  invalidateWorkspace();
  await Promise.all(names.map(name => deleteDatabase(name, factory)));
}
