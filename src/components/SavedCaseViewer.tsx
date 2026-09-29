"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { BrandLockup } from "./Brand";
import { SmileAnalysisPanel } from "./SmileAnalysis";
import { AnalysisSymbol } from "@/components/icons/SmileIcons";
import type { CaseLogEntry, CaseLogMedia } from "@/lib/types";

/** View the saved pixels without replacing the active case or generating again. */
export function SavedCaseViewer({ entry, media, onClose }: {
  entry: CaseLogEntry; media: CaseLogMedia; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [analysing, setAnalysing] = useState(false);
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
        <button className="analysis-chip saved-analysis-chip" onClick={() => setAnalysing(true)}><AnalysisSymbol size={18} />Smile analysis</button>
        <button className="icon-button" onClick={onClose} aria-label="Close saved comparison"><X size={22} /></button>
      </span>
    </header>
    <BeforeAfterSlider original={media.originalImage} preview={media.image} isMock={entry.mode === "mock"}
      previewLabel={isDemo ? "Demo preview" : "Saved · AI concept"} />
    <footer className="saved-case-caption">{entry.patientName || "Saved case"} · {entry.label || "Before & after"}</footer>
    {/* Inside the dialog, so it sits above the full-screen comparison. */}
    {analysing && (
      <div className="sheet-backdrop analysis-backdrop" role="dialog" aria-modal="true" aria-label="Smile analysis" onClick={() => setAnalysing(false)}>
        <div className="sheet analysis-sheet" onClick={(e) => e.stopPropagation()}>
          <SmileAnalysisPanel before={media.originalImage} after={media.image} isDemo={isDemo} patientName={entry.patientName} onClose={() => setAnalysing(false)} />
        </div>
      </div>
    )}
  </dialog>;
}
