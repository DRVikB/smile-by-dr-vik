"use client";
import { INTERNAL_SINGLE_TOOTH } from "@/lib/generation/availability";
import { useCallback, useEffect, useRef, useState } from "react";
import { updateToothPlan } from "@/lib/teeth";
import { isValidToothMap, photoFingerprint, renumber, TOOTH_MAP_VERSION, type NormPoint, type ToothMap, type ToothRegion } from "@/lib/toothMap/types";
import type { Photo, SmileSettings } from "@/lib/types";
import type { Proportion } from "@/lib/toothMap/template";
import {needsDetection,needsRefinement} from "@/lib/toothMap/refinementPolicy";

export type ToothMapStatus = "idle" | "detecting" | "refining" | "ready" | "none";
/** The clinician's choice for the overlay: Auto decides from the selection. */
export type ToothMapDisplay = "auto" | "show" | "hide";
/**
 * What the overlay draws:
 *   hidden  nothing: a clean smile (standard presets)
 *   select  every tooth, numbered and tappable (Custom picking, Show, editing the map)
 *   single  the one selected tooth outlined and numbered, the rest faint, with the arc and midline
 *   design  white contours with the smile arc and midline (Smile design guides on)
 */
export type ToothOverlayMode = "hidden" | "select" | "single" | "design";
export interface ToothGuides { design: boolean; proportions: boolean; proportion: Proportion }

const PREFS_KEY = "smile.toothMapView";

function readPrefs(): { display: ToothMapDisplay; guides: ToothGuides } {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) ?? "{}") as Partial<{ display: ToothMapDisplay; guides: ToothGuides }>;
    const display = raw.display === "show" || raw.display === "hide" ? raw.display : "auto";
    const proportion = raw.guides?.proportion === "golden" || raw.guides?.proportion === "red" ? raw.guides.proportion : "natural";
    return { display, guides: { design: raw.guides?.design === true, proportions: raw.guides?.proportions === true, proportion } };
  } catch {
    return { display: "auto", guides: { design: false, proportions: false, proportion: "natural" } };
  }
}

/**
 * Display choices never alter the generation rules. The reviewed map governs
 * single-tooth masks; standard and full-arch generation do not depend on it.
 */
export function toothOverlayMode({ hasMap, editing, adding, display, picking, guides, selectedMapped }: {
  hasMap: boolean; editing: boolean; adding: boolean; display: ToothMapDisplay; picking: boolean; guides: ToothGuides; selectedMapped: number;
}): ToothOverlayMode {
  if (!hasMap) return "hidden";
  if (editing || adding || display === "show") return "select";
  if (display === "hide") return "hidden";
  if (display === "auto") {
    if (picking) return "select";
    if (selectedMapped === 1) return "single";
  }
  return guides.design ? "design" : "hidden";
}

/** Everything the Teeth step and the photo overlay share about the tooth map. */
export interface ToothMapController {
  map: ToothMap | null;
  photoSize: { width: number; height: number };
  status: ToothMapStatus;
  editing: boolean;
  setEditing: (on: boolean) => void;
  /** Edit mode: the tooth being corrected. */
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  /** Edit mode: the next tap on the photo adds a tooth there. */
  adding: boolean;
  setAdding: (on: boolean) => void;
  /** The tooth whose individual design controls are open. */
  controlsFor: number | null;
  openControls: (fdi: number | null) => void;
  toggle: (fdi: number) => void;
  confirm: () => void;
  renumberTooth: (id: string, fdi: number | null) => void;
  markMissing: (id: string) => void;
  removeTooth: (id: string) => void;
  addToothAt: (point: NormPoint) => void;
  drawingId: string | null;
  boundaryPoints: NormPoint[];
  startBoundary: (id: string | null) => void;
  addBoundaryPoint: (point: NormPoint) => void;
  undoBoundaryPoint: () => void;
  saveBoundary: () => void;
  redetect: () => void;
  cancelAnalysis: () => void;
  /** Auto / Show / Hide, remembered on this device. */
  display: ToothMapDisplay;
  setDisplay: (display: ToothMapDisplay) => void;
  /** Custom selection in progress: the map shows until the clinician is done. */
  picking: boolean;
  setPicking: (on: boolean) => void;
  guides: ToothGuides;
  setGuides: (guides: ToothGuides) => void;
  /** What the overlay draws for the current selection. */
  mode: ToothOverlayMode;
  /** The photo the map belongs to (debug comparison only). */
  photoUrl: string | null;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): NormPoint[] {
  return Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [Math.min(1, Math.max(0, cx + rx * Math.cos(a))), Math.min(1, Math.max(0, cy + ry * Math.sin(a)))] as NormPoint;
  });
}

/**
 * Detects on demand for Custom, Show, guides or a single tooth, on this device,
 * and keeps it with the photo. Selection is never stored twice: the design's
 * selected teeth decide what is selected; the map decides where each tooth is.
 */
export function useToothMap({ photo, setPhoto, settings, onChange, active }: {
  photo: Photo | null;
  setPhoto: (update: (current: Photo | null) => Photo | null) => void;
  settings: SmileSettings;
  onChange: (next: SmileSettings) => void;
  active: boolean;
}): ToothMapController {
  const [status, setStatus] = useState<ToothMapStatus>("idle");
  const [editing, setEditingState] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [boundaryPoints, setBoundaryPoints] = useState<NormPoint[]>([]);
  const [controlsFor, openControls] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [requestedPhoto, setRequestedPhoto] = useState<string | null>(null);
  const running = useRef<string | null>(null);
  const refinement=useRef<AbortController|null>(null);
  const refinementAttempt=useRef<string|null>(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const [picking, setPicking] = useState(false);
  const savePrefs = useCallback((next: typeof prefs) => {
    setPrefs(next);
    try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* the choice still applies for this session */ }
  }, []);

  const dataUrl = photo?.dataUrl ?? null;
  const fingerprint = dataUrl ? photoFingerprint(dataUrl) : null;
  const current = isValidToothMap(photo?.toothMap) && photo.toothMap.photoId === fingerprint ? photo.toothMap : null;
  const needsMap = settings.treatmentMode !== "full_arch" && needsDetection({
    single: INTERNAL_SINGLE_TOOTH && !settings.alignment && settings.selectedTeeth.length === 1,
    custom: picking, review: editing || adding, show: prefs.display === "show",
    guides: prefs.guides.design, requested: requestedPhoto !== null && requestedPhoto === fingerprint,
  });

  useEffect(() => {
    setEditingState(false); setAdding(false); setFocusedId(null); openControls(null); setPicking(false); setDrawingId(null); setBoundaryPoints([]);
  }, [fingerprint]);

  useEffect(() => {
    if (!active || !needsMap || !dataUrl || !fingerprint) { setStatus("idle"); return; }
    if (current) { setStatus("ready"); return; }
    const key = `${fingerprint}:${attempt}`;
    if (running.current === key) return;
    running.current = key;
    setStatus("detecting");
    let live = true;
    const cancellation = new AbortController();
    void import("@/lib/toothMap/detect")
      .then(({ detectToothMap }) => detectToothMap({ dataUrl }, settings.shotType, undefined, { refine:false,signal: cancellation.signal }))
      .then(map => {
        if (!live) return;
        if (!map) { setStatus("none"); return; }
        setPhoto(p => (p && p.dataUrl === dataUrl && (!isValidToothMap(p.toothMap) || p.toothMap.photoId !== fingerprint) ? { ...p, toothMap: map } : p));
        setStatus("ready");
      })
      .catch(() => { if (live) setStatus("none"); });
    return () => { live = false; running.current = null; cancellation.abort(); };
    // Detect once per photo (and on a deliberate retry), not on every design change.
  }, [active, needsMap, fingerprint, attempt, Boolean(current), settings.shotType]);

  const refineWanted=needsRefinement(current,{single:INTERNAL_SINGLE_TOOTH&&settings.selectedTeeth.length===1&&needsMap,custom:picking,review:editing});
  useEffect(()=>{
    if(!active||!refineWanted||!current||!dataUrl)return;
    const key=fingerprint+JSON.stringify(current.teeth.map(t=>[t.fdi,t.visible,t.outline]))+attempt;
    if(refinementAttempt.current===key)return;
    refinementAttempt.current=key;
    const cancel=new AbortController();refinement.current=cancel;let live=true;setStatus("refining");
    void import("@/lib/toothMap/detect").then(m=>m.refineToothMap({dataUrl},current,cancel.signal)).then(map=>{
      if(!live||cancel.signal.aborted)return;
      setPhoto(p=>p?.dataUrl===dataUrl&&p.toothMap===current?{...p,toothMap:map}:p);setStatus("ready");
    }).catch(()=>{if(live)setStatus("ready");});
    return()=>{live=false;cancel.abort();if(refinement.current===cancel){refinement.current=null;setStatus(value=>value==="refining"?"ready":value);}};
  },[active,refineWanted,current,dataUrl,attempt]);

  const update = useCallback((change: (map: ToothMap) => ToothMap) => {
    setPhoto(p => (p?.toothMap && p.toothMap.photoId === fingerprint ? { ...p, toothMap: { ...change(p.toothMap), confirmedByClinician: false } } : p));
  }, [setPhoto, fingerprint]);

  const setEditing = useCallback((on: boolean) => {
    setEditingState(on);
    if (!on) { setFocusedId(null); setAdding(false); setDrawingId(null); setBoundaryPoints([]); }
  }, []);

  const toggle = useCallback((fdi: number) => {
    const selected = settings.selectedTeeth.includes(fdi);
    onChange(updateToothPlan(settings, { tooth: fdi, intent: selected ? "Preserve" : "Auto", condition: "Natural" }));
  }, [settings, onChange]);

  const tooth = (id: string): ToothRegion | undefined => current?.teeth.find(t => t.id === id);
  const selectedMapped = current && settings.selectedTeeth.length === 1 ? current.teeth.filter(t => t.visible && t.fdi !== null && settings.selectedTeeth.includes(t.fdi)).length : 0;
  const requestedMode = settings.treatmentMode === "full_arch" ? "hidden" : toothOverlayMode({ hasMap: Boolean(current), editing, adding, display: prefs.display, picking, guides: prefs.guides, selectedMapped });

  const mode = !INTERNAL_SINGLE_TOOTH && requestedMode === "single" ? "select" : requestedMode;
  return {
    map: current,
    photoSize: { width: photo?.width ?? 1, height: photo?.height ?? 1 },
    status: status==="refining"?"refining":current?"ready":status,
    editing,
    setEditing,
    focusedId,
    setFocusedId,
    adding,
    setAdding,
    controlsFor,
    openControls: fdi => openControls(INTERNAL_SINGLE_TOOTH ? fdi : null),
    toggle,
    confirm: () => {
      if(status==="refining")return;
      setPhoto(p => (p?.toothMap && p.toothMap.photoId === fingerprint ? { ...p, toothMap: { ...p.toothMap, confirmedByClinician: true, teeth: p.toothMap.teeth.map(t => ({ ...t, requiresReview: false })) } } : p));
      setEditing(false);
    },
    renumberTooth: (id, fdi) => update(map => renumber(map, id, fdi)),
    markMissing: (id) => {
      const t = tooth(id);
      update(map => ({ ...map, teeth: map.teeth.map(r => (r.id === id ? { ...r, visible: false, requiresReview: false } : r)) }));
      // The design treats it as missing too, so the prompt never asks for it.
      if (t?.fdi) onChange(updateToothPlan(settings, { tooth: t.fdi, intent: "Preserve", condition: "Missing" }));
      setFocusedId(null);
    },
    removeTooth: (id) => {
      update(map => ({ ...map, teeth: map.teeth.filter(r => r.id !== id) }));
      setFocusedId(null);
    },
    addToothAt: ([x, y]) => {
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const sizes = (current?.teeth ?? []).filter(t => t.visible).map(t => t.bbox);
      const median = (values: number[], fallback: number) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : fallback);
      const rx = median(sizes.map(b => b.width), 0.05) * 0.42, ry = median(sizes.map(b => b.height), 0.07) * 0.46;
      const id = `m${crypto.randomUUID()}`;
      const outline = ellipse(x, y, rx, ry);
      const region: ToothRegion = {
        id, fdi: null, detectedIndex: -1, confidence: null,
        bbox: { x: Math.min(...outline.map(p => p[0])), y: Math.min(...outline.map(p => p[1])), width: Math.max(...outline.map(p => p[0])) - Math.min(...outline.map(p => p[0])), height: Math.max(...outline.map(p => p[1])) - Math.min(...outline.map(p => p[1])) }, centroid: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }, outline,
        exactMaskRef: `outline:${id}`, influenceMaskRef: `influence:${id}`,
        visible: true, selected: false, requiresReview: true, source: "manual",
      };
      if (current) update(map => ({ ...map, teeth: [...map.teeth, region] }));
      else if (dataUrl && fingerprint) setPhoto(p => (p && p.dataUrl === dataUrl ? { ...p, toothMap: { photoId: fingerprint, arch: "upper", teeth: [region], confirmedByClinician: false, version: TOOTH_MAP_VERSION, method: "manual" } } : p));
      setEditingState(true);
      setAdding(false);
      setFocusedId(id);
    },
    drawingId,
    boundaryPoints,
    startBoundary: (id) => { setDrawingId(id); setBoundaryPoints([]); setAdding(false); },
    addBoundaryPoint: ([x, y]) => {
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) setBoundaryPoints(points => points.length < 64 ? [...points, [x, y]] : points);
    },
    undoBoundaryPoint: () => setBoundaryPoints(points => points.slice(0, -1)),
    saveBoundary: () => {
      if (!drawingId || boundaryPoints.length < 3) return;
      const xs = boundaryPoints.map(p => p[0]), ys = boundaryPoints.map(p => p[1]);
      update(map => ({ ...map, teeth: map.teeth.map(t => t.id === drawingId ? {
        ...t, outline: boundaryPoints, source: "manual", confidence: null, requiresReview: true,
        bbox: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
        centroid: { x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length },
      } : t) }));
      setDrawingId(null); setBoundaryPoints([]);
    },
    redetect: () => {
      setRequestedPhoto(fingerprint);
      setFocusedId(null); openControls(null); setDrawingId(null); setBoundaryPoints([]);
      setPhoto(p => (p ? { ...p, toothMap: undefined } : p));
      setAttempt(a => a + 1);
    },
    cancelAnalysis:()=>{refinement.current?.abort();setStatus(current?"ready":"idle");},
    display: prefs.display,
    setDisplay: (display) => savePrefs({ ...prefs, display }),
    picking,
    setPicking,
    guides: prefs.guides,
    setGuides: (guides) => savePrefs({ ...prefs, guides }),
    mode,
    photoUrl: dataUrl,
  };
}
