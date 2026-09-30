import type { ToothMap } from "./types";

/**
 * Tooth-map geometry for Smile Analysis: relative, visual measurements from
 * the photograph — never calibrated millimetres. Widths and heights are given
 * as a share of the mean central incisor width, so they compare within the
 * photo regardless of its resolution. Visible height is what the lips show,
 * not the crown's true length.
 */
export interface ToothGeometry {
  fdi: number;
  /** Visible width, relative to the central incisors' mean width. */
  width: number;
  /** Visible height, same scale. */
  height: number;
  /** Visible width : height. */
  ratio: number;
  centroid: { x: number; y: number };
  /** Lowest point of the outline (normalised y): the visible incisal edge. */
  incisalY: number;
  /** Visible area, relative to a central incisor's. */
  area: number;
}

export interface PairComparison {
  right: number;
  left: number;
  /** Left width ÷ right width (1 = matched). */
  widthRatio: number;
  heightRatio: number;
  /** Incisal edge difference as a share of the central width (+ = the left tooth sits lower). */
  edgeOffset: number;
}

function polygonArea(points: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) a += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
  return Math.abs(a / 2);
}

export function toothGeometry(map: ToothMap, imageWidth: number, imageHeight: number): { teeth: ToothGeometry[]; pairs: PairComparison[] } {
  const visible = map.teeth.filter(t => t.visible && t.fdi !== null);
  const toPx = (p: [number, number]): [number, number] => [p[0] * imageWidth, p[1] * imageHeight];
  const raw = visible.map(t => {
    const pts = t.outline.map(toPx);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { fdi: t.fdi as number, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), area: polygonArea(pts), t };
  });
  const centrals = raw.filter(r => r.fdi === 11 || r.fdi === 21);
  const unit = centrals.length ? centrals.reduce((s, r) => s + r.w, 0) / centrals.length : Math.max(1, ...raw.map(r => r.w));
  const unitArea = centrals.length ? centrals.reduce((s, r) => s + r.area, 0) / centrals.length : Math.max(1, ...raw.map(r => r.area));
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const teeth = raw.map(r => ({
    fdi: r.fdi,
    width: round(r.w / unit),
    height: round(r.h / unit),
    ratio: round(r.w / Math.max(1, r.h)),
    centroid: r.t.centroid,
    incisalY: round(Math.max(...r.t.outline.map(p => p[1]))),
    area: round(r.area / unitArea),
  }));
  const pairs: PairComparison[] = [];
  for (let n = 1; n <= 7; n++) {
    const right = teeth.find(t => t.fdi === 10 + n), left = teeth.find(t => t.fdi === 20 + n);
    if (!right || !left) continue;
    pairs.push({
      right: right.fdi,
      left: left.fdi,
      widthRatio: round(left.width / Math.max(1e-6, right.width)),
      heightRatio: round(left.height / Math.max(1e-6, right.height)),
      edgeOffset: round(((left.incisalY - right.incisalY) * imageHeight) / unit),
    });
  }
  return { teeth, pairs };
}
