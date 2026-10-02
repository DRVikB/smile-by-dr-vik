"use client";
import { useEffect, useRef, useState } from "react";
import { Share2, X } from "lucide-react";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { CenteredBrandHeader } from "./ui/Surface";
import { AnalysisSymbol } from "@/components/icons/SmileIcons";
import { AI_CONCEPT_SUMMARY } from "@/lib/brand";
import { savedCaseExport } from "@/lib/savedCaseExport";
import { ShareSheet } from "./share/ShareSheet";
import { RevealVideoSheet } from "./RevealVideoSheet";
import type { CaseLogEntry, CaseLogMedia } from "@/lib/types";

/** View the saved pixels without replacing the active case or generating again. */
export function SavedCaseViewer({ entry, media, analysis: startWithAnalysis = false, onClose, onExported }: {
  entry: CaseLogEntry; media: CaseLogMedia; analysis?: boolean; onClose: () => void; onExported?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [analysis, setAnalysis] = useState(startWithAnalysis);
  const [sharing, setSharing] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const isDemo = Boolean(entry.testMode) || entry.mode === "mock";
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return <dialog ref={dialog} className="saved-case-viewer" aria-label={`Saved comparison: ${entry.patientName || "Unnamed"}`} onClick={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); if (sharing) { setSharing(false); onExported?.(); } else if (videoOpen) setVideoOpen(false); else onClose(); }}>
    <div className="saved-case-content" inert={sharing || videoOpen}>
      <CenteredBrandHeader
        className="saved-case-header"
        inverse
        right={<button className="icon-button" onClick={onClose} aria-label="Close saved comparison"><X size={22} /></button>}
      />
      <button className="analysis-chip saved-analysis-chip" aria-pressed={analysis} onClick={() => setAnalysis(v => !v)}><AnalysisSymbol size={18} />Smile analysis</button>
      <BeforeAfterSlider original={media.originalImage} preview={media.image} isMock={isDemo}
        previewLabel={isDemo ? "Demo preview" : "Saved · AI concept"} analysis={analysis} />
      <footer className="saved-case-footer">
        <span>{entry.patientName || "Saved case"} · {entry.label || "Before & after"}</span>
        <p>{isDemo ? "Demo concept · Sample imagery, not a patient result." : AI_CONCEPT_SUMMARY}</p>
        <button type="button" className="primary-button" onClick={() => setSharing(true)}><Share2 size={17} />Export &amp; share</button>
      </footer>
    </div>
    {sharing && <ShareSheet input={savedCaseExport(entry, media)} entryId={entry.id}
      onClose={() => { setSharing(false); onExported?.(); }}
      onRevealVideo={() => { setSharing(false); setVideoOpen(true); onExported?.(); }} />}
    {videoOpen && <RevealVideoSheet before={media.originalImage} after={media.image} isDemo={isDemo}
      patientName={entry.patientName} onClose={() => setVideoOpen(false)} />}
  </dialog>;
}
