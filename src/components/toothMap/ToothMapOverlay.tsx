"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toothShapes } from "@/lib/toothMap/outline";
import { fitSmileTemplate } from "@/lib/toothMap/template";
import type { SmileSettings } from "@/lib/types";
import type { ToothMapController } from "./useToothMap";
import { hitTarget, nearestHit, type ToothHitTarget } from "@/lib/toothMap/hitTargets";

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE = 8;

/**
 * The tooth map over the patient's smile, in the photo's own pixels so it
 * zooms and pans with it.
 *
 * What is seen is a smile design template fitted to this smile (midline,
 * arc, the centrals' size, the chosen tooth form), clipped behind the lips:
 *   select  every tooth numbered and tappable; selected teeth champagne
 *   single  the one selected tooth outlined and numbered; the others faint
 *   design  thin ivory template only
 * with the smile arc and midline in single and design modes, and width boxes
 * with long axes when Proportion guides is on. Reviewing the map shows the
 * detected areas instead, because edits are limited to those. In hidden mode
 * nothing is drawn and the photo pans and zooms as normal.
 */
export function ToothMapOverlay({ controller, settings, width, height, scale = 1 }: {
  controller: ToothMapController;
  settings: SmileSettings;
  width: number;
  height: number;
  scale?: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const clipId = `tooth-lip-${useId().replace(/:/g, "")}`;
  const [fit, setFit] = useState(0);
  const press = useRef<{ key: string; x: number; y: number; timer: number; long: boolean } | null>(null);
  const { map, mode, guides } = controller;
  const visible = controller.adding || (mode !== "hidden" && Boolean(map));
  const reviewing = controller.editing || controller.adding;
  const selectedTeeth = settings.selectedTeeth;

  // On-screen pixels per photo pixel (before zoom), so labels keep a constant size.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => setFit(Math.min(el.clientWidth / width, el.clientHeight / height) || 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // The SVG only exists while something is drawn: measure again when it appears.
  }, [width, height, visible]);

  const detected = useMemo(() => (reviewing || mode === "single" ? toothShapes(map, width, height, selectedTeeth) : []), [reviewing, mode, map, width, height, selectedTeeth]);
  const template = useMemo(
    () => (reviewing ? null : fitSmileTemplate(map, width, height, { settings, proportion: guides.proportion })),
    [reviewing, map, width, height, settings, guides.proportion],
  );

  // A photo change/unmount must not leave a long-press acting on the old tooth.
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; }, [map?.photoId, mode]);

  if (!visible) return null;
  const perPx = Math.max(1e-6, fit * scale);
  // Non-scaling strokes are already in screen pixels; only the zoom needs undoing.
  const line = (px: number) => px / Math.max(0.2, scale);
  const selected = new Set(selectedTeeth);

  const hits:ToothHitTarget[] = (reviewing || mode === "single"
    ? detected.filter(t => reviewing || t.selected).map(t => ({key:t.id, fdi:t.fdi, regionId:t.id,x:t.centroid[0]-t.width/2,y:t.top,width:t.width,height:t.height}))
    : (template?.teeth.filter(t=>t.mapped&&mode==="select")??[]).map(t=>({key:`t${t.fdi}`,fdi:t.fdi,x:t.cx-t.width/2,y:t.incisalY-t.height,width:t.width,height:t.height})))
    .map(t=>hitTarget(t,perPx));
  const pointerHit=(e:React.PointerEvent)=>{
    const matrix=svg.current?.getScreenCTM();if(!matrix||!svg.current)return;
    const p=svg.current.createSVGPoint();p.x=e.clientX;p.y=e.clientY;
    const local=p.matrixTransform(matrix.inverse());return nearestHit(hits,local.x,local.y);
  };
  const hitLayer=()=> <g className="tooth-hit-targets">{hits.map(t=><rect key={t.key} x={t.x} y={t.y} width={t.width} height={t.height} fill="transparent" pointerEvents="all" {...handlers(t.key,t.fdi,t.regionId)} />)}</g>;

  /** Tap: toggle (select), open its controls (single), or correct it (review). */
  const handlers = (key: string, fdi: number | null, regionId?: string) => ({
    "data-own-taps": "",
    onPointerDown: (e: React.PointerEvent) => {
      if (controller.adding || controller.drawingId) return;
      const hit=pointerHit(e);
      const activeKey=hit?.key??key, activeFdi=hit?.fdi??fdi, activeRegion=hit?.regionId??regionId;
      const timer = window.setTimeout(() => {
        if (!press.current) return;
        press.current.long = true;
        if (reviewing && activeRegion) controller.setFocusedId(activeRegion);
        else if (activeFdi !== null) controller.openControls(activeFdi);
      }, LONG_PRESS_MS);
      press.current = { key: activeKey, x: e.clientX, y: e.clientY, timer, long: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) { window.clearTimeout(p.timer); press.current = null; }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      const hit=hits.find(t=>t.key===p.key);
      const activeFdi=hit?.fdi??fdi, activeRegion=hit?.regionId??regionId;
      window.clearTimeout(p.timer);
      if (p.long || Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) return;
      if (reviewing && activeRegion) { controller.setFocusedId(activeRegion); return; }
      if (activeFdi === null) return;
      if (mode === "single") controller.openControls(activeFdi); else controller.toggle(activeFdi);
    },
    onPointerCancel: () => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && (fdi !== null || (reviewing && regionId))) {
        e.preventDefault();
        if(reviewing && regionId) controller.setFocusedId(regionId);
        else if (fdi !== null) { if (mode === "single") controller.openControls(fdi); else controller.toggle(fdi); }
      }
    },
  });

  const onAdd = (e: React.MouseEvent) => {
    if ((!controller.adding && !controller.drawingId) || !svg.current) return;
    const point = svg.current.createSVGPoint();
    point.x = e.clientX; point.y = e.clientY;
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return;
    const local = point.matrixTransform(matrix.inverse());
    const position: [number, number] = [local.x / width, local.y / height];
    if (controller.drawingId) controller.addBoundaryPoint(position);
    else controller.addToothAt(position);
  };

  if (reviewing || mode === "single") {
    // The detected areas: exactly where edits are allowed, so the numbers can be checked.
    return (
      <svg ref={svg} className={`tooth-map-overlay is-${reviewing ? "select is-review" : "single"}${controller.adding || controller.drawingId ? " is-adding" : ""}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={reviewing ? "Detected teeth: tap one to correct it" : "Selected tooth: actual edit boundary"} onClick={onAdd}
        onPointerDown={e => { if (controller.adding || controller.drawingId) e.stopPropagation(); }}>
        {(controller.adding || controller.drawingId) && <rect className="tooth-map-catch" data-own-taps="" x={0} y={0} width={width} height={height} />}
        {detected.filter(t => reviewing || t.selected).map(t => {
          const focused = controller.focusedId === t.id;
          return (
            <g key={t.id} className={`tooth-region${t.selected ? " is-selected" : ""}${focused ? " is-focused" : ""}${t.requiresReview ? " needs-review" : ""}`}>
              <path d={map?.teeth.find(r => r.id === t.id)?.outline.map(([x, y], i) => `${i ? "L" : "M"}${x * width} ${y * height}`).join(" ") + " Z"} vectorEffect="non-scaling-stroke" strokeWidth={line(t.selected || focused ? 1.6 : 1)} className="is-tappable" role="button" tabIndex={0}
                aria-label={`Detected tooth ${t.fdi ?? "unnumbered"}${t.requiresReview ? ", check this tooth" : ""}`} {...handlers(t.id, t.fdi, t.id)} />
              {t.width * perPx >= 10 && <text x={t.centroid[0]} y={t.top - 7 / perPx} fontSize={10.5 / perPx} textAnchor="middle">{t.fdi ?? "?"}</text>}
            </g>
          );
        })}
        {!controller.adding && !controller.drawingId && hitLayer()}
        {controller.drawingId && <g aria-hidden="true" pointerEvents="none">
          <polyline points={controller.boundaryPoints.map(([x, y]) => `${x * width},${y * height}`).join(" ")} fill="none" stroke="#fff" strokeWidth={line(1.5)} vectorEffect="non-scaling-stroke" />
          {controller.boundaryPoints.map(([x, y], i) => <circle key={i} cx={x * width} cy={y * height} r={3 / perPx} fill="#fff" />)}
        </g>}
      </svg>
    );
  }

  if (!template) return null;
  const showGuides = mode === "design";
  return (
    <svg ref={svg} className={`tooth-map-overlay is-${mode} is-template`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="group"
      aria-label={mode === "select" ? "Smile template: tap a tooth to add or remove it" : "Smile design template"}>
      {template.clip && (
        <defs>
          <clipPath id={clipId}><polygon points={template.clip.map(p => p.join(",")).join(" ")} /></clipPath>
        </defs>
      )}

      {guides.proportions && (showGuides || mode === "select") && (
        // Illustrative worksheet geometry only. Review mode above always shows the real edit boundaries.
        <g className="smile-proportions" aria-hidden="true" pointerEvents="none">
          {/* Worksheet style: green proportion lines (midline, contacts, canine edges), a green line across the crown
              tops and a green incisal arc, canine to canine; solid red long axes through the front six. No boxes. */}
          {template.contacts.map((c, i) => <line key={`c${i}`} className="smile-guide-contact" x1={c.x} x2={c.x} y1={c.y0} y2={c.y1} strokeWidth={line(0.9)} vectorEffect="non-scaling-stroke" />)}
          {template.teeth.filter(t => t.kind !== "premolar").map(t => <line key={`a${t.fdi}`} className="smile-guide-axis" x1={t.axis[0][0]} y1={t.axis[0][1]} x2={t.axis[1][0]} y2={t.axis[1][1]} strokeWidth={line(0.9)} vectorEffect="non-scaling-stroke" />)}
          <line className="smile-guide-gingival" x1={template.topLine.x0} x2={template.topLine.x1} y1={template.topLine.y} y2={template.topLine.y} strokeWidth={line(0.8)} vectorEffect="non-scaling-stroke" />
          <path className="smile-guide-incisal" d={template.incisalArc} strokeWidth={line(0.8)} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {showGuides && !guides.proportions && (
        <g className="smile-guides" aria-hidden="true">
          <line className="smile-guide-midline" x1={template.midline.x} x2={template.midline.x} y1={template.midline.y0} y2={template.midline.y1} strokeWidth={line(1)} vectorEffect="non-scaling-stroke" />
          <path className="smile-guide-arc" d={template.arc} strokeWidth={line(1.2)} vectorEffect="non-scaling-stroke" />
        </g>
      )}

      <g clipPath={template.clip ? `url(#${clipId})` : undefined}>
        {template.teeth.map(t => {
          const on = selected.has(t.fdi);
          const tappable = t.mapped && mode === "select";
          return (
            <g key={t.fdi} className={`tooth-region${on ? " is-selected" : ""}${t.mapped ? "" : " is-unmapped"}${t.kind === "premolar" ? " is-posterior" : ""}`}>
              <path d={t.path} vectorEffect="non-scaling-stroke" strokeWidth={line(on && mode !== "design" ? 1.6 : 1)} className={tappable ? "is-tappable" : undefined}
                {...(tappable ? { role: "button", tabIndex: 0, "aria-label": `Tooth ${t.fdi}${on ? ", selected" : ""}`, "aria-pressed": on, ...handlers(`t${t.fdi}`, t.fdi) } : {})} />
            </g>
          );
        })}
      </g>

      {mode === "select" && hitLayer()}
      {mode !== "design" && template.teeth.filter(t => t.mapped).map(t => (
        <g key={t.fdi} className={`tooth-region${selected.has(t.fdi) ? " is-selected" : ""}`} aria-hidden="true">
          {t.width * perPx >= 10 && <text x={t.label[0]} y={t.label[1]} fontSize={(selected.has(t.fdi) ? 11.5 : 10.5) / perPx} textAnchor="middle">{t.fdi}</text>}
        </g>
      ))}
    </svg>
  );
}
