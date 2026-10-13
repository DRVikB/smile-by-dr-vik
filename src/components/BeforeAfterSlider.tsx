"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GUIDE_DRAW_TOTAL, prefersReducedMotion, revealPosition, type RevealSpan } from "@/lib/motion";
import { useElapsed } from "@/lib/useElapsed";
import { crosses, haptic } from "@/native/haptics";
import { containedPhotoRect, edgeFadeMask, focusedPhotoRect, maskStyle } from "@/lib/photoViewport";
import { analysisRegion, smileRegion, type FocusSource } from "@/lib/photoFocus";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { ZoomPan } from "./ZoomPan";
import { AnalysisPanel, GuideLines, guidesPresent, useSmileGuides } from "./SmileGuides";
import type { GuideKey } from "@/lib/face/guides";
import { levelTransform } from "@/lib/face/level";
import { AI_CONCEPT_SUMMARY } from "@/lib/brand";

export type CompareMode = "slide" | "overlay";

/** Accessible description of the overlay mix. */
export function overlayValueText(opacity: number): string {
  return `AI illustration at ${opacity} percent over the original`;
}

/**
 * Two ways to compare: a slider that wipes between the photos, or the AI
 * illustration laid translucently over the patient's own teeth. A separate
 * visible opacity control stays usable while the photograph is zoomed.
 * With `analysis` on, the photograph fills the screen with the smile analysis
 * lines drawn on it: Before and After become a simple switch (no divider to
 * fight the lines), and one panel over the photograph holds the readings.
 * With `fill`, the photograph fills the screen around the smile (never
 * cropping into it), and one tap shows the whole photograph instead.
 * With `reveal`, a smile that has just been made is uncovered by the divider
 * crossing the photograph once; any other change of illustration eases in.
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
  reveal = false,
  onRevealed,
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
  /** The illustration has just been made: uncover it once, then call `onRevealed`. */
  reveal?: boolean;
  onRevealed?: () => void;
}) {
  // Found on the patient's own photo: the face they're measured against.
  const guides = useSmileGuides(original, analysis);
  // The lines draw themselves once each time they are found.
  const drawn = useElapsed(guides.status === "ready" ? guides.guides : null, GUIDE_DRAW_TOTAL);
  const [position, setPosition] = useState(50);
  // The divider's last place, and the stretch of the photograph on screen with the divider's resting place in it.
  const at = useRef(50);
  const span = useRef<RevealSpan>({ from: 100, to: 0, rest: 50 });
  const place = (next: number) => { at.current = next; setPosition(next); };
  // While a new smile is being uncovered the divider follows the reveal, not the hand.
  const [intro, setIntro] = useState<number | null>(null);
  const revealed = useRef(onRevealed);
  useEffect(() => { revealed.current = onRevealed; });
  // The illustration being replaced, kept on top for a moment while it fades away.
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const lastPreview = useRef(preview);
  const [opacity, setOpacity] = useState(50);
  const [localMode, setLocalMode] = useState<CompareMode>("slide");
  const mode = controlledMode ?? localMode;
  const changeMode = (next: CompareMode) => { setLocalMode(next); onModeChange?.(next); };
  const overlay = mode === "overlay";
  const root = useRef<HTMLDivElement>(null);
  const photoFrame = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ReturnType<typeof containedPhotoRect>>(null);
  const [wholePhoto, setWholePhoto] = useState(false);
  // Analysis always fills the screen around the face: its lines need the room.
  const filling = Boolean(fill) && (analysis || !wholePhoto);
  // Smile analysis: which photograph the lines are over, which lines are hidden, and whether the view is levelled.
  const [showing, setShowing] = useState<"before" | "after">("before");
  const [hidden, setHidden] = useState<ReadonlySet<GuideKey>>(new Set());
  const [levelled, setLevelled] = useState(false);
  const found = guides.status === "ready" ? guides.guides : null;
  const level = found ? levelTransform(found) : null;
  const toggleLine = (key: GuideKey) => setHidden(now => { const next = new Set(now); if (!next.delete(key)) next.add(key); return next; });
  const toggleAllLines = () => setHidden(now => found && guidesPresent(found).some(key => !now.has(key)) ? new Set(guidesPresent(found)) : new Set());
  const [handleTop, setHandleTop] = useState<number | null>(null);
  const [edgeMask, setEdgeMask] = useState<string | undefined>(undefined);
  // Until the divider is moved, it starts on the middle of the screen (the smile, when filling).
  const moved = useRef(false);
  const focusKey = fill ? JSON.stringify([smileRegion(fill), analysisRegion(fill)]) : "";
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const image = el.querySelector<HTMLImageElement>(".compare-image");
      const w = el.clientWidth, h = el.clientHeight, nw = image?.naturalWidth ?? 0, nh = image?.naturalHeight ?? 0;
      if (!filling) {
        setViewport(containedPhotoRect(w, h, nw, nh)); setHandleTop(null); setEdgeMask(undefined);
        span.current = { from: 100, to: 0, rest: 50 };
        if (!moved.current) place(50);
        return;
      }
      // The displayed image's own shape decides portrait or close-up: stored photo
      // dimensions can predate a rotation, and landmarks from another shape are ignored.
      const source = { ...fill, width: nw, height: nh };
      const smile = smileRegion(source);
      const rect = focusedPhotoRect(w, h, nw, nh, {
        region: analysis ? analysisRegion(source) : smile,
        // Portrait screens keep the smile a little above the actions. In analysis the eyes-to-chin
        // region sits clear of the panel: above it on a tall screen, to its right on a wide one.
        anchor: analysis ? (h > w ? { x: 0.5, y: Math.max(0.3, (h - 240) / (2 * h)) } : { x: 0.62, y: 0.5 }) : { x: 0.5, y: h > w ? 0.46 : 0.5 },
        maxCrop: 0.42,
      });
      setViewport(rect);
      // Where the filled photograph still stops short of the screen, its edges fade into the blurred copy.
      setEdgeMask(rect ? edgeFadeMask(rect, w, h, 0.1) : undefined);
      // The divider's handle sits below the lips, never over the teeth.
      if (rect) {
        const below = rect.top + (smile.y + smile.height) * rect.height + 56;
        // Clear of the action dock along the foot, even on a short landscape phone.
        setHandleTop(((Math.min(h * 0.74, h - 150, Math.max(h * 0.3, below)) - rect.top) / rect.height) * 100);
        const percent = (x: number) => Math.min(100, Math.max(0, ((x - rect.left) / rect.width) * 100));
        span.current = { from: percent(w), to: percent(0), rest: Math.round(percent(w / 2)) };
        if (!moved.current) place(span.current.rest);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("load", measure, true);
    return () => { observer.disconnect(); el.removeEventListener("load", measure, true); };
    // The focus data belongs to the photographs: it is read again when they (or the fit) change, and
    // when it arrives late (a face found after the photograph was first shown), so the framing never
    // waits for some unrelated event to catch up.
  }, [original, preview, filling, analysis, focusKey]);
  const ready = Boolean(viewport);
  useLayoutEffect(() => {
    if (!reveal || !ready) return;
    if (overlay || prefersReducedMotion()) { revealed.current?.(); return; }
    let frame = 0;
    const since = performance.now();
    const tick = () => {
      const next = revealPosition(performance.now() - since, span.current);
      setIntro(next);
      if (next === null) revealed.current?.(); else frame = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(frame); setIntro(null); };
  }, [reveal, ready, overlay]);
  useLayoutEffect(() => {
    const before = lastPreview.current;
    lastPreview.current = preview;
    // A reveal uncovers the new illustration itself.
    if (before === preview || reveal || prefersReducedMotion()) return;
    setOutgoing(before);
    const timer = window.setTimeout(() => setOutgoing(null), 520);
    return () => window.clearTimeout(timer);
    // Only a change of illustration starts it.
  }, [preview]);
  /** The hand takes the divider: a reveal in progress ends, and passing the resting place is felt. */
  const move = (next: number) => {
    if (reveal) revealed.current?.();
    moved.current = true;
    if (crosses(at.current, next, span.current.rest)) haptic("tick");
    place(next);
  };
  const shown = intro ?? position;
  const dragging = useRef<number | null>(null);
  // The divider's handle slides the comparison at any zoom level. Zoomed in,
  // dragging anywhere else pans the photo instead.
  const slideTo = (clientX: number) => {
    const box = photoFrame.current?.getBoundingClientRect();
    if (box?.width) move(Math.round(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100))));
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
          overlay={!overlay && !analysis ? <input
            type="range" min={0} max={100}
            value={Math.round(shown)}
            onChange={(e) => move(Number(e.target.value))}
            className="compare-input"
            aria-label="Before and after comparison"
            aria-valuetext={`${Math.round(shown)} percent original, ${100 - Math.round(shown)} percent smile preview`}
          /> : undefined}
        >
          {({ scale, x }) => analysis ? (
            // The view turns about the point between the eyes; the lines turn with the photograph.
            <div className="compare-level" style={level && levelled ? { transform: `rotate(${-level.degrees}deg) scale(${level.scale})`, transformOrigin: `${level.originX * 100}% ${level.originY * 100}%` } : undefined}>
              <img className="compare-image" src={original} alt="Original smile" />
              <img className={`compare-image compare-after${showing === "after" ? " is-showing" : ""}`} src={preview}
                alt={isMock ? "Illustrative demo concept" : "AI-generated smile concept"} aria-hidden={showing !== "after"} />
              {found && <GuideLines guides={found} scale={scale} elapsed={drawn} hidden={hidden} />}
            </div>
          ) : overlay ? (
            <>
              <img className="compare-image" src={original} alt="Original smile" />
              <img
                className="compare-image"
                src={preview}
                alt={isMock ? "Illustrative demo concept" : "AI illustration overlaid on the original"}
                style={{ opacity: opacity / 100 }}
              />
              {outgoing && <img className="compare-image compare-outgoing" src={outgoing} alt="" aria-hidden="true" style={{ "--from": opacity / 100 } as React.CSSProperties} />}
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
              {outgoing && <img className="compare-image compare-outgoing" src={outgoing} alt="" aria-hidden="true" />}
              <img
                className="compare-image original-image"
                src={original}
                alt="Original smile"
                style={{ clipPath: `inset(0 calc(${50 + (50 - shown) / scale}% + ${x / scale}px) 0 0)` }}
              />
            </>
          )}
        </ZoomPan>
      {!overlay && !analysis && viewport && (
        <div className="compare-divider" style={{ left: `${shown}%` }}>
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
      {!overlay && !analysis && <><span className="compare-label original-label">Before</span><span className="compare-label preview-label">{previewLabel}</span></>}
      {analysis ? (
        <div className="analysis-view" role="group" aria-label="Photograph shown" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-pressed={showing === "before"} onClick={() => setShowing("before")}>Before</button>
          <button type="button" aria-pressed={showing === "after"} onClick={() => setShowing("after")}>After</button>
        </div>
      ) : overlay ? (
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
      {!analysis && <div
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
      </div>}
      {fill && !analysis && (
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
      {analysis && <AnalysisPanel state={guides} elapsed={drawn} hidden={hidden} onToggle={toggleLine} onToggleAll={toggleAllLines}
        level={level ? { on: levelled } : null} onLevel={() => setLevelled(v => !v)} onHide={() => onHideAnalysis?.()}
        note={showing === "after" ? (isMock ? "Demo concept · Sample imagery, not a patient result." : AI_CONCEPT_SUMMARY) : undefined} />}
    </div>
  );
}
