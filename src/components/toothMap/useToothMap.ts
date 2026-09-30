"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { updateToothPlan } from "@/lib/teeth";
import { photoFingerprint, renumber, type NormPoint, type ToothMap, type ToothRegion } from "@/lib/toothMap/types";
import type { Photo, SmileSettings } from "@/lib/types";
import type { Proportion } from "@/lib/toothMap/template";

export type ToothMapStatus = "idle" | "detecting" | "ready" | "none";
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
 * The tooth map should be smart, not always visible. The map itself always
 * stays active for masks, generation, analysis and protection; only what is
 * drawn on the photo changes.
 */
export function toothOverlayMode({ hasMap, editing, adding, display, picking, guides, selectedMapped }: {
  hasMap: boolean; editing: boolean; adding: boolean; display: ToothMapDisplay; picking: boolean; guides: ToothGuides; selectedMapped: number;
}): ToothOverlayMode {
  if (!hasMap) return "hidden";
  if (editing || adding || display === "show") return "select";
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
  redetect: () => void;
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
 * Detects the tooth map when a photo reaches the Studio (on this device) and
 * keeps it with the photo. Selection is never stored twice: the design's
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
  const [controlsFor, openControls] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const running = useRef<string | null>(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const [picking, setPicking] = useState(false);
  const savePrefs = useCallback((next: typeof prefs) => {
    setPrefs(next);
    try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* the choice still applies for this session */ }
  }, []);

  const dataUrl = photo?.dataUrl ?? null;
  const fingerprint = dataUrl ? photoFingerprint(dataUrl) : null;
  const current = photo?.toothMap && photo.toothMap.photoId === fingerprint ? photo.toothMap : null;

  useEffect(() => {
    if (!active || !dataUrl || !fingerprint) return;
    if (current) { setStatus("ready"); return; }
    const key = `${fingerprint}:${attempt}`;
    if (running.current === key) return;
    running.current = key;
    setStatus("detecting");
    let live = true;
    void import("@/lib/toothMap/detect")
      .then(({ detectToothMap }) => detectToothMap({ dataUrl }, settings.shotType))
      .then(map => {
        if (!live) return;
        if (!map) { setStatus("none"); return; }
        setPhoto(p => (p && p.dataUrl === dataUrl ? { ...p, toothMap: map } : p));
        setStatus("ready");
      })
      .catch(() => { if (live) setStatus("none"); });
    return () => { live = false; running.current = null; };
    // Detect once per photo (and on a deliberate retry), not on every design change.
  }, [active, fingerprint, attempt, Boolean(current)]);

  const update = useCallback((change: (map: ToothMap) => ToothMap) => {
    setPhoto(p => (p?.toothMap ? { ...p, toothMap: change(p.toothMap) } : p));
  }, [setPhoto]);

  const setEditing = useCallback((on: boolean) => {
    setEditingState(on);
    if (!on) { setFocusedId(null); setAdding(false); }
  }, []);

  const toggle = useCallback((fdi: number) => {
    const selected = settings.selectedTeeth.includes(fdi);
    onChange(updateToothPlan(settings, { tooth: fdi, intent: selected ? "Preserve" : "Auto", condition: "Natural" }));
  }, [settings, onChange]);

  const tooth = (id: string): ToothRegion | undefined => current?.teeth.find(t => t.id === id);
  const selectedMapped = current ? current.teeth.filter(t => t.visible && t.fdi !== null && settings.selectedTeeth.includes(t.fdi)).length : 0;
  const mode = toothOverlayMode({ hasMap: Boolean(current), editing, adding, display: prefs.display, picking, guides: prefs.guides, selectedMapped });

  return {
    map: current,
    photoSize: { width: photo?.width ?? 1, height: photo?.height ?? 1 },
    status: current ? "ready" : status,
    editing,
    setEditing,
    focusedId,
    setFocusedId,
    adding,
    setAdding,
    controlsFor,
    openControls,
    toggle,
    confirm: () => {
      update(map => ({ ...map, confirmedByClinician: true, teeth: map.teeth.map(t => ({ ...t, requiresReview: false })) }));
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
      const sizes = (current?.teeth ?? []).filter(t => t.visible).map(t => t.bbox);
      const median = (values: number[], fallback: number) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : fallback);
      const rx = median(sizes.map(b => b.width), 0.05) * 0.42, ry = median(sizes.map(b => b.height), 0.07) * 0.46;
      const id = `m${Date.now().toString(36)}`;
      const outline = ellipse(x, y, rx, ry);
      const region: ToothRegion = {
        id, fdi: null, detectedIndex: -1, confidence: null,
        bbox: { x: x - rx, y: y - ry, width: rx * 2, height: ry * 2 }, centroid: { x, y }, outline,
        exactMaskRef: `outline:${id}`, influenceMaskRef: `influence:${id}`,
        visible: true, selected: false, requiresReview: false, source: "manual",
      };
      if (current) update(map => ({ ...map, teeth: [...map.teeth, region] }));
      else if (dataUrl && fingerprint) setPhoto(p => (p && p.dataUrl === dataUrl ? { ...p, toothMap: { photoId: fingerprint, arch: "upper", teeth: [region], confirmedByClinician: false, version: 1, method: "manual" } } : p));
      setAdding(false);
      setFocusedId(id);
    },
    redetect: () => {
      setPhoto(p => (p ? { ...p, toothMap: undefined } : p));
      setAttempt(a => a + 1);
    },
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
