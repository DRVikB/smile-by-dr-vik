"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ZoomPan } from "./ZoomPan";

export type CompareMode = "slide" | "overlay";

/** Accessible description of the overlay mix. */
export function overlayValueText(opacity: number): string {
  return `AI illustration at ${opacity} percent over the original`;
}

/**
 * Two ways to compare: a slider that wipes between the photos, or the AI
 * illustration laid translucently over the patient's own teeth — the same
 * drag sets how strongly it shows, so small changes in edge position, length
 * and width can be read against what's there today.
 */
export function BeforeAfterSlider({
  original,
  preview,
  isMock,
  previewLabel = "AI illustration",
}: {
  original: string;
  preview: string;
  isMock: boolean;
  previewLabel?: string;
}) {
  const [position, setPosition] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const [mode, setMode] = useState<CompareMode>("slide");
  const overlay = mode === "overlay";
  return (
    <div className={`comparison${overlay ? " comparison-overlay" : ""}`}>
      <img className="photo-backdrop" src={original} alt="" aria-hidden="true" />
      <div className="compare-frame">
        <ZoomPan
          className="comparison-zoom"
          label={overlay ? "Pinch to zoom · drag to fade" : "Pinch to zoom · drag to compare"}
        >
          {overlay ? (
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
                style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
              />
              <span className="compare-label original-label">Original</span>
              <span className="compare-label preview-label">{previewLabel}</span>
            </>
          )}
        </ZoomPan>
      </div>
      <div className="compare-vignette" aria-hidden="true" />
      {overlay ? (
        <span className="compare-label overlay-readout" aria-hidden="true">
          Overlay {opacity}%
        </span>
      ) : (
        <div className="compare-divider" style={{ left: `${position}%` }}>
          <span className="compare-handle">
            <ChevronLeft size={17} />
            <ChevronRight size={17} />
          </span>
        </div>
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={overlay ? opacity : position}
        onChange={(e) =>
          overlay ? setOpacity(Number(e.target.value)) : setPosition(Number(e.target.value))
        }
        className="compare-input"
        aria-label={overlay ? "AI illustration overlay strength" : "Before and after comparison"}
        aria-valuetext={
          overlay
            ? overlayValueText(opacity)
            : `${position} percent original, ${100 - position} percent smile preview`
        }
      />
      <div
        className="compare-mode"
        role="group"
        aria-label="Comparison style"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" aria-pressed={!overlay} onClick={() => setMode("slide")}>
          Slide
        </button>
        <button type="button" aria-pressed={overlay} onClick={() => setMode("overlay")}>
          Overlay
        </button>
      </div>
      {isMock && (
        <div className="demo-image-label">DEMO · ORIGINAL PHOTO UNCHANGED</div>
      )}
    </div>
  );
}
