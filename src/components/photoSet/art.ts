import type { PhotoSlot } from "@/lib/portal";
import { VIEW_ART } from "./artData";

/** The nine views of the guided photo set (the slots that have a drawing). */
export type SetView = "profile" | "rest" | "front" | "smile" | "retractedRight" | "retracted" | "retractedLeft" | "upper" | "lower";
export const hasArt = (slot: PhotoSlot): slot is SetView => slot in VIEW_ART;

export const TILE_GOLD = "#A36B1E", TILE_GOLD_LIGHT = "#D1A564", TILE_CORNER = "#C9A06A";
const FRAME = [24, 24, 176, 176] as const;

export function bbox(d: string): [number, number, number, number] {
  const n = (d.match(/-?[\d.]+/g) || []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return [x0, y0, x1, y1];
}
const centre = (b: number[]) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// Symmetric drawings are centred on themselves; the profile and side views keep their place in the frame.
const CENTRED: Record<SetView, boolean> = { profile: false, rest: true, front: true, smile: true, retractedRight: false, retracted: true, retractedLeft: false, upper: true, lower: true };

/** Where a drawing sits in the 200 × 200 tile, inside the capture corners. */
export function tilePlacement(view: SetView): string {
  const r = VIEW_ART[view], [fx0, fy0, fx1, fy1] = r.frame, fw = fx1 - fx0, fh = fy1 - fy0, size = FRAME[2] - FRAME[0];
  let s = Math.min(size / fw, size / fh);
  if (fw > fh * 1.04) { const b = bbox(r.main + r.extras); s = Math.min(size / fh, (size - 6) / (b[2] - b[0])); }
  let cx = (fx0 + fx1) / 2;
  const cy = (fy0 + fy1) / 2;
  if (CENTRED[view]) cx = centre(bbox(r.main))[0];
  return `translate(100 100) scale(${s.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`;
}
export const tileCorners = () => { const [a, b, c, d] = FRAME, L = 19; return `<path d="M${a} ${b + L}V${b}H${a + L}M${c - L} ${b}H${c}V${b + L}M${a} ${d - L}V${d}H${a + L}M${c - L} ${d}H${c}V${d - L}" fill="none" stroke="${TILE_CORNER}" stroke-width="2.6" stroke-linecap="square"/>`; };

/** A drawing split into rings: each outer outline together with the holes it directly contains. */
export function rings(d: string): { d: string; b: [number, number, number, number] }[] {
  type Sub = { d: string; b: [number, number, number, number]; area: number; parent?: Sub | null };
  const subs: Sub[] = d.split(/(?=M)/).filter(Boolean).map(s => { const b = bbox(s); return { d: s, b, area: (b[2] - b[0]) * (b[3] - b[1]) }; });
  const inside = (a: Sub, o: Sub) => a !== o && o.area > a.area && a.b[0] >= o.b[0] - .5 && a.b[1] >= o.b[1] - .5 && a.b[2] <= o.b[2] + .5 && a.b[3] <= o.b[3] + .5;
  for (const s of subs) { let best: Sub | null = null; for (const o of subs) if (inside(s, o) && (!best || o.area < best.area)) best = o; s.parent = best; }
  const depth = (s: Sub): number => (s.parent ? 1 + depth(s.parent) : 0);
  const outers = subs.filter(s => depth(s) % 2 === 0).map(o => ({ src: o, d: o.d, b: o.b }));
  for (const inner of subs.filter(s => depth(s) % 2 === 1)) { const o = outers.find(x => x.src === inner.parent); if (o) o.d += inner.d; }
  return outers.map(({ d: dd, b }) => ({ d: dd, b }));
}

/** On a face, the eyes, nose and mouth (left off the camera guide, which shows the head and ears only). */
function faceFeature(view: SetView, b: number[]) {
  const f = VIEW_ART[view].face;
  return !!f && b[0] > f.cx - 50 && b[2] < f.cx + 50 && b[1] > f.eye - 18 && b[3] < f.mouth + 22;
}

/* ---------- camera guides ---------- */

export type GuideMotion = "top" | "centre" | "jaws";
export interface GuideSpec { slot: SetView; title: string; hint: string; motion: GuideMotion; midlines: boolean; mirror: boolean; light: boolean; zoom: number }

export const GUIDES: Record<SetView, Omit<GuideSpec, "slot" | "title">> = {
  profile: { hint: "Turn the head to the side, chin level", motion: "top", midlines: false, mirror: false, light: false, zoom: 1 },
  rest: { hint: "Lips together, relaxed", motion: "top", midlines: true, mirror: false, light: false, zoom: 1 },
  front: { hint: "A natural smile, eyes to the camera", motion: "top", midlines: true, mirror: false, light: false, zoom: 1 },
  smile: { hint: "Fill the box with the smile", motion: "centre", midlines: true, mirror: false, light: false, zoom: 2 },
  retractedRight: { hint: "Teeth together · pull the right cheek back", motion: "jaws", midlines: false, mirror: false, light: true, zoom: 2.5 },
  retracted: { hint: "Teeth together · midline on the line", motion: "jaws", midlines: true, mirror: false, light: true, zoom: 2.5 },
  retractedLeft: { hint: "Teeth together · pull the left cheek back", motion: "jaws", midlines: false, mirror: false, light: true, zoom: 2.5 },
  upper: { hint: "Mouth wide · mirror under the upper teeth", motion: "centre", midlines: false, mirror: true, light: true, zoom: 2.5 },
  lower: { hint: "Mouth wide · mirror over the lower teeth", motion: "centre", midlines: false, mirror: true, light: true, zoom: 2.5 },
};

/**
 * The guide drawn over the camera preview, in a 3:4 frame (260 × 347) with the drawing centred: white on clear,
 * for the native camera to show see-through. `part` gives the upper or lower half for the closing-jaws motion.
 */
export function guideSvg(view: SetView, part?: "upper" | "lower"): string {
  const r = VIEW_ART[view], face = !!r.face;
  const main = face ? r.main.split(/(?=M)/).filter(s => !faceFeature(view, bbox(s))).join("") : r.main;
  const extras = face || view === "retracted" ? r.extras.split(/(?=M)/).filter(s => { const q = bbox(s); return !face && Math.min(q[2] - q[0], q[3] - q[1]) > 5; }).join("") : r.extras;
  const b = bbox(main + extras), w = b[2] - b[0], h = b[3] - b[1];
  const s = face || view === "profile" ? Math.min(236 / h, 210 / w) : Math.min(196 / w, 210 / h);
  const [cx, cy] = centre(b);
  let clip = "";
  if (part) {
    const mb = bbox(r.main), mid = (mb[1] + mb[3]) / 2;
    const [y0, y1] = part === "upper" ? [mb[1] - 20, mid] : [mid, mb[3] + 20];
    clip = `<clipPath id="half"><rect x="${mb[0] - 20}" y="${y0}" width="${mb[2] - mb[0] + 40}" height="${y1 - y0}"/></clipPath>`;
  }
  const body = `<path d="${extras}" fill="#fff" fill-opacity=".7" fill-rule="evenodd"/><path d="${main}" fill="#fff" fill-rule="evenodd"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 347" width="780" height="1041"><defs>${clip}</defs>`
    + `<g transform="translate(130 173.5) scale(${s.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})"><g${part ? ' clip-path="url(#half)"' : ""}>${body}</g></g></svg>`;
}

/* ---------- tiles, with their motion ---------- */

const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string> = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const path = (d: string, fill: string, extra: Record<string, string> = {}) => el("path", { d, fill, "fill-rule": "evenodd", ...extra });
const ease = "cubic-bezier(.32,.72,0,1)";

/**
 * A tile's drawing as an SVG element, and `play(delay)` for its motion: the face settles, the smile opens, the
 * jaws close, the arch fills in. Played once when the photo set opens (never with Reduce Motion).
 */
export function buildTile(view: SetView): { svg: SVGSVGElement; play: (delay?: number) => Animation[] } {
  const svg = el("svg", { viewBox: "0 0 200 200", "aria-hidden": "true" }) as SVGSVGElement;
  svg.innerHTML = tileCorners();
  const g = el("g", { transform: tilePlacement(view) }); svg.appendChild(g);
  const r = VIEW_ART[view];
  const extras = path(r.extras, TILE_GOLD_LIGHT); g.appendChild(extras);
  const parts = rings(r.main);
  const at = (delay: number) => (a: Animation) => { const t = a.effect?.getTiming(); a.effect?.updateTiming({ delay: (Number(t?.delay) || 0) + delay }); return a; };
  let anims: () => Animation[];
  if (view === "rest" || view === "front") {
    parts.filter(p => !faceFeature(view, p.b)).forEach(p => g.appendChild(path(p.d, TILE_GOLD)));
    const f = r.face!;
    const kind = (b: number[]) => { const y = centre(b)[1]; return y < f.eye + 12 ? 0 : y < (f.eye + f.mouth) / 2 + 6 ? 1 : 2; };
    const groups = [el("g"), el("g"), el("g")];
    parts.filter(p => faceFeature(view, p.b)).forEach(p => groups[kind(p.b)].appendChild(path(p.d, TILE_GOLD)));
    if (view === "rest") {
      groups.forEach(n => g.appendChild(n));
      anims = () => groups.map((n, i) => n.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 120 + i * 160, easing: ease, fill: "backwards" }));
    } else {
      // The resting face (from At rest), then the smile.
      const rf = VIEW_ART.rest.face!, restPart = el("g", { transform: `translate(${f.cx - rf.cx} ${f.eye - rf.eye})` });
      rings(VIEW_ART.rest.main).filter(p => faceFeature("rest", p.b)).forEach(p => restPart.appendChild(path(p.d, TILE_GOLD)));
      g.appendChild(restPart); groups.forEach(n => g.appendChild(n));
      const mouth = groups[2], mb = bbox(parts.filter(p => faceFeature(view, p.b) && kind(p.b) === 2).map(p => p.d).join(""));
      (mouth as SVGGElement).style.transformBox = "view-box"; (mouth as SVGGElement).style.transformOrigin = `${centre(mb)[0]}px ${mb[1]}px`;
      anims = () => [
        restPart.animate([{ opacity: 1 }, { opacity: 1, offset: .35 }, { opacity: 0 }], { duration: 1100, easing: "ease-in-out", fill: "backwards" }),
        groups[0].animate([{ opacity: 0 }, { opacity: 0, offset: .4 }, { opacity: 1 }], { duration: 1100, easing: "ease-in-out", fill: "backwards" }),
        groups[1].animate([{ opacity: 0 }, { opacity: 0, offset: .45 }, { opacity: 1 }], { duration: 1100, fill: "backwards" }),
        mouth.animate([{ opacity: 0, transform: "scale(.55,.2)" }, { opacity: 0, transform: "scale(.55,.2)", offset: .38 }, { opacity: 1, transform: "scale(1.04,1.06)", offset: .82 }, { opacity: 1, transform: "none" }], { duration: 1150, easing: ease, fill: "backwards" }),
      ];
    }
  } else if (view === "profile") {
    const n = el("g"); parts.forEach(p => n.appendChild(path(p.d, TILE_GOLD))); g.appendChild(n);
    anims = () => [n.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 900, easing: "cubic-bezier(.45,0,.2,1)", fill: "backwards" })];
  } else if (view === "smile") {
    const n = path(r.main, TILE_GOLD); g.appendChild(n);
    const b = bbox(r.main); n.style.transformBox = "view-box"; n.style.transformOrigin = `${centre(b)[0]}px ${centre(b)[1]}px`;
    anims = () => [n.animate([{ clipPath: "inset(0 50% 0 50%)", transform: "scaleX(.9)" }, { clipPath: "inset(0 0 0 0)", transform: "none" }], { duration: 850, easing: ease, fill: "backwards" }),
      extras.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 300, fill: "backwards" })];
  } else if (view === "upper" || view === "lower") {
    const n = path(r.main, TILE_GOLD); g.appendChild(n);
    anims = () => [n.animate([{ clipPath: "inset(0 50% 0 50%)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 950, easing: "cubic-bezier(.45,0,.2,1)", fill: "backwards" })];
  } else {
    // Front and sides: the jaws close together, split along the bite.
    const b = bbox(r.main), mid = (b[1] + b[3]) / 2, id = `ps-${view}-${Math.random().toString(36).slice(2, 7)}`;
    const defs = el("defs");
    defs.innerHTML = `<clipPath id="${id}u"><rect x="${b[0] - 10}" y="${b[1] - 10}" width="${b[2] - b[0] + 20}" height="${mid - b[1] + 10}"/></clipPath><clipPath id="${id}l"><rect x="${b[0] - 10}" y="${mid}" width="${b[2] - b[0] + 20}" height="${b[3] - mid + 10}"/></clipPath>`;
    g.appendChild(defs);
    const up = el("g"), lo = el("g");
    up.appendChild(path(r.main, TILE_GOLD, { "clip-path": `url(#${id}u)` })); lo.appendChild(path(r.main, TILE_GOLD, { "clip-path": `url(#${id}l)` }));
    g.appendChild(lo); g.appendChild(up);
    const close = (from: string) => [{ transform: from }, { transform: from, offset: .15 }, { transform: "none" }];
    anims = () => [
      up.animate(close("translateY(-7px)"), { duration: 800, easing: "cubic-bezier(.34,1.25,.64,1)", fill: "backwards" }),
      lo.animate(close("translateY(9px)"), { duration: 800, easing: "cubic-bezier(.34,1.25,.64,1)", fill: "backwards" }),
      extras.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 200, fill: "backwards" }),
    ];
  }
  return { svg, play: (delay = 0) => anims().map(at(delay)) };
}
