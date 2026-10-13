"use client";
import { useEffect, useId, useState } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import type { AnalysisRow } from "@/lib/face/analysis";
import { GUIDE_ORDER, GUIDE_STYLES, smoothCurvePath, type GuideKey, type GuideSegment, type SmileGuides } from "@/lib/face/guides";
import { countUpText, guideDraw, readingArrival } from "@/lib/motion";

/**
 * Smile analysis in the comparison viewer: every reference line drawn on the
 * photograph itself, found on this device from facial landmarks (no AI call),
 * with one panel over the photograph that names each line, gives its reading
 * and switches it on or off.
 */
export type GuidesState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; guides: SmileGuides; rows: AnalysisRow[] }
  | { status: "no-face" }
  | { status: "unavailable" };

function naturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("An image could not be opened."));
    img.src = src;
  });
}

/** Lines for the patient's own photo, found once `enabled` turns on. */
export function useSmileGuides(src: string, enabled: boolean): GuidesState {
  const [state, setState] = useState<GuidesState>({ status: "off" });
  useEffect(() => {
    if (!enabled) {
      setState({ status: "off" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    (async () => {
      const [{ detectFace, faceModelAvailable }, { analyseSmile, analysisRows }, { smileGuides }] = await Promise.all([
        import("@/lib/face/landmarks"), import("@/lib/face/analysis"), import("@/lib/face/guides"),
      ]);
      if (!live) return;
      const [size, points] = await Promise.all([naturalSize(src), detectFace(src)]);
      const analysis = analyseSmile(points, size.width, size.height);
      if (!live) return;
      if (analysis) setState({ status: "ready", guides: smileGuides(analysis, size.width, size.height), rows: analysisRows(analysis) });
      else setState({ status: (await faceModelAvailable()) ? "no-face" : "unavailable" });
    })().catch(() => { if (live) setState({ status: "unavailable" }); });
    return () => { live = false; };
  }, [src, enabled]);
  return state;
}

/**
 * On screen the lines keep to two quiet tones: ivory for the face's own references, champagne for
 * the smile's. The panel names each one and switches it, so no colour key is needed. (The saved
 * report keeps a colour per line, GUIDE_STYLES, because a printed page needs its key.)
 */
const IVORY = "#F6EFE0", CHAMPAGNE = "#E3C48F";
const ON_SCREEN: Record<GuideKey, { colour: string; dashed: boolean }> = {
  eyeLine: { colour: IVORY, dashed: false },
  midline: { colour: IVORY, dashed: false },
  nasalLines: { colour: IVORY, dashed: true },
  mouthLine: { colour: CHAMPAGNE, dashed: false },
  smileArc: { colour: CHAMPAGNE, dashed: false },
};
const NO_LINES: ReadonlySet<GuideKey> = new Set();

/**
 * The lines, in the photo's own pixels: laid over an `object-fit: contain`
 * image of the same box, they land exactly on it and zoom with it. `scale`
 * is the viewer's zoom, so lines keep a constant on-screen weight. `elapsed`
 * (ms since the lines were found) draws them in one after another, in the
 * order of the panel; left out, they are simply there. Lines in `hidden`
 * fade away.
 */
export function GuideLines({ guides, scale = 1, advanced = true, elapsed = Infinity, hidden = NO_LINES }: {
  guides: SmileGuides; scale?: number; advanced?: boolean; elapsed?: number; hidden?: ReadonlySet<GuideKey>;
}) {
  const clip = useId();
  const arcClip = useId();
  const s = Math.max(0.2, scale);
  const common = { fill: "none", vectorEffect: "non-scaling-stroke", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const drawn = (key: GuideKey) => guideDraw(elapsed, GUIDE_ORDER.indexOf(key));
  const shown = (key: GuideKey) => ({ className: "guide-line", style: { opacity: hidden.has(key) ? 0 : 1 } });
  // Level lines open out from their middle; upright ones run down from the top.
  const line = (key: GuideKey, seg: GuideSegment | null, fromMiddle = false) => {
    const t = drawn(key);
    if (!seg || t <= 0) return null;
    const [ax, ay] = seg.from, [bx, by] = seg.to;
    const [x1, y1] = fromMiddle ? [(ax + bx) / 2 + (ax - bx) / 2 * t, (ay + by) / 2 + (ay - by) / 2 * t] : [ax, ay];
    const [x2, y2] = fromMiddle ? [(ax + bx) / 2 + (bx - ax) / 2 * t, (ay + by) / 2 + (by - ay) / 2 * t] : [ax + (bx - ax) * t, ay + (by - ay) * t];
    return <line {...common} x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={ON_SCREEN[key].colour} strokeWidth={1.7 / s}
      strokeDasharray={ON_SCREEN[key].dashed ? `${7 / s} ${7 / s}` : undefined} />;
  };
  // A zero-width stroke with round caps: a dot of constant on-screen size.
  const dot = (p: [number, number], key: GuideKey, i: number) => (
    <path key={i} {...common} d={`M${p[0]} ${p[1]}h0.01`} stroke={ON_SCREEN[key].colour} strokeWidth={7 / s} opacity={drawn(key)} />
  );
  // The smile arc is drawn across from the patient's right, as the mark is.
  const arcXs = guides.smileArc.map(p => p[0]);
  const arcLeft = Math.min(...arcXs) - guides.width * 0.02, arcRight = Math.max(...arcXs) + guides.width * 0.02;
  return (
    <svg className="guide-lines" viewBox={`0 0 ${guides.width} ${guides.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <clipPath id={clip}><rect width={guides.width} height={guides.height} /></clipPath>
        <clipPath id={arcClip}><rect x={arcLeft} width={(arcRight - arcLeft) * drawn("smileArc")} height={guides.height} /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <g {...shown("eyeLine")}>{line("eyeLine", guides.eyeLine, true)}{guides.pupils.map((p, i) => dot(p, "eyeLine", i))}</g>
        <g {...shown("midline")}>{line("midline", guides.midline)}</g>
        <g {...shown("nasalLines")}>{guides.nasalLines?.map((seg, i) => <g key={i}>{line("nasalLines", seg)}</g>)}</g>
        {advanced && <g {...shown("mouthLine")}>{line("mouthLine", guides.mouthLine, true)}{guides.commissures.map((p, i) => dot(p, "mouthLine", i))}</g>}
        <g {...shown("smileArc")} clipPath={`url(#${arcClip})`}><path {...common} d={smoothCurvePath(guides.smileArc)} stroke={ON_SCREEN.smileArc.colour} strokeWidth={2.2 / s} /></g>
      </g>
    </svg>
  );
}

const MESSAGES: Record<Exclude<GuidesState["status"], "off" | "ready">, string> = {
  loading: "Placing the reference lines…",
  "no-face": "Smile analysis needs a full-face photo with both eyes in view.",
  unavailable: "Smile analysis couldn’t start. It needs a connection the first time it’s used on this device.",
};

/** The lines this photograph has: nasal width needs the nose's edges, the upright lines need both eyes. */
export function guidesPresent(guides: SmileGuides): GuideKey[] {
  return GUIDE_ORDER.filter(key => key === "eyeLine" ? guides.eyeLine : key === "midline" ? guides.midline : key === "nasalLines" ? guides.nasalLines : true);
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={on} className="analysis-switch" onClick={onChange}>{label}<span aria-hidden="true" /></button>;
}

/**
 * The one panel of the analysis screen, over the photograph: each line with its reading, which is
 * also the switch that shows or hides it; one switch for all the lines; and Level photo, which
 * turns the view so the eyes sit level. Its title bar folds it away so every line can be seen.
 * Every guide and reading is shown: the full (advanced) analysis is the only one.
 */
export function AnalysisPanel({ state, elapsed = Infinity, hidden, onToggle, onToggleAll, level, onLevel, note, onHide }: {
  state: GuidesState;
  elapsed?: number;
  hidden: ReadonlySet<GuideKey>;
  onToggle: (key: GuideKey) => void;
  onToggleAll: () => void;
  /** Present when the photograph is tilted enough to be worth levelling. */
  level?: { on: boolean } | null;
  onLevel?: () => void;
  /** What is being looked at, in the small print ("AI concept · …" while the illustration shows). */
  note?: string;
  onHide?: () => void;
}) {
  const body = useId();
  const [collapsed, setCollapsed] = useState(false);
  if (state.status === "off") return null;
  const lines = state.status === "ready" ? guidesPresent(state.guides) : [];
  return (
    <section className={`analysis-panel${collapsed ? " is-collapsed" : ""}`} aria-label="Smile analysis" onPointerDown={(e) => e.stopPropagation()}>
      <div className="analysis-panel-head">
        <button type="button" className="analysis-panel-title" aria-expanded={!collapsed} aria-controls={body} onClick={() => setCollapsed(v => !v)}>
          <strong>Smile analysis</strong>
          <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">{collapsed ? "Show the readings" : "Fold the readings away"}</span>
        </button>
        {onHide && <button type="button" className="analysis-panel-done" onClick={onHide}>Done</button>}
      </div>
      <div id={body} className="analysis-panel-body" inert={collapsed || undefined}>
        <div className="analysis-panel-inner">
          {state.status === "ready" ? (
            <>
              <div className="analysis-panel-tools">
                <Switch label="All lines" on={lines.some(key => !hidden.has(key))} onChange={onToggleAll} />
                {level && onLevel && <Switch label="Level photo" on={level.on} onChange={onLevel} />}
              </div>
              <ul className="analysis-lines">
                {lines.map((key, i) => {
                  const row = state.rows.find(r => r.guide === key);
                  const on = !hidden.has(key);
                  // Each reading arrives after its line, its number counting up to the value.
                  const t = readingArrival(elapsed, i);
                  const value = key === "smileArc" ? "Lower lip" : key === "eyeLine" && level?.on ? "Levelled" : row ? countUpText(row.shortValue, t) : "";
                  return (
                    <li key={key} className={`is-${key}${key === "midline" || (key === "smileArc" && !lines.includes("nasalLines")) ? " is-wide" : ""}`} style={t < 1 ? { opacity: Math.min(1, t * 2.5) } : undefined}>
                      <button type="button" aria-pressed={on} title={row?.label} onClick={() => onToggle(key)}>
                        <span><small>{GUIDE_STYLES[key].label}</small><b>{value}</b></span>
                        {on ? <Eye size={17} strokeWidth={1.7} aria-hidden="true" /> : <EyeOff size={17} strokeWidth={1.7} aria-hidden="true" />}
                        <span className="sr-only">{on ? "Shown. Hide this line" : "Hidden. Show this line"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="analysis-panel-note">Relative guides from facial landmarks. Not a measurement of the teeth.{note ? ` ${note}` : ""}</p>
            </>
          ) : (
            <p className="analysis-panel-message" role="status">{MESSAGES[state.status]}</p>
          )}
        </div>
      </div>
    </section>
  );
}
