"use client";
import { useEffect, useRef, useState } from "react";
import type { ToothMapController } from "./useToothMap";

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE = 8;

/**
 * The tooth outlines over the patient's smile, in the photo's own pixels so
 * they zoom and pan with it. Unselected teeth: a quiet white line. Selected:
 * champagne with a faint fill. Tap toggles a tooth; press and hold opens its
 * own design controls. In edit mode a tap picks a tooth to correct, or, when
 * adding, places a new tooth.
 */
export function ToothMapOverlay({ controller, selectedTeeth, width, height, scale = 1 }: {
  controller: ToothMapController;
  selectedTeeth: number[];
  width: number;
  height: number;
  scale?: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [fit, setFit] = useState(0);
  const press = useRef<{ id: string; x: number; y: number; timer: number; long: boolean } | null>(null);

  // On-screen pixels per photo pixel (before zoom), so labels and lines keep a constant size.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => setFit(Math.min(el.clientWidth / width, el.clientHeight / height) || 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // The SVG only exists once there is a map: measure again when it appears.
  }, [width, height, Boolean(controller.map)]);

  const map = controller.map;
  if (!map) return null;
  const perPx = Math.max(1e-6, fit * scale);
  const selected = new Set(selectedTeeth);
  const px = (p: [number, number]) => `${p[0] * width},${p[1] * height}`;

  const end = (id: string, fdi: number | null, e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== id) return;
    window.clearTimeout(p.timer);
    if (p.long || Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) return;
    if (controller.editing || fdi === null) {
      // An unnumbered tooth can't be selected until it has a number: open it for correction.
      controller.setEditing(true);
      controller.setFocusedId(id);
    } else controller.toggle(fdi);
  };

  return (
    <svg ref={svg} className={`tooth-map-overlay${controller.editing ? " is-editing" : ""}${controller.adding ? " is-adding" : ""}`}
      viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Tooth map: tap a tooth to add or remove it"
      onClick={e => {
        if (!controller.adding || !svg.current) return;
        const point = svg.current.createSVGPoint();
        point.x = e.clientX; point.y = e.clientY;
        const local = point.matrixTransform(svg.current.getScreenCTM()?.inverse());
        controller.addToothAt([local.x / width, local.y / height]);
      }}>
      {controller.adding && <rect className="tooth-map-catch" x={0} y={0} width={width} height={height} />}
      {map.teeth.filter(t => t.visible).map(t => {
        const on = t.fdi !== null && selected.has(t.fdi);
        const focused = controller.focusedId === t.id;
        const review = t.requiresReview && !map.confirmedByClinician;
        const onScreenWidth = t.bbox.width * width * perPx;
        const label = t.fdi ?? "?";
        return (
          <g key={t.id} className={`tooth-region${on ? " is-selected" : ""}${focused ? " is-focused" : ""}${review ? " needs-review" : ""}`}>
            {/* Non-scaling strokes are already in screen pixels; only the zoom needs undoing. */}
            <polygon points={t.outline.map(px).join(" ")} strokeWidth={(on || focused ? 1.8 : 1.1) / Math.max(0.2, scale)} vectorEffect="non-scaling-stroke" data-own-taps=""
              role="button" tabIndex={0}
              aria-label={`Tooth ${label}${on ? ", selected" : ""}${review ? ", check this tooth" : ""}`}
              aria-pressed={on}
              onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && t.fdi !== null) { e.preventDefault(); controller.toggle(t.fdi); } }}
              onPointerDown={e => {
                if (controller.adding) return;
                const timer = window.setTimeout(() => {
                  if (!press.current) return;
                  press.current.long = true;
                  if (controller.editing) controller.setFocusedId(t.id);
                  else if (t.fdi !== null) controller.openControls(t.fdi);
                }, LONG_PRESS_MS);
                press.current = { id: t.id, x: e.clientX, y: e.clientY, timer, long: false };
              }}
              onPointerMove={e => {
                const p = press.current;
                if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) { window.clearTimeout(p.timer); press.current = null; }
              }}
              onPointerUp={e => end(t.id, t.fdi, e)}
              onPointerCancel={() => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; }}
              onContextMenu={e => e.preventDefault()} />
            {(on || focused || controller.editing || review) && onScreenWidth >= 10 && (
              <text x={t.centroid.x * width} y={t.bbox.y * height - 6 / perPx} fontSize={11 / perPx} textAnchor="middle">{label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
