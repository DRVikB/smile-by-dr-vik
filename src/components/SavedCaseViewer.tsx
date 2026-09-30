"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { BrandLockup } from "./Brand";
import { AnalysisSymbol } from "@/components/icons/SmileIcons";
import type { CaseLogEntry, CaseLogMedia } from "@/lib/types";

/** View the saved pixels without replacing the active case or generating again. */
export function SavedCaseViewer({ entry, media, analysis: startWithAnalysis = false, onClose }: {
  entry: CaseLogEntry; media: CaseLogMedia; analysis?: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [analysis, setAnalysis] = useState(startWithAnalysis);
  const isDemo = Boolean(entry.testMode) || entry.mode === "mock";
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return <dialog ref={dialog} className="saved-case-viewer" aria-label={`Saved comparison: ${entry.patientName || "Unnamed"}`} onClick={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="saved-case-header">
      <BrandLockup inverse />
      <span className="saved-case-actions">
        <button className="analysis-chip saved-analysis-chip" aria-pressed={analysis} onClick={() => setAnalysis(v => !v)}><AnalysisSymbol size={18} />Smile analysis</button>
        <button className="icon-button" onClick={onClose} aria-label="Close saved comparison"><X size={22} /></button>
      </span>
    </header>
    <BeforeAfterSlider original={media.originalImage} preview={media.image} isMock={entry.mode === "mock"}
      previewLabel={isDemo ? "Demo preview" : "Saved · AI concept"} analysis={analysis} />
    <footer className="saved-case-caption">{entry.patientName || "Saved case"} · {entry.label || "Before & after"}</footer>
  </dialog>;
}
