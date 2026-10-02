"use client";
import { useEffect, useId, useState } from "react";
import type { AnalysisRow } from "@/lib/face/analysis";
import { GUIDE_ORDER, GUIDE_STYLES, smoothCurvePath, type GuideSegment, type SmileGuides } from "@/lib/face/guides";

/**
 * Smile analysis in the comparison viewer: every reference line drawn on the
 * photograph itself, found on this device from facial landmarks (no AI call),
 * with a small key and the readings beneath.
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
 * The lines, in the photo's own pixels: laid over an `object-fit: contain`
 * image of the same box, they land exactly on it and zoom with it. `scale`
 * is the viewer's zoom, so lines keep a constant on-screen weight.
 */
export function GuideLines({ guides, scale = 1, advanced = false }: { guides: SmileGuides; scale?: number; advanced?: boolean }) {
  const clip = useId();
  const s = Math.max(0.2, scale);
  const common = { fill: "none", vectorEffect: "non-scaling-stroke", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const line = (key: keyof typeof GUIDE_STYLES, seg: GuideSegment | null) => seg && (
    <line {...common} x1={seg.from[0]} y1={seg.from[1]} x2={seg.to[0]} y2={seg.to[1]}
      stroke={GUIDE_STYLES[key].colour} strokeWidth={2.2 / s}
      strokeDasharray={GUIDE_STYLES[key].dashed ? `${9 / s} ${7 / s}` : undefined} />
  );
  // A zero-width stroke with round caps: a dot of constant on-screen size.
  const dot = (p: [number, number], colour: string, i: number) => (
    <path key={i} {...common} d={`M${p[0]} ${p[1]}h0.01`} stroke={colour} strokeWidth={9 / s} />
  );
  return (
    <svg className="guide-lines" viewBox={`0 0 ${guides.width} ${guides.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><clipPath id={clip}><rect width={guides.width} height={guides.height} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        {line("eyeLine", guides.eyeLine)}
        {line("midline", guides.midline)}
        {advanced && line("mouthLine", guides.mouthLine)}
        <path {...common} d={smoothCurvePath(guides.smileArc)} stroke={GUIDE_STYLES.smileArc.colour} strokeWidth={2.6 / s} />
        {guides.pupils.map((p, i) => dot(p, GUIDE_STYLES.eyeLine.colour, i))}
        {advanced && guides.commissures.map((p, i) => dot(p, GUIDE_STYLES.mouthLine.colour, i + 2))}
      </g>
    </svg>
  );
}

const MESSAGES: Record<Exclude<GuidesState["status"], "off" | "ready">, string> = {
  loading: "Placing the reference lines…",
  "no-face": "Smile analysis needs a full-face photo with both eyes in view.",
  unavailable: "Smile analysis couldn’t start. It needs a connection the first time it’s used on this device.",
};

/** Technical detail lives below the photo, never over the patient's face. */
export function GuideKey({ state, advanced, onAdvanced, onHide }: { state: GuidesState; advanced: boolean; onAdvanced: (value: boolean) => void; onHide?: () => void }) {
  if (state.status === "off") return null;
  return (
    <section className="analysis-details" aria-label="Smile analysis details"
      onPointerDown={(e) => e.stopPropagation()}>
      <div className="analysis-details-head"><strong>Smile analysis</strong>{onHide && <button type="button" className="text-button" onClick={onHide}>Hide analysis</button>}</div>
      {state.status === "ready" ? (
        <>
          <div className="settings-segment" role="group" aria-label="Analysis guides">
            <button type="button" aria-pressed={!advanced} onClick={() => onAdvanced(false)}>Basic</button>
            <button type="button" aria-pressed={advanced} onClick={() => onAdvanced(true)}>Advanced</button>
          </div>
          <details>
          <summary>Guide key &amp; measurements</summary>
          <ul className="guide-key-lines">
            {GUIDE_ORDER.filter(key => advanced || key !== "mouthLine").map((key) => (
              <li key={key}>
                <i className={`guide-swatch${GUIDE_STYLES[key].dashed ? " dashed" : ""}${key === "smileArc" ? " arc" : ""}`}
                  style={{ "--guide": GUIDE_STYLES[key].colour } as React.CSSProperties} aria-hidden="true" />
                {GUIDE_STYLES[key].label}
              </li>
            ))}
          </ul>
          <dl className="guide-key-readings">
            {state.rows.map((row) => (
              <div key={row.label}><dt title={row.label}>{row.shortLabel}</dt><dd>{row.shortValue}</dd></div>
            ))}
          </dl>
          <p className="guide-key-note">Relative guides from facial landmarks. Not a measurement of the teeth.</p>
          </details>
        </>
      ) : (
        <p className="guide-key-message" role="status">{MESSAGES[state.status]}</p>
      )}
    </section>
  );
}
