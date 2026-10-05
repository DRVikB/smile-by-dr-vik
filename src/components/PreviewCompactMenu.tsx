"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  MessageSquareText,
  Maximize2,
  Pencil,
  Plus,
  Share2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AnalysisSymbol, VisualiseSymbol } from "@/components/icons/SmileIcons";
import { AI_CONCEPT_SUMMARY } from "@/lib/brand";
import type { CompareMode } from "./BeforeAfterSlider";

export function PreviewCompactMenu({
  mode,
  onModeChange,
  onConsult,
  analysisOn = false,
  onAnalysis,
  onReview,
  onAnother,
  onEdit,
  onShare,
  onNew,
  onGoals,
  preferred = false,
  onPreferred,
  anotherCost,
  busy,
}: {
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;
  onConsult: () => void;
  analysisOn?: boolean;
  onAnalysis: () => void;
  onReview: () => void;
  onAnother: () => void;
  onEdit: () => void;
  /** Share with patient. */
  onShare: () => void;
  onNew: () => void;
  /** Reopens the consultation (goals, preferred reason, next step) without leaving the result. */
  onGoals?: () => void;
  /** This version is the patient's preferred direction. */
  preferred?: boolean;
  /** Marks or unmarks this version as the patient's preferred: only ever by this deliberate action. */
  onPreferred?: () => void;
  anotherCost?: string;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  function closeMenu() {
    setOpen(false);
    optionsButton.current?.focus();
  }

  return (
    <>
      {open && (
        <button
          type="button"
          className="compact-options-backdrop"
          aria-label="Close preview options"
          onClick={closeMenu}
        />
      )}
      <div className="compact-preview-dock">
        {open && (
          <div
            className="compact-options-popover"
            role="dialog"
            aria-modal="true"
            aria-label="Preview options"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeMenu();
              }
              if (event.key === "Tab") {
                const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
                if (event.shiftKey && document.activeElement === buttons[0]) {
                  event.preventDefault();
                  buttons.at(-1)?.focus();
                } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
                  event.preventDefault();
                  buttons[0]?.focus();
                }
              }
            }}
          >
            <div className="compact-options-heading">
              <h2>Preview options</h2>
              <button ref={closeButton} type="button" aria-label="Close options" onClick={closeMenu}>
                <X size={18} />
              </button>
            </div>
            <div className="compact-options-group">
              <span className="compact-options-label">Compare</span>
              <div className="compact-compare-switch" role="group" aria-label="Comparison style">
                <button type="button" aria-pressed={mode === "slide"} onClick={() => onModeChange("slide")}>
                  Slide
                </button>
                <button type="button" aria-pressed={mode === "overlay"} onClick={() => onModeChange("overlay")}>
                  Overlay
                </button>
              </div>
              <button className="compact-option-row" type="button" onClick={() => choose(onConsult)}>
                <Maximize2 size={19} />
                <span>Consultation view</span>
              </button>
              <button className="compact-option-row" type="button" aria-pressed={analysisOn} onClick={() => choose(onAnalysis)}>
                <AnalysisSymbol size={20} />
                <span>{analysisOn ? "Hide smile analysis" : "Show smile analysis"}</span>
              </button>
            </div>
            {(onPreferred || onGoals) && <div className="compact-options-group">
              <span className="compact-options-label">Consultation</span>
              {onPreferred && <button className="compact-option-row" type="button" aria-pressed={preferred} onClick={() => choose(onPreferred)}>
                <CircleCheck size={19} />
                <span>{preferred ? "Patient’s preferred version" : "Patient prefers this version"}<small>{preferred ? "Tap to clear" : "Records their preferred direction for the report"}</small></span>
              </button>}
              {onGoals && <button className="compact-option-row" type="button" onClick={() => choose(onGoals)}>
                <MessageSquareText size={19} />
                <span>Goals &amp; next step</span>
              </button>}
            </div>}
            <div className="compact-options-group">
              <span className="compact-options-label">Refine &amp; continue</span>
              <button className="compact-option-row" type="button" onClick={() => choose(onReview)}>
                <SlidersHorizontal size={19} />
                <span>Review &amp; refine</span>
              </button>
              <button className="compact-option-row" type="button" disabled={busy} onClick={() => choose(onAnother)}>
                <VisualiseSymbol size={20} />
                <span>Three more options{anotherCost && <small>{anotherCost}</small>}</span>
              </button>
              <button className="compact-option-row" type="button" disabled={busy} onClick={() => choose(onEdit)}>
                <Pencil size={19} />
                <span>Edit smile design</span>
              </button>
              <button className="compact-option-row" type="button" disabled={busy} onClick={() => choose(onNew)}>
                <Plus size={19} />
                <span>Start New Design</span>
              </button>
            </div>
          </div>
        )}
        <button className="compact-dock-save" type="button" disabled={busy} onClick={() => choose(onShare)}>
          <Share2 size={19} strokeWidth={1.7} />
          Share
        </button>
        <button
          ref={optionsButton}
          className="compact-dock-options"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal size={19} strokeWidth={1.7} />
          Options
        </button>
        <p className="compact-concept-note">{AI_CONCEPT_SUMMARY}</p>
      </div>
    </>
  );
}
