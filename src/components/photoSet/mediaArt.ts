import { TILE_GOLD, TILE_GOLD_LIGHT, tileCorners } from "./art";

/**
 * The owner's drawings for the speech video and the 3D face scan (512 units, corners at 64–448), set in the
 * photo set tiles' frame (24–176) so they sit with the nine views, with their motion: the camera draws on, its
 * lens opens and the play mark springs in; the cube turns like a real cube while the orbit draws round it, then
 * settles exactly as drawn.
 */
export type MediaKind = "speech" | "scan";

const VIDEO = {
  body: "M130 160 H318 C340 160 354 177 354 200 V318 C354 340 339 357 318 357 H129 C107 357 90 340 90 318 V200 C90 178 106 160 130 160 Z",
  lens: "M354 226 L416 184 Q425 178 425 190 V327 Q425 336 417 332 L354 291",
  play: "M190 220 Q190 211 198 215 L273 253 Q282 257 273 262 L198 301 Q190 306 190 296 Z",
};
const SCAN = {
  guide: "M254 88 V117 M254 126 V145 M254 372 V394 M254 408 V441",
  cube: "M254 146 L356 199 L254 259 L152 199 Z M152 199 V292 M152 331 V334 L254 374 L356 334 V330 M356 292 V199 M254 259 V374",
  orbit: ["M125 220 C79 232 69 254 71 267 C77 295 122 308 193 318", "M384 220 C431 230 441 253 439 266 C434 297 385 309 315 318"],
};

const SCALE = 152 / 384, SHIFT = 24 - 64 * SCALE;
const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string> = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const line = (d: string, width: number, colour = TILE_GOLD, extra: Record<string, string> = {}) =>
  el("path", { d, fill: "none", stroke: colour, "stroke-width": String(width), "stroke-linecap": "round", "stroke-linejoin": "round", ...extra }) as SVGPathElement;
const ease = "cubic-bezier(.32,.72,0,1)";

export interface Playing { cancel(): void }

/** Draws a path on along its length, from its start. */
function drawOn(path: SVGPathElement, options: KeyframeAnimationOptions): Animation {
  const length = path.getTotalLength() + 1;
  path.style.strokeDasharray = `${length} ${length}`;
  const a = path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { fill: "backwards", ...options });
  a.finished.then(() => { path.style.strokeDasharray = ""; }, () => { path.style.strokeDasharray = ""; });
  return a;
}

/* ---------- the cube, turned in 3D ---------- */

const CUBE = { size: 72.1, pitch: Math.asin(0.554), cx: 254, cy: 262.5 };
const CORNERS = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] as const;
const FACES: [number[], [number, number, number]][] = [
  [[0, 1, 2, 3], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]], [[0, 1, 5, 4], [0, -1, 0]],
  [[3, 2, 6, 7], [0, 1, 0]], [[0, 3, 7, 4], [-1, 0, 0]], [[1, 2, 6, 5], [1, 0, 0]],
];

/** The cube turned `yaw` about its upright axis, seen from a little above: its visible edges as a path. */
export function cubeEdges(yaw: number): string {
  const { size, pitch, cx, cy } = CUBE, cy0 = Math.cos(yaw), sy0 = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const turn = ([x, y, z]: readonly number[]) => {
    const x1 = x * cy0 + z * sy0, z1 = -x * sy0 + z * cy0;
    return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
  };
  const at = CORNERS.map(c => { const p = turn(c); return [cx + size * p.x, cy - size * p.y]; });
  const edges = new Set<string>();
  for (const [corners, normal] of FACES) {
    if (turn(normal).z <= 1e-6) continue; // faces turned away from the viewer
    corners.forEach((a, i) => { const b = corners[(i + 1) % 4]; edges.add(a < b ? `${a}-${b}` : `${b}-${a}`); });
  }
  return [...edges].map(e => { const [a, b] = e.split("-").map(Number); return `M${at[a][0].toFixed(1)} ${at[a][1].toFixed(1)}L${at[b][0].toFixed(1)} ${at[b][1].toFixed(1)}`; }).join("");
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A tile's drawing as an SVG element, and `play(delay)` for its motion (once, never with Reduce Motion). */
export function buildMediaTile(kind: MediaKind): { svg: SVGSVGElement; play: (delay?: number) => Playing[] } {
  const svg = el("svg", { viewBox: "0 0 200 200", "aria-hidden": "true" }) as SVGSVGElement;
  svg.innerHTML = tileCorners();
  const g = el("g", { transform: `translate(${SHIFT.toFixed(2)} ${SHIFT.toFixed(2)}) scale(${SCALE.toFixed(4)})` });
  svg.appendChild(g);
  if (kind === "speech") {
    const body = line(VIDEO.body, 7.5), lens = line(VIDEO.lens, 7.5), play = line(VIDEO.play, 7.2);
    [lens, play].forEach(p => { p.style.transformBox = "fill-box"; });
    lens.style.transformOrigin = "0% 50%";
    play.style.transformOrigin = "45% 50%";
    g.append(body, lens, play);
    return {
      svg,
      play: (delay = 0) => [
        drawOn(body, { duration: 850, delay, easing: "cubic-bezier(.45,0,.2,1)" }),
        lens.animate([{ opacity: 0, transform: "scaleX(.2)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: delay + 560, easing: ease, fill: "backwards" }),
        play.animate([{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1.14)", offset: 0.6 }, { opacity: 1, transform: "scale(.95)", offset: 0.82 }, { opacity: 1, transform: "none" }],
          { duration: 720, delay: delay + 820, easing: "ease-out", fill: "backwards" }),
      ],
    };
  }
  const guide = line(SCAN.guide, 4.8, TILE_GOLD_LIGHT, { "stroke-dasharray": "11 13", "stroke-linecap": "butt" });
  const still = line(SCAN.cube, 7.6), turning = line("", 7.6);
  const orbits = SCAN.orbit.map(d => line(d, 5.6));
  turning.style.opacity = "0";
  g.append(guide, still, turning, ...orbits);
  return {
    svg,
    play: (delay = 0) => {
      // The cube turns half a revolution (it looks the same every quarter turn) and eases into the drawn pose,
      // where the drawing itself takes over.
      let frame = 0, stopped = false;
      const spin = 1500, begin = performance.now() + delay;
      const show = (turningOn: boolean) => { turning.style.opacity = turningOn ? "1" : "0"; still.style.opacity = turningOn ? "0" : "1"; };
      turning.setAttribute("d", cubeEdges(Math.PI / 4 + Math.PI));
      show(true);
      const step = (now: number) => {
        if (stopped) return;
        const t = Math.min(1, Math.max(0, (now - begin) / spin));
        turning.setAttribute("d", cubeEdges(Math.PI / 4 + Math.PI * (1 - easeInOut(t))));
        if (t < 1) { frame = requestAnimationFrame(step); return; }
        show(false);
        still.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      };
      frame = requestAnimationFrame(step);
      const cube: Playing = { cancel: () => { stopped = true; cancelAnimationFrame(frame); show(false); } };
      return [
        cube,
        guide.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay, fill: "backwards" }),
        ...orbits.map(o => drawOn(o, { duration: 1250, delay: delay + 250, easing: "cubic-bezier(.45,0,.2,1)" })),
      ];
    },
  };
}
