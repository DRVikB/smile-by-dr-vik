"use client";
import { useEffect, useRef, useState } from "react";
import { containedPhotoRect, edgeFadeMask, focusedPhotoRect, maskStyle } from "@/lib/photoViewport";
import { analysisRegion, smileRegion, type FocusSource } from "@/lib/photoFocus";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { ZoomPan } from "./ZoomPan";
import { GuideKey, GuideLines, useSmileGuides } from "./SmileGuides";

export type CompareMode = "slide" | "overlay";

/** Accessible description of the overlay mix. */
export function overlayValueText(opacity: number): string {
  return `AI illustration at ${opacity} percent over the original`;
}

/**
 * Two ways to compare: a slider that wipes between the photos, or the AI
 * illustration laid translucently over the patient's own teeth. A separate
 * visible opacity control stays usable while the photograph is zoomed.
 * With `analysis` on, the smile analysis lines are drawn on the photograph.
 * With `fill`, the photograph fills the screen around the smile (never
 * cropping into it), and one tap shows the whole photograph instead.
 */
export function BeforeAfterSlider({
  original,
  preview,
  isMock,
  previewLabel = "After · AI concept",
  mode: controlledMode,
  onModeChange,
  analysis = false,
  onHideAnalysis,
  fill,
}: {
  original: string;
  preview: string;
  isMock: boolean;
  previewLabel?: string;
  mode?: CompareMode;
  onModeChange?: (mode: CompareMode) => void;
  analysis?: boolean;
  onHideAnalysis?: () => void;
  fill?: FocusSource;
}) {
  // Found on the patient's own photo: the face they're measured against.
  const guides = useSmileGuides(original, analysis);
  const [position, setPosition] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const [localMode, setLocalMode] = useState<CompareMode>("slide");
  const mode = controlledMode ?? localMode;
  const changeMode = (next: CompareMode) => { setLocalMode(next); onModeChange?.(next); };
  const overlay = mode === "overlay";
  const root = useRef<HTMLDivElement>(null);
  const photoFrame = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ReturnType<typeof containedPhotoRect>>(null);
  const [wholePhoto, setWholePhoto] = useState(false);
  const filling = Boolean(fill) && !wholePhoto;
  const [handleTop, setHandleTop] = useState<number | null>(null);
  const [edgeMask, setEdgeMask] = useState<string | undefined>(undefined);
  // Until the divider is moved, it starts on the middle of the screen (the smile, when filling).
  const moved = useRef(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const image = el.querySelector<HTMLImageElement>(".compare-image");
      const w = el.clientWidth, h = el.clientHeight, nw = image?.naturalWidth ?? 0, nh = image?.naturalHeight ?? 0;
      if (!filling) {
        setViewport(containedPhotoRect(w, h, nw, nh)); setHandleTop(null); setEdgeMask(undefined);
        if (!moved.current) setPosition(50);
        return;
      }
      const source = { ...fill, width: fill?.width || nw, height: fill?.height || nh };
      const smile = smileRegion(source);
      const rect = focusedPhotoRect(w, h, nw, nh, {
        region: analysis ? analysisRegion(source) : smile,
        // Portrait screens keep the smile a little above the actions; analysis keeps more of the face.
        anchor: { x: 0.5, y: h > w ? 0.46 : 0.5 },
        maxCrop: analysis ? 0.2 : 0.4,
      });
      setViewport(rect);
      // Where the filled photograph still stops short of the screen, its edges fade into the blurred copy.
      setEdgeMask(rect ? edgeFadeMask(rect, w, h, 0.1) : undefined);
      // The divider's handle sits below the lips, never over the teeth.
      if (rect) {
        const below = rect.top + (smile.y + smile.height) * rect.height + 56;
        // Clear of the action dock along the foot, even on a short landscape phone.
        setHandleTop(((Math.min(h * 0.74, h - 150, Math.max(h * 0.3, below)) - rect.top) / rect.height) * 100);
        if (!moved.current) setPosition(Math.round(Math.min(100, Math.max(0, ((w / 2 - rect.left) / rect.width) * 100))));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("load", measure, true);
    return () => { observer.disconnect(); el.removeEventListener("load", measure, true); };
    // The focus data belongs to the photographs, so it is read again when they (or the fit) change.
  }, [original, preview, filling, analysis]);
  const dragging = useRef<number | null>(null);
  // The divider's handle slides the comparison at any zoom level. Zoomed in,
  // dragging anywhere else pans the photo instead.
  const slideTo = (clientX: number) => {
    const box = photoFrame.current?.getBoundingClientRect();
    if (box?.width) { moved.current = true; setPosition(Math.round(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)))); }
  };
  return (
    <div className={`comparison${overlay ? " comparison-overlay" : ""}${analysis ? " has-guides" : ""}${filling ? " is-filled" : ""}`}>
      <div ref={root} className="compare-canvas">
      <img className="photo-backdrop" src={original} alt="" aria-hidden="true" />
      <div ref={photoFrame} className="compare-frame" style={viewport ? { inset: "auto", ...viewport, overflow: "hidden", ...maskStyle(edgeMask) } : { visibility: "hidden" }}>
        <ZoomPan
          className="comparison-zoom"
          resetKey={`${preview}|${filling}`}
          label=""
          overlay={!overlay ? <input
            type="range" min={0} max={100}
            value={position}
            onChange={(e) => { moved.current = true; setPosition(Number(e.target.value)); }}
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
                alt={isMock ? "Illustrative demo concept" : "AI illustration overlaid on the original"}
                style={{ opacity: opacity / 100 }}
              />
              {guides.status === "ready" && <GuideLines guides={guides.guides} scale={scale} />}
            </>
          ) : (
            <>
              <img
                className="compare-image"
                src={preview}
                alt={
                  isMock
                    ? "Illustrative demo concept"
                    : "AI-generated smile concept"
                }
              />
              <img
                className="compare-image original-image"
                src={original}
                alt="Original smile"
                style={{ clipPath: `inset(0 calc(${50 + (50 - position) / scale}% + ${x / scale}px) 0 0)` }}
              />
              {guides.status === "ready" && <GuideLines guides={guides.guides} scale={scale} />}
            </>
          )}
        </ZoomPan>
      {!overlay && viewport && (
        <div className="compare-divider" style={{ left: `${position}%` }}>
          <span
            className="compare-grab"
            aria-hidden="true"
            onPointerDown={(e) => {
              e.stopPropagation();
              dragging.current = e.pointerId;
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* moves still arrive over the handle */ }
            }}
            onPointerMove={(e) => { if (dragging.current === e.pointerId) slideTo(e.clientX); }}
            onPointerUp={() => { dragging.current = null; }}
            onPointerCancel={() => { dragging.current = null; }}
          />
          <span className="compare-handle" style={handleTop === null ? undefined : { top: `${handleTop}%` }}>
            <ChevronLeft size={17} />
            <ChevronRight size={17} />
          </span>
        </div>
      )}
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
        null
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
      {fill && (
        <button type="button" className="compare-fit" onPointerDown={(e) => e.stopPropagation()} onClick={() => setWholePhoto(v => !v)}
          aria-label={wholePhoto ? "Fill the screen around the smile" : "Show the whole photograph"}>
          {wholePhoto ? <Maximize2 size={14} aria-hidden="true" /> : <Minimize2 size={14} aria-hidden="true" />}
          <span>{wholePhoto ? "Fill screen" : "Whole photo"}</span>
        </button>
      )}
      {isMock && (
        <div className="demo-image-label">DEMO · ORIGINAL PHOTO UNCHANGED</div>
      )}
      </div>
      {analysis && <GuideKey state={guides} onHide={() => onHideAnalysis?.()} />}
    </div>
  );
}
