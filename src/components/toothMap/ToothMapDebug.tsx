"use client";
import { toothDebugFor, TOOTH_MAP_DEBUG } from "@/lib/toothMap/debug";
import { toothGeometry } from "@/lib/toothMap/geometry";
import type { ToothMap } from "@/lib/toothMap/types";
import type { ToothProtection } from "@/lib/types";

/**
 * Developer-only: tooth labels with confidence, relative proportions and
 * symmetry pairs, and — after a generation — the combined edit mask and the
 * unexpected-change heatmap (green = allowed, red = changed outside it and
 * restored). Never rendered in production builds or in patient exports.
 */
export function ToothMapDebug({ map, width, height, image, protection }: {
  map: ToothMap | null | undefined;
  width: number;
  height: number;
  image?: string;
  protection?: ToothProtection;
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
      {images?.heatmap && <><p>Green = allowed edit area · Red = AI changes outside it (restored)</p><img src={images.heatmap} alt="Tooth map debug heatmap" /></>}
      {images?.mask && <><p>Combined edit mask (feathered)</p><img src={images.mask} alt="Tooth map combined edit mask" /></>}
    </details>
  );
}
