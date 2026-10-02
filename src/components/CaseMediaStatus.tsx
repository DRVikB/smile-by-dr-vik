"use client";
import { Check, Cloud, LoaderCircle } from "lucide-react";
import type { CaseMediaStatus as Status } from "@/services/cases/sync/mediaStatus";

export function CaseMediaStatus({ status, onRetry, onSignIn }: { status: Status | null; onRetry: () => void; onSignIn?: () => void }) {
  const busy = !status || status.state === "DOWNLOADING" || status.state === "UPLOADING";
  return <div className="case-media-status" role="status" aria-live="polite">
    <span>{busy ? <LoaderCircle size={15} className="media-sync-spinner" aria-hidden="true" /> : status.state === "SYNCED" ? <Check size={15} aria-hidden="true" /> : <Cloud size={15} aria-hidden="true" />}
      {status?.label ?? "Opening case images…"}</span>
    {status?.detail && <small>{status.detail}</small>}
    {status?.state === "DOWNLOADING" && !!status.total && <progress value={status.completed} max={status.total} aria-label="Case images downloaded" />}
    {status?.retry && <button type="button" className="text-button" onClick={onRetry}>Retry</button>}
    {status?.needsSignIn && onSignIn && <button type="button" className="text-button" onClick={onSignIn}>Sign in</button>}
  </div>;
}
