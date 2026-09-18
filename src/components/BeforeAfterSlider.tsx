"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ZoomPan } from "./ZoomPan";
export function BeforeAfterSlider({
  original,
  preview,
  isMock,
  previewLabel = "Smile Preview",
}: {
  original: string;
  preview: string;
  isMock: boolean;
  previewLabel?: string;
}) {
  const [position, setPosition] = useState(50);
  return (
    <div className="comparison">
      <ZoomPan className="comparison-zoom" label="Pinch to zoom · drag to compare">
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
      </ZoomPan>
      <div className="compare-divider" style={{ left: `${position}%` }}>
        <span className="compare-handle">
          <ChevronLeft size={17} />
          <ChevronRight size={17} />
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="compare-input"
        aria-label="Before and after comparison"
        aria-valuetext={`${position} percent original, ${100 - position} percent smile preview`}
      />
      {isMock && (
        <div className="demo-image-label">DEMO · ORIGINAL PHOTO UNCHANGED</div>
      )}
    </div>
  );
}
