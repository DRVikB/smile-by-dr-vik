"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { BrandLockup } from "./Brand";
import type { CaseLogEntry, CaseLogMedia } from "@/lib/types";

/** View the saved pixels without replacing the active case or generating again. */
export function SavedCaseViewer({ entry, media, onClose }: {
  entry: CaseLogEntry; media: CaseLogMedia; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return <dialog ref={dialog} className="saved-case-viewer" aria-label={`Saved comparison: ${entry.patientName || "Unnamed"}`} onClick={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="saved-case-header">
      <BrandLockup inverse />
      <button className="icon-button" onClick={onClose} aria-label="Close saved comparison"><X size={22} /></button>
    </header>
    <BeforeAfterSlider original={media.originalImage} preview={media.image} isMock={entry.mode === "mock"}
      previewLabel={entry.testMode || entry.mode === "mock" ? "Demo preview" : "Saved · AI concept"} />
    <footer className="saved-case-caption">{entry.patientName || "Saved case"} · {entry.label || "Before & after"}</footer>
  </dialog>;
}
