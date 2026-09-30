"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toothShapes } from "@/lib/toothMap/outline";
import { fitSmileTemplate } from "@/lib/toothMap/template";
import type { SmileSettings } from "@/lib/types";
import type { ToothMapController } from "./useToothMap";

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
  const visible = mode !== "hidden" && Boolean(map);
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

  const detected = useMemo(() => (reviewing ? toothShapes(map, width, height, selectedTeeth) : []), [reviewing, map, width, height, selectedTeeth]);
  const template = useMemo(
    () => (reviewing ? null : fitSmileTemplate(map, width, height, { settings, proportion: guides.proportion })),
    [reviewing, map, width, height, settings, guides.proportion],
  );

  if (!visible || !map) return null;
  const perPx = Math.max(1e-6, fit * scale);
  // Non-scaling strokes are already in screen pixels; only the zoom needs undoing.
  const line = (px: number) => px / Math.max(0.2, scale);
  const selected = new Set(selectedTeeth);

  /** Tap: toggle (select), open its controls (single), or correct it (review). */
  const handlers = (key: string, fdi: number | null, regionId?: string) => ({
    "data-own-taps": "",
    onPointerDown: (e: React.PointerEvent) => {
      if (controller.adding) return;
      const timer = window.setTimeout(() => {
        if (!press.current) return;
        press.current.long = true;
        if (reviewing && regionId) controller.setFocusedId(regionId);
        else if (fdi !== null) controller.openControls(fdi);
      }, LONG_PRESS_MS);
      press.current = { key, x: e.clientX, y: e.clientY, timer, long: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) { window.clearTimeout(p.timer); press.current = null; }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p || p.key !== key) return;
      window.clearTimeout(p.timer);
      if (p.long || Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) return;
      if (reviewing && regionId) { controller.setFocusedId(regionId); return; }
      if (fdi === null) return;
      if (mode === "single") controller.openControls(fdi); else controller.toggle(fdi);
    },
    onPointerCancel: () => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && fdi !== null) {
        e.preventDefault();
        if (mode === "single") controller.openControls(fdi); else controller.toggle(fdi);
      }
    },
  });

  const onAdd = (e: React.MouseEvent) => {
    if (!controller.adding || !svg.current) return;
    const point = svg.current.createSVGPoint();
    point.x = e.clientX; point.y = e.clientY;
    const local = point.matrixTransform(svg.current.getScreenCTM()?.inverse());
    controller.addToothAt([local.x / width, local.y / height]);
  };

  if (reviewing) {
    // The detected areas: exactly where edits are allowed, so the numbers can be checked.
    return (
      <svg ref={svg} className={`tooth-map-overlay is-select is-review${controller.adding ? " is-adding" : ""}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Detected teeth: tap one to correct it" onClick={onAdd}>
        {controller.adding && <rect className="tooth-map-catch" x={0} y={0} width={width} height={height} />}
        {detected.map(t => {
          const focused = controller.focusedId === t.id;
          return (
            <g key={t.id} className={`tooth-region${t.selected ? " is-selected" : ""}${focused ? " is-focused" : ""}${t.requiresReview ? " needs-review" : ""}`}>
              <path d={t.path} vectorEffect="non-scaling-stroke" strokeWidth={line(t.selected || focused ? 1.6 : 1)} className="is-tappable" role="button" tabIndex={0}
                aria-label={`Detected tooth ${t.fdi ?? "unnumbered"}${t.requiresReview ? ", check this tooth" : ""}`} {...handlers(t.id, t.fdi, t.id)} />
              {t.width * perPx >= 10 && <text x={t.centroid[0]} y={t.top - 7 / perPx} fontSize={10.5 / perPx} textAnchor="middle">{t.fdi ?? "?"}</text>}
            </g>
          );
        })}
      </svg>
    );
  }

  if (!template) return null;
  const showGuides = mode === "single" || mode === "design";
  return (
    <svg ref={svg} className={`tooth-map-overlay is-${mode} is-template`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="group"
      aria-label={mode === "select" ? "Smile template: tap a tooth to add or remove it" : mode === "single" ? "Selected tooth on the smile template" : "Smile design template"}>
      {template.clip && (
        <defs>
          <clipPath id={clipId}><polygon points={template.clip.map(p => p.join(",")).join(" ")} /></clipPath>
        </defs>
      )}

      {guides.proportions && (showGuides || mode === "select") && (
        // Guides: long axes, contacts, the incisal reference and the gingival line — all quieter than the teeth.
        <g className="smile-proportions" aria-hidden="true">
          {template.contacts.map((c, i) => <line key={`c${i}`} className="smile-guide-contact" x1={c.x} x2={c.x} y1={c.y0} y2={c.y1} strokeWidth={line(0.8)} vectorEffect="non-scaling-stroke" />)}
          {template.teeth.map(t => <line key={`a${t.fdi}`} className="smile-guide-axis" x1={t.axis[0][0]} y1={t.axis[0][1]} x2={t.axis[1][0]} y2={t.axis[1][1]} strokeWidth={line(0.8)} vectorEffect="non-scaling-stroke" />)}
          <line className="smile-guide-incisal" x1={template.incisalLine.x0} x2={template.incisalLine.x1} y1={template.incisalLine.y} y2={template.incisalLine.y} strokeWidth={line(0.8)} vectorEffect="non-scaling-stroke" />
          <path className="smile-guide-gingival" d={template.gingivalLine} strokeWidth={line(0.8)} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {showGuides && (
        <g className="smile-guides" aria-hidden="true">
          <line className="smile-guide-midline" x1={template.midline.x} x2={template.midline.x} y1={template.midline.y0} y2={template.midline.y1} strokeWidth={line(1)} vectorEffect="non-scaling-stroke" />
          <path className="smile-guide-arc" d={template.arc} strokeWidth={line(1.2)} vectorEffect="non-scaling-stroke" />
        </g>
      )}

      <g clipPath={template.clip ? `url(#${clipId})` : undefined}>
        {template.teeth.map(t => {
          const on = selected.has(t.fdi);
          const tappable = t.mapped && (mode === "select" || (mode === "single" && on));
          return (
            <g key={t.fdi} className={`tooth-region${on ? " is-selected" : ""}${t.mapped ? "" : " is-unmapped"}`}>
              <path d={t.path} vectorEffect="non-scaling-stroke" strokeWidth={line(on && mode !== "design" ? 1.6 : 1)} className={tappable ? "is-tappable" : undefined}
                {...(tappable ? { role: "button", tabIndex: 0, "aria-label": `Tooth ${t.fdi}${on ? ", selected" : ""}`, "aria-pressed": on, ...handlers(`t${t.fdi}`, t.fdi) } : {})} />
            </g>
          );
        })}
      </g>

      {mode !== "design" && template.teeth.filter(t => (mode === "single" ? selected.has(t.fdi) : t.mapped)).map(t => (
        <g key={t.fdi} className={`tooth-region${selected.has(t.fdi) ? " is-selected" : ""}`} aria-hidden="true">
          {t.width * perPx >= 10 && <text x={t.label[0]} y={t.label[1]} fontSize={(selected.has(t.fdi) ? 11.5 : 10.5) / perPx} textAnchor="middle">{t.fdi}</text>}
        </g>
      ))}
    </svg>
  );
}
