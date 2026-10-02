/** Immutable leases: a delayed operation must never discover a different owner. */
export type WorkspaceOwner = { kind: "account"; userId: string } | { kind: "unowned" } | { kind: "demo" } | { kind: "legacy" };
export class WorkspaceChangedError extends Error {
  constructor() { super("The account changed. Reopen this action in your current workspace."); this.name = "WorkspaceChangedError"; }
}
export interface WorkspaceLease {
  readonly owner: WorkspaceOwner;
  readonly key: string;
  readonly epoch: number;
  readonly signal: AbortSignal;
  assert(): void;
}
const cleanups = new Set<() => void>();
export function onWorkspaceDetach(cleanup: () => void): () => void { cleanups.add(cleanup); return () => { cleanups.delete(cleanup); }; }
let epoch = 0;
let controller = new AbortController();
let owner: WorkspaceOwner = { kind: "unowned" };
function keyOf(value: WorkspaceOwner): string { return value.kind === "account" ? `account:${encodeURIComponent(value.userId)}` : value.kind; }
export function captureWorkspace(): WorkspaceLease {
  const capturedEpoch = epoch;
  const capturedOwner = owner;
  const signal = controller.signal;
  return { owner: capturedOwner, key: keyOf(capturedOwner), epoch: capturedEpoch, signal,
    assert() { if (signal.aborted || capturedEpoch !== epoch) throw new WorkspaceChangedError(); } };
}
/** Called synchronously by auth events, before React renders the incoming account. */
export function activateWorkspace(next: WorkspaceOwner): WorkspaceLease {
  if (keyOf(next) !== keyOf(owner)) {
    controller.abort(); epoch++; controller = new AbortController(); owner = next;
    for (const cleanup of cleanups) { try { cleanup(); } catch { /* An optional consumer cannot prevent detaching the workspace. */ } }
  }
  return captureWorkspace();
}
/** Explicit read-only legacy migration/test access. Never the default workspace. */
export function legacyWorkspace(): WorkspaceLease {
  const active = captureWorkspace();
  return { ...active, owner: { kind: "legacy" }, key: "legacy" };
}
export function workspaceDatabase(base: string, scope: WorkspaceLease): string {
  scope.assert();
  return scope.owner.kind === "legacy" ? base : `${base}:v1:${scope.key}`;
}
/** Guard both ends: stale reads are rejected even if their IDB transaction finished. */
export function guardStore<T extends Record<string, (...args: never[]) => Promise<unknown>>>(scope: WorkspaceLease, methods: T): T {
  return Object.fromEntries(Object.entries(methods).map(([name, fn]) => [name, async (...args: never[]) => {
    scope.assert(); const value = await fn(...args); scope.assert(); return value;
  }])) as T;
}
/** Reset/delete invalidates queued operations even when the account ID is unchanged. */
export function invalidateWorkspace(): void {
  controller.abort(); epoch++; controller = new AbortController();
  for (const cleanup of cleanups) { try { cleanup(); } catch { /* An optional consumer cannot prevent detaching the workspace. */ } }
}
