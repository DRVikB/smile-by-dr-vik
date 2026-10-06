"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ToothShape } from "@/lib/types";
import { guideGeometry, normaliseGuide, SHAPE_STYLE, smoothPath, type SmileGuide } from "@/lib/smileDesign/frame";

/**
 * The smile guide over the patient's photo, in the photo's own pixels so it zooms
 * and pans with it: gum line (blue), biting-edge curve (orange), midline and tooth
 * divisions (green), and the six upper front teeth outlined in the chosen form.
 * The handle below the midline drags the whole guide; the change is saved when
 * the drag ends.
 */
export function SmileGuideOverlay({ guide, shape, width, height, scale = 1, onChange, pick, highlight }: {
  guide: SmileGuide;
  shape: ToothShape;
  width: number;
  height: number;
  scale?: number;
  onChange?: (guide: SmileGuide) => void;
  /** Choosing one tooth (Teeth step): each front tooth is outlined and tappable; its partner is dashed. */
  pick?: { selected: number; partner: number; label: (fdi: number) => string; onPick: (fdi: number) => void };
  /** Teeth step (4/6/8/10 or whitening): each front tooth outlined, the teeth being designed highlighted. Display only. */
  highlight?: number[];
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [fit, setFit] = useState(0);
  const [moving, setMoving] = useState<SmileGuide | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: SmileGuide } | null>(null);
  const shown = moving ?? guide;
  const g = useMemo(() => guideGeometry(shown, SHAPE_STYLE[shape]), [shown, shape]);

  // On-screen pixels per photo pixel (before zoom), so the handle keeps a constant size.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => setFit(Math.min(el.clientWidth / width, el.clientHeight / height) || 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height]);

  const perPx = Math.max(1e-6, fit * scale);
  const [hx, hy] = g.midline[1];

  if (highlight) {
    const on = new Set(highlight);
    return (
      <svg ref={svg} className="smile-guide-overlay is-picking is-highlight" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
        style={{ "--guide-zoom": Math.max(0.2, scale) } as React.CSSProperties} role="img"
        aria-label={`Upper front teeth: ${g.teeth.filter(t => on.has(t.fdi)).length} of ${g.teeth.length} highlighted for this design`}>
        {g.teeth.map(t => <path key={t.fdi} className={`smile-guide-pick${on.has(t.fdi) ? " is-selected" : ""}`} d={smoothPath(t.outline, true)} />)}
      </svg>
    );
  }

  if (pick) {
    const centre = (o: [number, number][]) => [o.reduce((s, p) => s + p[0], 0) / o.length, Math.min(...o.map(p => p[1]))] as const;
    return (
      <svg ref={svg} className="smile-guide-overlay is-picking" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
        style={{ "--guide-zoom": Math.max(0.2, scale) } as React.CSSProperties} role="group" aria-label="Upper front teeth: tap one to choose it">
        {g.teeth.map(t => {
          const state = t.fdi === pick.selected ? " is-selected" : t.fdi === pick.partner ? " is-partner" : "";
          return (
            <path key={t.fdi} className={`smile-guide-pick${state}`} d={smoothPath(t.outline, true)} data-own-taps=""
              role="button" aria-label={pick.label(t.fdi)} aria-pressed={t.fdi === pick.selected} onClick={() => pick.onPick(t.fdi)} />
          );
        })}
        {g.teeth.filter(t => t.fdi === pick.selected || t.fdi === pick.partner).map(t => {
          const [x, y] = centre(t.outline);
          return <text key={`l${t.fdi}`} className={`smile-guide-label${t.fdi === pick.selected ? " is-selected" : ""}`} x={x} y={y - 7 / perPx}
            fontSize={11 / perPx} textAnchor="middle" aria-hidden="true">{pick.label(t.fdi)}</text>;
        })}
      </svg>
    );
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    const unit = d.from.fit.halfWidth * perPx;
    setMoving(normaliseGuide({ ...d.from, dx: d.from.dx + (e.clientX - d.x) / unit, dy: d.from.dy + (e.clientY - d.y) / unit }) ?? null);
  }
  function end(e: React.PointerEvent) {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    e.stopPropagation();
    drag.current = null;
    if (moving) onChange?.(moving);
    setMoving(null);
  }

  return (
    <svg ref={svg} className={`smile-guide-overlay${moving ? " is-moving" : ""}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
      // Non-scaling strokes are in screen pixels before the zoom; the stylesheet divides by it.
      style={{ "--guide-zoom": Math.max(0.2, scale) } as React.CSSProperties}
      role="img" aria-label="Smile guide: gum line, biting-edge curve, midline and front tooth outlines">
      {guide.nasal?.map(([a, b], i) => <line key={`n${i}`} className="smile-guide-nasal" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />)}
      <g className="smile-guide-halo" aria-hidden="true">
        <path d={smoothPath(g.gum, false)} />
        <path d={smoothPath(g.edge, false)} />
        <line x1={g.midline[0][0]} y1={g.midline[0][1]} x2={g.midline[1][0]} y2={g.midline[1][1]} />
      </g>
      {g.teeth.map(t => <path key={t.fdi} className="smile-guide-tooth" d={smoothPath(t.outline, true)} />)}
      {g.divisions.map(([a, b], i) => <line key={i} className="smile-guide-division" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />)}
      <line className="smile-guide-midline" x1={g.midline[0][0]} y1={g.midline[0][1]} x2={g.midline[1][0]} y2={g.midline[1][1]} />
      <path className="smile-guide-gum" d={smoothPath(g.gum, false)} />
      <path className="smile-guide-edge" d={smoothPath(g.edge, false)} />
      {onChange && (
        <g className="smile-guide-handle" data-own-taps="" role="button" aria-label="Drag to move the smile guide"
          onPointerDown={e => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: guide };
          }}
          onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <circle cx={hx} cy={hy} r={22 / perPx} className="smile-guide-handle-hit" />
          <circle cx={hx} cy={hy} r={9 / perPx} className="smile-guide-handle-dot" />
        </g>
      )}
    </svg>
  );
}
