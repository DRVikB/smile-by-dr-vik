"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { ZoomPan } from "./ZoomPan";

export type CompareMode = "slide" | "overlay";

/** Accessible description of the overlay mix. */
export function overlayValueText(opacity: number): string {
  return `AI illustration at ${opacity} percent over the original`;
}

/**
 * Two ways to compare: a slider that wipes between the photos, or the AI
 * illustration laid translucently over the patient's own teeth. A separate
 * visible opacity control stays usable while the photograph is zoomed.
 */
export function BeforeAfterSlider({
  original,
  preview,
  isMock,
  previewLabel = "After · Concept",
  mode: controlledMode,
  onModeChange,
}: {
  original: string;
  preview: string;
  isMock: boolean;
  previewLabel?: string;
  mode?: CompareMode;
  onModeChange?: (mode: CompareMode) => void;
}) {
  const [position, setPosition] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const [localMode, setLocalMode] = useState<CompareMode>("slide");
  const mode = controlledMode ?? localMode;
  const changeMode = (next: CompareMode) => { setLocalMode(next); onModeChange?.(next); };
  const overlay = mode === "overlay";
  return (
    <div className={`comparison${overlay ? " comparison-overlay" : ""}`}>
      <img className="photo-backdrop" src={original} alt="" aria-hidden="true" />
      <div className="compare-frame">
        <ZoomPan
          className="comparison-zoom"
          resetKey={preview}
          label={overlay ? "Pinch to zoom · use slider to blend" : "Pinch to zoom · drag to compare"}
          overlay={!overlay ? <input
            type="range" min={0} max={100}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className="compare-input"
            aria-label="Before and after comparison"
            aria-valuetext={`${position} percent original, ${100 - position} percent smile preview`}
          /> : undefined}
        >
          {({ scale, x }) => overlay ? (
            <>
              <img className="compare-image" src={original} alt="Original smile" />
              <img
                className="compare-image"
                src={preview}
                alt={isMock ? "Demo preview — original photograph unchanged" : "AI illustration overlaid on the original"}
                style={{ opacity: opacity / 100 }}
              />
            </>
          ) : (
            <>
              <img
                className="compare-image"
                src={preview}
                alt={
                  isMock
                    ? "Demo preview — original photograph unchanged"
                    : "Generated smile preview"
                }
              />
              <img
                className="compare-image original-image"
                src={original}
                alt="Original smile"
                style={{ clipPath: `inset(0 calc(${50 + (50 - position) / scale}% + ${x / scale}px) 0 0)` }}
              />
            </>
          )}
        </ZoomPan>
      </div>
      <div className="compare-vignette" aria-hidden="true" />
      {!overlay && <><span className="compare-label original-label">Before</span><span className="compare-label preview-label">{previewLabel}</span></>}
      {overlay ? (
        <div className="compare-label overlay-readout overlay-controls" role="group" aria-label="Overlay strength">
          <button type="button" aria-label="Decrease overlay strength" disabled={opacity === 0} onClick={() => setOpacity(v => Math.max(0, v - 10))}><Minus size={18} /></button>
          <input type="range" min={0} max={100} step={1} value={opacity}
            onChange={e => setOpacity(Number(e.target.value))}
            aria-label="AI illustration overlay strength" aria-valuetext={overlayValueText(opacity)} />
          <button type="button" aria-label="Increase overlay strength" disabled={opacity === 100} onClick={() => setOpacity(v => Math.min(100, v + 10))}><Plus size={18} /></button>
          <span className="overlay-percentage" aria-hidden="true">{opacity}%</span>
        </div>
      ) : (
        <div className="compare-divider" style={{ left: `${position}%` }}>
          <span className="compare-handle">
            <ChevronLeft size={17} />
            <ChevronRight size={17} />
          </span>
        </div>
      )}
      <div
        className="compare-mode"
        role="group"
        aria-label="Comparison style"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" aria-pressed={!overlay} onClick={() => changeMode("slide")}>
          Slide
        </button>
        <button type="button" aria-pressed={overlay} onClick={() => changeMode("overlay")}>
          Overlay
        </button>
      </div>
      {isMock && (
        <div className="demo-image-label">DEMO · ORIGINAL PHOTO UNCHANGED</div>
      )}
    </div>
  );
}
