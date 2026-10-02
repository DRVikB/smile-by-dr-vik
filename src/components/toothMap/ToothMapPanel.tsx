"use client";
import { createPortal } from "react-dom";
import { Check, Eye, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { updateToothPlan, activeToothPlans } from "@/lib/teeth";
import { fdiOrder, teethToReview } from "@/lib/toothMap/types";
import { toothEdges, toothShapes, type SmileSettings, type TargetShade, type ToothPlan } from "@/lib/types";
import type { ToothMapController, ToothMapDisplay } from "./useToothMap";
import type { Proportion } from "@/lib/toothMap/template";
import { ContourReference } from "./ContourReference";

const UPPER_FDI = [17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27];

/**
 * The tooth map's state on the Teeth step: finding teeth, ready to confirm,
 * teeth to check, and — in edit mode — corrections for the chosen tooth.
 */
export function ToothMapStatus({ controller }: { controller: ToothMapController }) {
  const { map, status, editing } = controller;
  if (controller.adding && !map) return <div className="tooth-map-status" role="status"><p>Tap a tooth on the photo to add its suggested area. Review its boundary and number before confirming.</p><button type="button" className="secondary-button" onClick={() => controller.setEditing(false)}>Cancel adding</button></div>;
  if (status === "detecting") return <p className="tooth-map-status" role="status"><span className="tooth-map-dot is-busy" aria-hidden="true" />Finding each tooth in the photo…</p>;
  if (status === "refining") return <div className="tooth-map-status" role="status"><p><span className="tooth-map-dot is-busy" aria-hidden="true" />Refining tooth boundaries on this device…</p><button type="button" className="text-button" onClick={controller.cancelAnalysis}>Keep suggested map</button></div>;
  if (status === "idle" && !map) return <div className="tooth-map-status"><p>Selected-tooth edits need reviewed outlines; detection runs on this device.</p><button type="button" className="secondary-button" onClick={controller.redetect}><Eye size={15} /> Find teeth</button></div>;
  if (status === "none" || !map) {
    return (
      <div className="tooth-map-status is-empty" role="status">
        <p>No teeth were found automatically. Add them on the photo, or use Protect edit area.</p>
        <div className="tooth-map-actions">
          <button type="button" className="secondary-button" onClick={() => { controller.setEditing(true); controller.setAdding(true); }}><Plus size={15} /> Add a tooth</button>
          <button type="button" className="text-button" onClick={controller.redetect}><RotateCcw size={14} /> Try again</button>
        </div>
      </div>
    );
  }
  const review = teethToReview(map);
  return (
    <div className="tooth-map-status" role="status">
      <p>
        <span className={`tooth-map-dot${map.confirmedByClinician ? " is-confirmed" : ""}`} aria-hidden="true" />
        {map.confirmedByClinician ? "Tooth map confirmed" : "Tooth map ready"}
        <small>{map.confirmedByClinician ? "Reviewed boundaries protect selected teeth. Unselected regions stay original." : "Check the actual tooth boundaries and FDI numbers, then confirm. The template is a visual guide only."}</small>
      </p>
      {review.length > 0 && (
        <div className="tooth-map-review">
          {review.map(t => (
            <button key={t.id} type="button" onClick={() => { controller.setEditing(true); controller.setFocusedId(t.id); }}>
              Check tooth {t.fdi ?? "?"}
            </button>
          ))}
        </div>
      )}
      {map.method === "on-device-v1" && <p className="control-hint">Fast suggested boundaries. Review or redraw them before confirming; refinement is optional and is not a clinical accuracy guarantee.</p>}
      {!editing && (
        <div className="tooth-map-actions">
          {/* The map is hidden for standard presets, so it is reviewed on the photo before it is confirmed. */}
          {map.confirmedByClinician
            ? <button type="button" className="secondary-button" onClick={() => controller.setEditing(true)}>Edit</button>
            : <button type="button" className="primary-button" onClick={() => controller.setEditing(true)}><Eye size={15} /> Review tooth map</button>}
        </div>
      )}
      {editing && <ToothMapEditor controller={controller} />}
    </div>
  );
}

function ToothMapEditor({ controller }: { controller: ToothMapController }) {
  const map = controller.map!;
  const tooth = map.teeth.find(t => t.id === controller.focusedId);
  const taken = new Set(map.teeth.filter(t => t.visible && t.fdi !== null).map(t => t.fdi));
  return (
    <div className="tooth-map-editor">
      {controller.drawingId ? <>
        <p className="control-hint">Tap around this tooth’s visible edge in order. Exclude gums and other teeth. Use at least 3 points; zoom before drawing if needed.</p>
        <div className="tooth-map-actions">
          <button type="button" className="secondary-button" disabled={!controller.boundaryPoints.length} onClick={controller.undoBoundaryPoint}>Undo point</button>
          <button type="button" className="primary-button" disabled={controller.boundaryPoints.length < 3} onClick={controller.saveBoundary}>Use boundary</button>
          <button type="button" className="text-button" onClick={() => controller.startBoundary(null)}>Cancel</button>
        </div>
      </> : controller.adding ? (
        <p className="control-hint">Tap the tooth on the photo to add it.</p>
      ) : tooth ? (
        <>
          <div className="tooth-map-editor-head">
            <strong>{tooth.fdi ? `Tooth ${tooth.fdi}` : "Unnumbered tooth"}</strong>
            <button type="button" className="icon-button" aria-label="Done with this tooth" onClick={() => controller.setFocusedId(null)}><X size={15} /></button>
          </div>
          <label className="tooth-map-field">
            Number
            <select className="design-select" value={tooth.fdi ?? ""} onChange={e => controller.renumberTooth(tooth.id, e.target.value ? Number(e.target.value) : null)}>
              <option value="">Not numbered</option>
              {UPPER_FDI.map(n => <option key={n} value={n}>{n}{taken.has(n) && n !== tooth.fdi ? " (swap)" : ""}</option>)}
            </select>
          </label>
          <div className="tooth-map-actions">
            <button type="button" className="secondary-button" onClick={() => controller.startBoundary(tooth.id)}>Redraw boundary</button>
            <button type="button" className="secondary-button" onClick={() => controller.markMissing(tooth.id)}>Missing or not applicable</button>
            <button type="button" className="text-button danger" onClick={() => controller.removeTooth(tooth.id)}><Trash2 size={14} /> Not a tooth</button>
          </div>
        </>
      ) : (
        <p className="control-hint">Every tooth is shown while you review. Tap one on the photo to correct its number, mark it missing or remove a false detection.</p>
      )}
      {!controller.drawingId && <div className="tooth-map-actions">
        <button type="button" className="secondary-button" onClick={() => controller.setAdding(!controller.adding)}><Plus size={15} /> {controller.adding ? "Cancel adding" : "Add a tooth"}</button>
        <button type="button" className="primary-button" onClick={controller.confirm}><Check size={15} /> Confirm tooth map</button>
      </div>}
      <button type="button" className="text-button" onClick={controller.redetect}><RotateCcw size={14} /> Find teeth again</button>
    </div>
  );
}

const SHADES: { value: TargetShade | "follow"; label: string }[] = [
  { value: "follow", label: "Design" }, { value: "The same", label: "Keep" }, { value: "Whiten", label: "Whiten" },
  { value: "A1", label: "A1" }, { value: "B1", label: "B1" }, { value: "BL3", label: "BL3" },
];

/** One tooth's own design: shape, length, width, edge and shade. Only this tooth changes. */
export function ToothControls({ fdi, settings, onChange, onClose }: {
  fdi: number;
  settings: SmileSettings;
  onChange: (next: SmileSettings) => void;
  onClose: () => void;
}) {
  const plans = settings.toothPlans ?? activeToothPlans(settings).map(p => ({ ...p, intent: "Auto" as const }));
  const plan: ToothPlan = plans.find(p => p.tooth === fdi) ?? { tooth: fdi, intent: "Preserve", condition: "Natural" };
  const included = plan.intent !== "Preserve" && plan.condition !== "Missing";
  const shadeOnly = included && (plan.intent === "Shade only" || (plan.intent === "Auto" && settings.designIntent === "Shade only"));
  const set = (patch: Partial<ToothPlan>) => onChange(updateToothPlan(settings, { ...plan, ...(included ? {} : { intent: "Auto", condition: "Natural" }), ...patch }));
  const step = (value: -1 | 0 | 1 | undefined, key: "length" | "width") => (
    <div className="segmented tooth-step" role="group" aria-label={key === "length" ? "Length" : "Width"}>
      {([-1, 0, 1] as const).map(v => (
        <button key={v} type="button" disabled={shadeOnly} aria-pressed={(value ?? 0) === v} className={(value ?? 0) === v ? "selected" : ""} onClick={() => set({ [key]: v })}>
          {v === -1 ? "−" : v === 0 ? "0" : "+"}
        </button>
      ))}
    </div>
  );
  // Portalled: the Studio's cards animate with transforms, which would trap a fixed sheet.
  return createPortal(
    <div className="sheet-backdrop tooth-controls-backdrop" role="dialog" aria-modal="true" aria-label={`Tooth ${fdi}`} onClick={onClose}>
      <div className="sheet tooth-controls" onClick={e => e.stopPropagation()}>
        <div className="sheet-heading">
          <h2>Tooth {fdi}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <label className="studio-switch-row">
          <span className="studio-treatment-text"><strong>Include in the design</strong><small>{included ? "This tooth may change; no other tooth is affected by these settings." : "Unchanged: it stays exactly as photographed."}</small></span>
          <input type="checkbox" role="switch" className="studio-switch" checked={included}
            onChange={e => onChange(updateToothPlan(settings, { ...plan, intent: e.target.checked ? "Auto" : "Preserve", condition: plan.condition === "Missing" ? "Natural" : plan.condition }))} />
        </label>
        {included && <>
          {shadeOnly && <p className="control-hint">Shade only for this tooth: its shape, length and edge stay as photographed.</p>}
          <div className="control-group">
            <div className="control-label">Shape</div>
            <div className="segmented" role="group" aria-label="Shape">
              {toothShapes.map(v => <button key={v} type="button" disabled={shadeOnly} aria-pressed={(plan.shape ?? "Natural") === v} className={(plan.shape ?? "Natural") === v ? "selected" : ""} onClick={() => set({ shape: v === "Natural" ? undefined : v })}>{v}</button>)}
            </div>
          </div>
          <div className="tooth-controls-row">
            <div className="control-group"><div className="control-label">Length</div>{step(plan.length, "length")}</div>
            <div className="control-group"><div className="control-label">Width</div>{step(plan.width, "width")}</div>
          </div>
          <div className="control-group">
            <div className="control-label">Edge</div>
            <div className="segmented" role="group" aria-label="Edge">
              {toothEdges.map(v => <button key={v} type="button" disabled={shadeOnly} aria-pressed={(plan.edge ?? "Natural") === v} className={(plan.edge ?? "Natural") === v ? "selected" : ""} onClick={() => set({ edge: v === "Natural" ? undefined : v })}>{v}</button>)}
            </div>
          </div>
          <div className="control-group">
            <div className="control-label"><span>Shade</span><span className="muted">From {settings.currentShade}</span></div>
            <div className="segmented tooth-shades" role="group" aria-label="Shade">
              {SHADES.map(s => {
                const on = (plan.targetShade ?? "follow") === s.value;
                return <button key={s.value} type="button" aria-pressed={on} className={on ? "selected" : ""} onClick={() => set({ targetShade: s.value === "follow" ? undefined : s.value })}>{s.label}</button>;
              })}
            </div>
          </div>
        </>}
        <button type="button" className="primary-button" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.body,
  );
}

/** "6 teeth selected" and "13 · 12 · 11 · 21 · 22 · 23". */
export function SelectedTeethSummary({ settings, notFound }: { settings: SmileSettings; notFound: number[] }) {
  const teeth = fdiOrder(settings.selectedTeeth);
  return (
    <p className="studio-summary tooth-selection-summary">
      <strong>{teeth.length === 1 ? "1 tooth selected" : `${teeth.length} teeth selected`}</strong>
      <span>{teeth.join(" · ") || "Tap teeth on the photo to select them."}</span>
      {notFound.length > 0 && <small>{fdiOrder(notFound).join(", ")} {notFound.length === 1 ? "isn’t" : "aren’t"} in this photo’s tooth map, so {notFound.length === 1 ? "it stays" : "they stay"} unchanged. Add {notFound.length === 1 ? "it" : "them"} in Edit if visible.</small>}
    </p>
  );
}

const PROPORTION_OPTIONS: { value: Proportion; label: string }[] = [{ value: "natural", label: "Natural" }, { value: "golden", label: "Golden" }, { value: "red", label: "70%" }];
const DISPLAYS: { value: ToothMapDisplay; label: string }[] = [{ value: "auto", label: "Auto" }, { value: "show", label: "Show" }, { value: "hide", label: "Hide" }];

/**
 * How the tooth map appears on the photo. Auto keeps the smile clean for the
 * 4 / 6 / 8 / 10 presets, shows every tooth while picking in Custom, and
 * outlines the tooth when exactly one is selected.
 */
export function ToothMapView({ controller, settings, onShapeChange }: { controller: ToothMapController; settings: SmileSettings; onShapeChange: (shape: SmileSettings["shape"]) => void }) {
  const { display, guides } = controller;
  return (
    <div className="tooth-map-view">
      <div className="tooth-map-view-row">
        <span id="tooth-map-display">Tooth map</span>
        <div className="segmented" role="group" aria-labelledby="tooth-map-display">
          {DISPLAYS.map(d => (
            <button key={d.value} type="button" aria-pressed={display === d.value} className={display === d.value ? "selected" : ""} onClick={() => controller.setDisplay(d.value)}>{d.label}</button>
          ))}
        </div>
      </div>
      <label className="studio-switch-row">
        <span className="studio-treatment-text"><strong>Smile design guides</strong><small>Tooth contours, smile arc and midline</small></span>
        <input type="checkbox" role="switch" className="studio-switch" checked={guides.design} onChange={e => controller.setGuides({ ...guides, design: e.target.checked })} />
      </label>
      {(guides.design || controller.mode !== "hidden") && (
        <label className="studio-switch-row">
          <span className="studio-treatment-text"><strong>Planning frames</strong><small>Crown boxes, dotted axes and reference lines</small></span>
          <input type="checkbox" role="switch" className="studio-switch" checked={guides.proportions} onChange={e => controller.setGuides({ ...guides, proportions: e.target.checked })} />
        </label>
      )}
      {(guides.design || controller.mode !== "hidden") && guides.proportions && (
        <div className="tooth-map-view-row">
          <span id="tooth-proportion">Proportion</span>
          <div className="segmented" role="group" aria-labelledby="tooth-proportion">
            {PROPORTION_OPTIONS.map(o => (
              <button key={o.value} type="button" aria-pressed={guides.proportion === o.value} className={guides.proportion === o.value ? "selected" : ""} onClick={() => controller.setGuides({ ...guides, proportion: o.value })}>{o.label}</button>
            ))}
          </div>
        </div>
      )}
      <ContourReference shape={settings.shape} onChange={onShapeChange} />
    </div>
  );
}

/** While picking teeth in Custom: the map stays up until the clinician is done. */
export function ToothPicking({ controller }: { controller: ToothMapController }) {
  if (!controller.picking || controller.display !== "auto") return null;
  return (
    <div className="tooth-picking" role="status">
      <p>Tap teeth on the photo to add or remove them.</p>
      <button type="button" className="primary-button" onClick={() => controller.setPicking(false)}><Check size={15} /> Done</button>
    </div>
  );
}

/** Exactly one tooth selected: its own controls, one tap away. */
export function SingleToothEdit({ controller, fdi }: { controller: ToothMapController; fdi: number }) {
  return (
    <button type="button" className="secondary-button tooth-single-edit" onClick={() => controller.openControls(fdi)}>
      <SlidersHorizontal size={15} /> Design tooth {fdi}
    </button>
  );
}
