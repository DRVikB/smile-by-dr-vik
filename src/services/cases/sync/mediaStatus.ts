import type { LocalAsset, LocalPatientCase, OutboxOperation } from "./localStore";

export type CaseMediaState = "LOCAL" | "PENDING_UPLOAD" | "UPLOADING" | "SYNCED" | "CLOUD_ONLY" | "DOWNLOADING" | "OFFLINE" | "SYNC_FAILED" | "CONFLICT" | "MISSING";
export interface CaseMediaStatus {
  state: CaseMediaState;
  label: string;
  detail?: string;
  available: boolean;
  retry: boolean;
  needsSignIn?: boolean;
  completed?: number;
  total?: number;
}
export interface MediaTransfers {
  uploading: string[];
  downloading: string[];
  failures: Record<string, "missing" | "download" | "pending" | "auth">;
}

/** A UI projection of the existing cache/outbox, never a second persisted sync state. */
export function caseMediaStatus({ record, assets, operations, required, localAvailable = false, online = true, transfers }: {
  record?: LocalPatientCase;
  assets: LocalAsset[];
  operations: OutboxOperation[];
  required: string[];
  localAvailable?: boolean;
  online?: boolean;
  transfers: MediaTransfers;
}): CaseMediaStatus {
  const cached = required.filter(id => assets.some(a => a.id === id && a.blob)).length;
  const available = localAvailable || (required.length > 0 && cached === required.length);
  const ops = operations.filter(o => o.caseId === record?.id);
  const failed = required.map(id => transfers.failures[id]);
  const base = { available, retry: false };
  if (!available && (record?.deletedAt || failed.includes("missing"))) return { ...base, state: "MISSING", label: "Media unavailable", detail: "One or more case images could not be found in your account or on this device." };
  if (!available && required.some(id => transfers.downloading.includes(id))) return { ...base, state: "DOWNLOADING", label: "Downloading images…", detail: "Downloading case images…", completed: cached, total: required.length };
  if (record?.status === "conflict") return { ...base, state: "CONFLICT", label: "Needs review", detail: "This case changed on another device. Your local work is kept." };
  if (!online && (!available || ops.length > 0)) return { ...base, state: "OFFLINE", label: available ? "Saved locally · will sync when online" : "Offline · images saved to your account", detail: available ? undefined : "Connect to download the case images.", retry: !available };
  if (!available && failed.includes("auth")) return { ...base, state: "SYNC_FAILED", label: "Sign in to download images", detail: "Your session has expired. Sign in again to open the images saved to your account.", needsSignIn: true };
  if (!available && failed.includes("download")) return { ...base, state: "SYNC_FAILED", label: "Couldn't download images", detail: "Couldn't download the case images.", retry: true };
  if (ops.some(o => o.error)) return { ...base, state: "SYNC_FAILED", label: "Sync failed", detail: available ? "Your images are available on this device." : "Couldn't sync this case.", retry: true };
  if (ops.length || record?.status === "pending") {
    const uploading = ops.some(o => transfers.uploading.includes(o.id));
    return { ...base, state: uploading ? "UPLOADING" : "PENDING_UPLOAD", label: uploading ? "Uploading…" : "Waiting to sync" };
  }
  if (available) return { ...base, state: record?.status === "synced" ? "SYNCED" : "LOCAL", label: record?.status === "synced" ? "Synced" : "Saved on this device" };
  if (required.length || failed.includes("pending")) return { ...base, state: "CLOUD_ONLY", label: "Saved to your account", detail: failed.includes("pending") ? "Images are still syncing from another device. Try again shortly." : undefined, retry: failed.includes("pending") };
  return { ...base, state: "MISSING", label: "Media unavailable", detail: "Case images are unavailable. No saved image references were found for this version." };
}
