"use client";
import { roughMapFor, toothDebugFor, TOOTH_MAP_DEBUG } from "@/lib/toothMap/debug";
import { toothShapes } from "@/lib/toothMap/outline";
import { fitSmileTemplate } from "@/lib/toothMap/template";
import type { SmileSettings } from "@/lib/types";
import { toothGeometry } from "@/lib/toothMap/geometry";
import type { ToothMap } from "@/lib/toothMap/types";
import type { ToothProtection } from "@/lib/types";

/**
 * Developer-only: tooth labels with confidence, relative proportions and
 * symmetry pairs, and — after a generation — the combined edit mask and the
 * unexpected-change heatmap (green = allowed, red = changed outside it and
 * restored). Never rendered in production builds or in patient exports.
 */
export function ToothMapDebug({ map, width, height, image, protection, photo, settings }: {
  map: ToothMap | null | undefined;
  width: number;
  height: number;
  image?: string;
  protection?: ToothProtection;
  /** The patient photo, for the layer comparison (Studio only). */
  photo?: string;
  settings?: SmileSettings;
}) {
  if (!TOOTH_MAP_DEBUG || !map) return null;
  const images = toothDebugFor(image);
  const geometry = toothGeometry(map, width, height);
  return (
    <details className="tooth-debug">
      <summary>Tooth Map debug (development only)</summary>
      <table>
        <thead><tr><th>FDI</th><th>Conf.</th><th>W</th><th>H</th><th>W:H</th><th>Source</th></tr></thead>
        <tbody>
          {map.teeth.map(t => {
            const g = geometry.teeth.find(x => x.fdi === t.fdi);
            return <tr key={t.id}><td>{t.fdi ?? "?"}{t.visible ? "" : " (missing)"}</td><td>{t.confidence ?? "—"}{t.requiresReview ? " !" : ""}</td><td>{g?.width ?? "—"}</td><td>{g?.height ?? "—"}</td><td>{g?.ratio ?? "—"}</td><td>{t.source}</td></tr>;
          })}
        </tbody>
      </table>
      {geometry.pairs.length > 0 && <p>Pairs (left ÷ right): {geometry.pairs.map(p => `${p.right}↔${p.left} w ${p.widthRatio} h ${p.heightRatio} edge ${p.edgeOffset}`).join(" · ")}</p>}
      {protection && <p>Protection: teeth {protection.teeth.join(", ")}; restored {Math.round(protection.restoredShare * 1000) / 10}% of protected pixels; outside after {Math.round(protection.outsideChange * 10000) / 100}%; inside changed {Math.round(protection.insideChange * 100)}%; {protection.verified ? "verified" : "NOT verified"}.</p>}
      {photo && settings && <LayerComparison map={map} width={width} height={height} photo={photo} settings={settings} />}
      {images?.heatmap && <><p>Green = allowed edit area · Red = AI changes outside it (restored)</p><img src={images.heatmap} alt="Tooth map debug heatmap" /></>}
      {images?.mask && <><p>Combined edit mask (feathered)</p><img src={images.mask} alt="Tooth map combined edit mask" /></>}
    </details>
  );
}


/**
 * Raw detection (orange, dashed) vs the SlimSAM-refined mask outline (green)
 * vs the fitted vector template (white), over the mouth: for judging whether
 * template fitting follows the real teeth. Development only.
 */
function LayerComparison({ map, width, height, photo, settings }: { map: ToothMap; width: number; height: number; photo: string; settings: SmileSettings }) {
  const rough = roughMapFor(map.photoId);
  const refined = toothShapes(map, width, height, []);
  const raw = rough ? toothShapes(rough, width, height, []) : [];
  const template = fitSmileTemplate(map, width, height, { settings });
  const all = [...refined, ...raw];
  if (!all.length) return null;
  const x0 = Math.min(...all.map(s => s.left)), x1 = Math.max(...all.map(s => s.right));
  const y0 = Math.min(...all.map(s => s.top)), y1 = Math.max(...all.map(s => s.bottom));
  const pad = (x1 - x0) * 0.12;
  const view = `${x0 - pad} ${y0 - pad * 1.2} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2.4}`;
  return (
    <>
      <p>Layers: <span style={{ color: "#f0a050" }}>raw detection</span> · <span style={{ color: "#6fd08c" }}>SlimSAM mask ({map.method})</span> · white = fitted template</p>
      <svg viewBox={view} style={{ width: "100%", background: "#111", borderRadius: 8 }}>
        <image href={photo} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
        {raw.map(s => <path key={`r${s.id}`} d={s.path} fill="none" stroke="#f0a050" strokeDasharray="4 3" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />)}
        {refined.map(s => <path key={`s${s.id}`} d={s.path} fill="none" stroke="#6fd08c" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />)}
        {template?.teeth.map(t => <path key={`t${t.fdi}`} d={t.path} fill="none" stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />)}
      </svg>
    </>
  );
}
