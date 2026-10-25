/**
 * The first-launch intro, played once before onboarding's Welcome step.
 *
 * Launch screen → the dark opens from the icon → the SmileCompose mark draws centre stage with the name and
 * Designed by Dr Vik → the mark's lines land on a patient's face as her analysis guides → the photo becomes a
 * card on ivory for four beats (Plan; Visualise, in your style; Communicate; Transform) → hands over to Welcome.
 *
 * Everything is drawn on a fixed design stage (iPhone portrait, iPad landscape or iPhone Duo open) scaled to fit,
 * and driven by `render(t)` so the timing is deterministic. The backgrounds sit outside the stage so they always
 * fill the screen.
 */

export const INTRO_SEEN_KEY = "smilecompose.firstLaunchIntroSeen";
export const INTRO_END = 17.0;

type Pt = [number, number];
type Pose = { x: number; y: number; s: number; o?: number };

interface Layout {
  W: number; H: number; land: boolean; strip: number;
  icon: Pt; logo: Pt; LS: number; wmSize: number; KF: number; mouthY: number; revR: number; soft: number;
  plan: [number, number, number]; style: [number, number, number]; dev: [number, number, number, number];
  tiles: { cx: number; y: number; w: number; h: number; gap: number }; capT: number; pill: [number, number, number, number];
  tb: { b1: Pt; b2: Pt; b3: Pt; b4: Pt; w: number; h: number; s: number; align: "center" | "left" };
}

const LAYOUTS: Record<"phone" | "ipad" | "duo", Layout> = {
  phone: { W: 440, H: 956, land: false, strip: 0, icon: [220, 420], logo: [220, 400], LS: .44, wmSize: 22, KF: .9, mouthY: 480, revR: 1150, soft: .72,
    plan: [220, 392, 1.22], style: [220, 470, 1.05], dev: [220, 410, 262, 560],
    tiles: { cx: 220, y: 142, w: 104, h: 68, gap: 12 }, capT: 108, pill: [220, 662, 312, 58],
    tb: { b1: [34, 622], b2: [34, 712], b3: [34, 722], b4: [34, 722], w: 372, h: 36, s: 15.5, align: "center" } },
  ipad: { W: 1180, H: 820, land: true, strip: 0, icon: [590, 360], logo: [590, 350], LS: .5, wmSize: 24, KF: .95, mouthY: 476, revR: 560, soft: .5,
    plan: [430, 420, 1.45], style: [430, 470, 1.28], dev: [430, 412, 300, 640],
    tiles: { cx: 430, y: 128, w: 120, h: 78, gap: 16 }, capT: 92, pill: [430, 712, 340, 62],
    tb: { b1: [720, 340], b2: [720, 380], b3: [720, 340], b4: [720, 340], w: 400, h: 52, s: 17, align: "left" } },
  duo: { W: 951, H: 669, land: true, strip: 84, icon: [475.5, 292], logo: [475.5, 282], LS: .4, wmSize: 19, KF: .78, mouthY: 388, revR: 560, soft: .5,
    plan: [250, 334, 1.0], style: [250, 386, .9], dev: [250, 345, 232, 496],
    tiles: { cx: 250, y: 110, w: 86, h: 56, gap: 12 }, capT: 82, pill: [250, 572, 272, 52],
    tb: { b1: [532, 262], b2: [532, 300], b3: [532, 262], b4: [532, 262], w: 300, h: 38, s: 14, align: "left" } },
};

/** Portrait screens use the iPhone stage, wide ones the iPad stage, and everything in between (Duo, phones on their side) the Duo stage. */
export function pickLayout(vw: number, vh: number): "phone" | "ipad" | "duo" {
  if (vw / vh < .85) return "phone";
  return vw >= 1000 ? "ipad" : "duo";
}

export const INTRO_IMAGES = [
  "/brand/smilecompose-launch-icon.png", "/dr-vik-logo.png", "/brand/dr-vik-logo-bronze.png", "/brand/smilecompose-mark.svg",
  "/onboarding/intro/p-sofia-before.webp", "/onboarding/intro/p-sofia-after.webp",
  "/onboarding/intro/case-porcelain.webp", "/onboarding/intro/case-layered.webp", "/onboarding/intro/case-single-shade.webp",
];

const SHARE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#24211E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
const BOOK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A9824A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M12 2v8l2.5-2L17 10V2"/></svg>';

const BACKDROP = `
  <div class="fli-full fli-dark" data-k="bgDark"></div>
  <div class="fli-glow" data-k="glow"></div>
  <canvas class="fli-full" data-k="dust"></canvas>
  <div class="fli-full fli-vig" data-k="vig"></div>
  <div class="fli-full fli-grain" data-k="grain"></div>
  <div class="fli-full fli-ivory" data-k="bgIvory"></div>`;

const STAGE = `
  <img class="fli-abs fli-launch-icon" data-k="launchIcon" src="/brand/smilecompose-launch-icon.png" alt="">
  <div class="fli-abs fli-launch-wm" data-k="launchWm">SMILECOMPOSE</div>
  <div class="fli-abs fli-lsig" data-k="launchSig"><span>Designed by</span><img src="/dr-vik-logo.png" alt=""></div>
  <div class="fli-card" data-k="c1">
    <svg viewBox="0 0 900 1200" preserveAspectRatio="none">
      <defs>
        <linearGradient data-k="gold" id="fli-gold" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#EBD7B4"/><stop offset="1" stop-color="#B48E58"/></linearGradient>
        <radialGradient id="fli-soft"><stop offset="0" stop-color="#fff"/><stop data-k="softStop" offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
        <mask id="fli-reveal" maskUnits="userSpaceOnUse" x="-4000" y="-4000" width="9000" height="9000"><ellipse data-k="revC" cx="480" cy="575" rx="0" ry="0" fill="url(#fli-soft)"/></mask>
        <mask id="fli-arcMask" maskUnits="userSpaceOnUse" x="-4000" y="-4000" width="9000" height="9000"><path data-k="arcM" fill="none" stroke="#fff" stroke-linecap="round"/></mask>
        <clipPath id="fli-afterClip"><rect data-k="afterR" x="900" y="0" width="900" height="1200"/></clipPath>
        <filter id="fli-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur data-k="blurD" stdDeviation="14"/></filter>
      </defs>
      <g mask="url(#fli-reveal)">
        <image data-k="photo" href="/onboarding/intro/p-sofia-before.webp" width="900" height="1200" opacity="0"/>
        <image href="/onboarding/intro/p-sofia-after.webp" width="900" height="1200" clip-path="url(#fli-afterClip)"/>
      </g>
      <path data-k="gV" fill="none" stroke-linecap="round" pathLength="100"/>
      <path data-k="gH" fill="none" stroke-linecap="round" pathLength="100"/>
      <path data-k="arcGlow" fill="none" stroke="#D8B477" stroke-linecap="round" filter="url(#fli-blur)" opacity="0"/>
      <path data-k="arc" fill="none" stroke="url(#fli-gold)" stroke-linecap="round" pathLength="100"/>
      <path data-k="rim" fill="none" stroke="rgba(26,23,20,.6)" stroke-linecap="round" pathLength="100"/>
      <g mask="url(#fli-arcMask)"><path data-k="sheen" fill="none" stroke="#FFF4DE" stroke-linecap="round" pathLength="100" stroke-dasharray="14 130" opacity="0"/></g>
      <g data-k="dots" opacity="0"></g>
      <g data-k="slider" opacity="0"><line data-k="sl" y1="0" y2="1200" stroke="#fff"/><circle data-k="sk" r="0" fill="#fff"/></g>
    </svg>
  </div>
  <div class="fli-abs fli-wm" data-k="wm"></div>
  <div class="fli-abs fli-wm fli-wm-shine" data-k="wmS">SMILECOMPOSE</div>
  <div class="fli-abs fli-sig" data-k="sig"><span>Designed by</span><img src="/brand/dr-vik-logo-bronze.png" alt=""></div>
  <div class="fli-abs fli-cap" data-k="capT">YOUR FINISHED CASES</div>
  <div class="fli-abs fli-tile" data-k="tile"><img src="/onboarding/intro/case-porcelain.webp" alt=""></div>
  <div class="fli-abs fli-tile" data-k="tile"><img src="/onboarding/intro/case-layered.webp" alt=""></div>
  <div class="fli-abs fli-tile" data-k="tile"><img src="/onboarding/intro/case-single-shade.webp" alt=""></div>
  <div class="fli-abs fli-tcap" data-k="tcap">Porcelain</div><div class="fli-abs fli-tcap" data-k="tcap">Layered</div><div class="fli-abs fli-tcap" data-k="tcap">Single shade</div>
  <svg class="fli-abs fli-flow" data-k="flow"><g data-k="flowG"></g></svg>
  <div class="fli-abs fli-pill" data-k="pill">
    <span class="fli-pill-ic">${BOOK}</span>
    <span class="fli-pill-tx"><strong>In your style</strong><small>Guided by your 3 finished cases</small></span>
    <span class="fli-sw" data-k="sw"><i data-k="swk"></i></span>
  </div>
  <div class="fli-abs fli-device" data-k="device"><div class="fli-dscreen">
    <img src="/onboarding/intro/p-sofia-before.webp" alt=""><img data-k="dAfter" src="/onboarding/intro/p-sofia-after.webp" alt="">
    <div class="fli-dline" data-k="dline"></div><div class="fli-dknob" data-k="dknob">‹›</div><div class="fli-disl"></div>
    <div class="fli-dtop">SMILECOMPOSE<small>In your style</small></div>
    <div class="fli-dlab" style="left:16px">Before</div><div class="fli-dlab" style="right:16px">After</div>
    <div class="fli-dbar"><div style="background:#C9A466">${SHARE}Share</div><div style="background:#F2EFEA">Options</div></div>
  </div></div>
  <div class="fli-abs fli-tb" data-k="b1"><div class="fli-ix">01</div><div class="fli-hl">Plan.</div><div class="fli-sub">Guides fitted to your patient’s face.</div></div>
  <div class="fli-abs fli-tb" data-k="b2"><div class="fli-ix">02</div><div class="fli-hl">Visualise, <em>in&nbsp;your&nbsp;style.</em></div><div class="fli-sub">New designs follow your contour, texture and finish.</div></div>
  <div class="fli-abs fli-tb" data-k="b3"><div class="fli-ix">03</div><div class="fli-hl">Communicate.</div><div class="fli-sub">Compare, share and present, chairside.</div></div>
  <div class="fli-abs fli-tb" data-k="b4"><div class="fli-ix">04</div><div class="fli-hl"><em>Transform.</em></div><div class="fli-sub">Help every patient see what’s possible.</div></div>`;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const eOut = (k: number) => 1 - Math.pow(1 - k, 3);
const eIn = (k: number) => k * k * k;
const eIO = (k: number) => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const eBack = (k: number, s = 1.6) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
const rise = (t: number, a: number, b: number) => eOut(seg(t, a, b));
function bez(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s, Y = (s: number) => ((ay * s + by) * s + cy) * s;
  return (x: number) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, s = x; for (let i = 0; i < 30; i++) { s = (lo + hi) / 2; if (X(s) < x) lo = s; else hi = s; } return Y(s); };
}
const brand = bez(.5, 0, .15, 1), reveal = bez(.55, 0, .45, 1);
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => lerp(v, b[i], k));
const rgba = (c: number[]) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3].toFixed(3)})`;
const lerpPose = (A: Pose, B: Pose, k: number): Pose => ({ x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k), s: Math.exp(lerp(Math.log(A.s), Math.log(B.s), k)) });
const set = (el: Element, attrs: Record<string, string | number>) => { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); };

/** Builds the intro inside `root` and returns its frame function (t in seconds) and a resize hook. */
export function mountIntro(root: HTMLElement) {
  root.innerHTML = `<div class="fli-backdrop">${BACKDROP}</div><div class="fli-stage" data-k="stage">${STAGE}</div>`;
  const all = (k: string) => [...root.querySelectorAll<HTMLElement>(`[data-k="${k}"]`)];
  const q = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
  const st = (el: HTMLElement, o: Partial<CSSStyleDeclaration>) => Object.assign(el.style, o);

  let key = pickLayout(window.innerWidth, window.innerHeight);
  let L = LAYOUTS[key];
  let OXF = 0, OYF = 0, LP = { v: [] as Pt[], h: [] as Pt[], arc: [] as Pt[] };
  let scale = 1, offX = 0, offY = 0;
  const CW = 230, CH = 307, KC = CW / 900;
  const LOGO = { v: [[512, 251.5], [512, 856.5]] as Pt[], h: [[270, 481.5], [755, 481.5]] as Pt[], arc: [[215, 431.5], [336.5, 769], [687.5, 769], [809, 431.5]] as Pt[] };
  const FACE = { v: [[476, 150], [476, 840]] as Pt[], h: [[300, 380], [652, 380]] as Pt[], arc: [[395, 553], [434, 605], [549, 605], [588, 550]] as Pt[] };
  const NS = "http://www.w3.org/2000/svg";
  const dots = [FACE.arc[0], FACE.arc[3], [380, 382], [562, 378]].map(p => { const c = document.createElementNS(NS, "circle"); set(c, { cx: p[0], cy: p[1], fill: "#F6E7C8" }); q("dots").appendChild(c); return c; });
  const flows = [0, 1, 2].map(() => { const p = document.createElementNS(NS, "path"); set(p, { fill: "none", stroke: "#C9A466", "stroke-linecap": "round", pathLength: 100, "stroke-width": 1.2 }); q("flowG").appendChild(p); return p; });
  q("wm").innerHTML = [..."SMILECOMPOSE"].map(c => `<span>${c}</span>`).join("");
  const wmLetters = [...q("wm").querySelectorAll<HTMLElement>("span")];
  const tiles = all("tile"), tcaps = all("tcap");
  const tileX = (i: number) => L.tiles.cx + (i - 1) * (L.tiles.w + L.tiles.gap);

  // Grain texture and dust motes, generated once.
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  { const c = document.createElement("canvas"); c.width = c.height = 220; const x = c.getContext("2d");
    if (x) { const d = x.createImageData(220, 220); for (let i = 0; i < d.data.length; i += 4) { const v = rnd() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } x.putImageData(d, 0, 0);
      st(q("grain"), { backgroundImage: `url(${c.toDataURL()})`, backgroundSize: "110px 110px" }); } }
  const dustEl = q("dust") as unknown as HTMLCanvasElement, dctx = dustEl.getContext("2d");
  let motes: { x: number; y: number; vx: number; vy: number; r: number; ph: number; tw: number; d: number }[] = [];
  let VW = 0, VH = 0;
  const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function layout() {
    VW = window.innerWidth; VH = window.innerHeight;
    key = pickLayout(VW, VH); L = LAYOUTS[key];
    root.dataset.layout = key;
    scale = Math.min(VW / L.W, VH / L.H); offX = (VW - L.W * scale) / 2; offY = (VH - L.H * scale) / 2;
    st(q("stage"), { width: L.W + "px", height: L.H + "px", transform: `translate(${offX}px,${offY}px) scale(${scale})` });
    OXF = L.W / 2 - 476 * L.KF; OYF = L.mouthY - 572 * L.KF;
    const L2P = (x: number, y: number): Pt => [((L.logo[0] + (x - 512) * L.LS) - OXF) / L.KF, ((L.logo[1] + (y - 538) * L.LS) - OYF) / L.KF];
    LP = { v: LOGO.v.map(p => L2P(...p)), h: LOGO.h.map(p => L2P(...p)), arc: LOGO.arc.map(p => L2P(...p)) };
    const a = L2P(215, 380), b = L2P(810, 700); set(q("gold"), { x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    set(q("softStop"), { offset: L.soft });
    st(q("launchIcon"), { left: L.icon[0] + "px", top: L.icon[1] + "px" });
    st(q("launchWm"), { left: "0", width: L.W + "px", top: (L.icon[1] + 72) + "px" });
    st(q("launchSig"), { left: "0", width: L.W + "px", top: (L.icon[1] + 112) + "px" });
    const markBottom = L.logo[1] + (856.5 - 538) * L.LS;
    for (const k of ["wm", "wmS"]) st(q(k), { left: "0", width: L.W + "px", top: (markBottom + 26) + "px", fontSize: L.wmSize + "px" });
    st(q("sig"), { left: "0", width: L.W + "px", top: (markBottom + 26 + L.wmSize * 1.2 + 16) + "px" });
    const T = L.tiles;
    tiles.forEach((el, i) => st(el, { width: T.w + "px", height: T.h + "px", left: (tileX(i) - T.w / 2) + "px", top: T.y + "px" }));
    tcaps.forEach((el, i) => st(el, { width: (T.w + 20) + "px", left: (tileX(i) - T.w / 2 - 10) + "px", top: (T.y + T.h + 8) + "px" }));
    st(q("capT"), { left: (T.cx - 200) + "px", width: "400px", top: L.capT + "px" });
    st(q("flow"), { width: L.W + "px", height: L.H + "px" });
    const [PX, PY, PW, PH] = L.pill; st(q("pill"), { left: (PX - PW / 2) + "px", top: (PY - PH / 2) + "px", width: PW + "px", height: PH + "px" });
    const [DX, DY, DW, DH] = L.dev; st(q("device"), { left: (DX - DW / 2) + "px", top: (DY - DH / 2) + "px", width: DW + "px", height: DH + "px" });
    for (const id of ["b1", "b2", "b3", "b4"] as const) {
      const [x, y] = L.tb[id]; const el = q(id);
      st(el, { left: x + "px", top: y + "px", width: L.tb.w + "px", textAlign: L.tb.align });
      st(el.querySelector<HTMLElement>(".fli-hl")!, { fontSize: L.tb.h + "px" }); st(el.querySelector<HTMLElement>(".fli-sub")!, { fontSize: L.tb.s + "px", marginTop: (L.tb.h * .3) + "px" });
    }
    st(q("glow"), { left: (offX + L.logo[0] * scale) + "px", top: (offY + L.logo[1] * scale) + "px" });
    const dpr = Math.min(2, window.devicePixelRatio || 1); dustEl.width = VW * dpr; dustEl.height = VH * dpr; dctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed = 11; motes = [...Array(Math.round(VW * VH / 7000))].map(() => ({ x: rnd() * VW, y: rnd() * VH, vx: (rnd() - .5) * 6, vy: -(3 + rnd() * 9), r: .5 + rnd() * 1.5, ph: rnd() * 6.28, tw: .6 + rnd() * 1.6, d: rnd() }));
  }
  layout();

  function drawDust(t: number, vis: number) {
    if (!dctx) return;
    dctx.clearRect(0, 0, VW, VH); if (vis <= .01) return;
    dctx.globalCompositeOperation = "lighter";
    for (const m of motes) {
      const x = ((m.x + m.vx * t) % VW + VW) % VW, y = ((m.y + m.vy * t) % VH + VH) % VH;
      const a = vis * (.18 + .5 * (.5 + .5 * Math.sin(m.ph + t * m.tw))) * (.4 + .6 * m.d);
      dctx.fillStyle = `rgba(240,212,160,${(a * .55).toFixed(3)})`; dctx.beginPath(); dctx.arc(x, y, m.r * 1.6, 0, 6.283); dctx.fill();
    }
  }
  const line = (p: Pt[]) => `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}L${p[1][0].toFixed(1)} ${p[1][1].toFixed(1)}`;
  const cub = (p: Pt[]) => `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}C${p.slice(1).map(v => v[0].toFixed(1) + " " + v[1].toFixed(1)).join(" ")}`;
  const mp = (A: Pt[], B: Pt[], k: number): Pt[] => A.map((p, i) => [lerp(p[0], B[i][0], k), lerp(p[1], B[i][1], k)]);

  function render(t: number) {
    const ix = offX + L.icon[0] * scale, iy = offY + L.icon[1] * scale;
    // 0 · Launch screen, then the dark opens from behind the icon
    const R = lerp(0, Math.hypot(VW, VH), reveal(seg(t, .5, 1.35)));
    const clip = `circle(${R.toFixed(1)}px at ${ix.toFixed(1)}px ${iy.toFixed(1)}px)`;
    st(q("bgDark"), { clipPath: clip, webkitClipPath: clip } as Partial<CSSStyleDeclaration>);
    const li = seg(t, .78, 1.15);
    st(q("launchIcon"), { opacity: String(1 - eOut(li)), transform: `scale(${1 + .14 * eOut(li)})` });
    q("launchWm").style.opacity = String(1 - eOut(seg(t, .5, .8)));
    q("launchSig").style.opacity = String(1 - seg(t, .45, .72));
    const ivory = eIO(seg(t, 5.5, 6.5));
    q("bgIvory").style.opacity = String(ivory);
    q("glow").style.opacity = String((.25 + .75 * eOut(seg(t, 1.8, 3.2))) * (R > 0 ? 1 : 0) * (1 - seg(t, 3.9, 4.6)));

    // 1 · The mark, centre stage, with the name and Designed by Dr Vik
    wmLetters.forEach((s, i) => { const k = eOut(seg(t, 2.0 + i * .05, 2.6 + i * .05)); s.style.opacity = String(k); s.style.transform = `translateY(${(1 - k) * 10}px)`; });
    const wOut = eIn(seg(t, 3.95, 4.3));
    q("wm").style.opacity = String(1 - wOut);
    const ws = seg(t, 3.0, 3.9); st(q("wmS"), { backgroundPosition: `${lerp(100, 0, ws)}% 0`, opacity: String((ws > 0 && ws < 1 ? 1 : 0) * (1 - wOut)) });
    const sk = rise(t, 2.9, 3.5); st(q("sig"), { opacity: String(sk * (1 - wOut)), transform: `translateY(${(1 - sk) * 8 + 8 * wOut}px)` });

    // The hero card: mark -> face -> Plan -> in your style -> the app
    const m = eIO(seg(t, 4.0, 5.1));
    const push = 1 + .04 * eIO(seg(t, 4.5, 5.45));
    const mouth = [476 * L.KF + OXF, 572 * L.KF + OYF], c0 = [450 * L.KF + OXF, 600 * L.KF + OYF];
    const faceP: Pose = { x: mouth[0] + (c0[0] - mouth[0]) * push, y: mouth[1] + (c0[1] - mouth[1]) * push, s: L.KF / KC * push };
    let hp = lerpPose(faceP, { x: L.plan[0], y: L.plan[1], s: L.plan[2] }, eIO(seg(t, 5.45, 6.35)));
    hp = lerpPose(hp, { x: L.style[0], y: L.style[1], s: L.style[2] }, eIO(seg(t, 7.5, 8.3)));
    hp.s *= lerp(1, 1.1, eIO(seg(t, 12.3, 13.0)));
    const c1 = q("c1");
    st(c1, { transform: `translate(${(hp.x - CW / 2).toFixed(2)}px,${(hp.y - CH / 2).toFixed(2)}px) scale(${hp.s.toFixed(4)})`, opacity: String(1 - seg(t, 12.4, 12.9)),
      boxShadow: `0 24px 60px rgba(36,33,30,${(.2 * seg(hp.s / L.plan[2], 2.2, 1.15)).toFixed(3)})` });
    const unit = KC * hp.s, px = (v: number) => v / unit, thin = Math.sqrt(Math.min(1, unit / L.KF));
    const dV = eOut(seg(t, .95, 1.65)), dH = eOut(seg(t, 1.1, 1.8)), dA = brand(seg(t, 1.45, 2.65)), dR = eOut(seg(t, 2.4, 3.1));
    const gOut = 1 - seg(t, 7.4, 7.8);
    const lc = rgba(mix([140, 127, 113, .62], [250, 246, 238, .85], m));
    set(q("gV"), { d: line(mp(LP.v, FACE.v, m)) }); set(q("gH"), { d: line(mp(LP.h, FACE.h, m)) });
    for (const [k, d] of [["gV", dV], ["gH", dH]] as const) set(q(k), { stroke: lc, opacity: gOut, "stroke-width": px(lerp(17 * L.LS, 1.4 * thin, Math.min(1, m * 1.3))), "stroke-dasharray": "100 200", "stroke-dashoffset": 101 - 101 * d });
    const arcPts = mp(LP.arc, FACE.arc, m), arcD = cub(arcPts), aw = px(lerp(82 * L.LS, 2.6 * thin, Math.min(1, m * 1.35)));
    set(q("arc"), { d: arcD, "stroke-width": aw, "stroke-dasharray": "100 200", "stroke-dashoffset": 101 - 101 * dA, opacity: gOut });
    const sh = seg(t, 2.95, 3.9), shA = sh > 0 && sh < 1 ? Math.min(1, sh / .08) * Math.min(1, (1 - sh) / .3) : 0;
    set(q("arcGlow"), { d: arcD, "stroke-width": aw * 1.25, opacity: (.36 * eOut(seg(t, 2.2, 3.0)) + .25 * Math.sin(Math.PI * sh)) * (1 - seg(t, 3.9, 4.5)) });
    set(q("blurD"), { stdDeviation: px(16) });
    set(q("rim"), { d: cub(arcPts.map(p => [p[0], p[1] - px(36 * L.LS) * (1 - m)] as Pt)), "stroke-width": px(1), "stroke-dasharray": "100 200", "stroke-dashoffset": 101 - 101 * dR, opacity: 1 - seg(t, 4.0, 4.4) });
    set(q("arcM"), { d: arcD, "stroke-width": aw });
    set(q("sheen"), { d: arcD, "stroke-width": aw, "stroke-dashoffset": lerp(20, -110, sh), opacity: .5 * shA });
    const dk = eBack(seg(t, 5.05, 5.4), 2);
    set(q("dots"), { opacity: seg(t, 5.05, 5.15) * gOut });
    dots.forEach(c => set(c, { r: px(3.4 * thin) * Math.max(0, dk), fill: ivory > .5 ? "#C9A466" : "#F6E7C8" }));
    set(q("photo"), { opacity: eOut(seg(t, 4.25, 4.8)) });
    const rv = seg(t, 4.3, 5.25), rr = lerp(0, L.revR, eIn(rv) * .6 + rv * .4), big = 1500 * eIO(seg(t, 5.45, 6.1));
    set(q("revC"), { rx: rr * (L.land ? .88 : 1) + big, ry: rr * (L.land ? 1.3 : 1) + big });

    // 01 · Plan
    const fadeBlock = (k: string, a: number, b: number, c: number, d: number) => { const r = rise(t, a, b); st(q(k), { opacity: String(r * (1 - seg(t, c, d))), transform: `translateY(${(1 - r) * 14}px)` }); };
    fadeBlock("b1", 6.0, 6.6, 7.3, 7.6);

    // 02 · Visualise, in your style
    const tin = (i: number) => rise(t, 8.0 + i * .14, 8.6 + i * .14), tout = 1 - seg(t, 12.1, 12.5);
    q("capT").style.opacity = String(rise(t, 7.9, 8.4) * tout);
    tiles.forEach((el, i) => { const k = tin(i); st(el, { opacity: String(k * tout), transform: `translateY(${(1 - k) * 18}px) scale(${lerp(.94, 1, k)})` }); });
    tcaps.forEach((el, i) => { el.style.opacity = String(tin(i) * tout); });
    const mo = [hp.x + 40 * unit, hp.y - 25 * unit];
    flows.forEach((p, i) => {
      const sx = tileX(i), sy = L.tiles.y + L.tiles.h + 28, mx = mo[0] + (i - 1) * 22 * hp.s, my = mo[1] - 6;
      const d = eIO(seg(t, 8.8 + i * .1, 9.6 + i * .1));
      set(p, { d: `M${sx} ${sy}C${sx} ${(sy + my) / 2} ${mx} ${(sy + my) / 2 - 30} ${mx} ${my}`, "stroke-dasharray": d < 1 ? "100 200" : "2 5", "stroke-dashoffset": d < 1 ? 101 - 101 * d : -t * 18, opacity: .85 * seg(t, 8.8, 8.95) * (1 - seg(t, 11.2, 11.8)) });
    });
    const pk = rise(t, 9.1, 9.6); st(q("pill"), { opacity: String(pk * tout), transform: `translateY(${(1 - pk) * 10}px)` });
    const on = eIO(seg(t, 9.5, 9.8));
    q("sw").style.background = rgba(mix([221, 216, 208, 1], [201, 164, 102, 1], on)); q("swk").style.transform = `translateX(${18 * on}px)`;
    const lxp = lerp(900, 450, eIO(seg(t, 9.9, 11.0)));
    set(q("afterR"), { x: lxp });
    set(q("slider"), { opacity: seg(t, 9.8, 9.95) * (1 - seg(t, 12.3, 12.5)) });
    set(q("sl"), { x1: lxp, x2: lxp, "stroke-width": px(2) }); set(q("sk"), { cx: lxp, cy: 820, r: px(12) });
    fadeBlock("b2", 10.1, 10.8, 12.0, 12.3);

    // 03 · Communicate and 04 · Transform, on the app's result screen
    const dv = eOut(seg(t, 12.4, 13.2)), dOut = seg(t, 16.2, 16.8);
    const dsw = t >= 15.0 ? lerp(50, 4, eIO(seg(t, 15.0, 15.9))) : 50 + 20 * Math.sin(Math.PI * 2 * seg(t, 13.3, 14.9)) * seg(t, 13.3, 13.6);
    st(q("dAfter"), { clipPath: `inset(0 0 0 ${dsw}%)`, webkitClipPath: `inset(0 0 0 ${dsw}%)` } as Partial<CSSStyleDeclaration>);
    q("dline").style.left = dsw + "%"; q("dknob").style.left = dsw + "%";
    st(q("device"), { opacity: String(dv * (1 - dOut)), transform: `scale(${lerp(.9, 1, dv) * lerp(1, .96, dOut)}) translateY(${(1 - dv) * 16}px)` });
    fadeBlock("b3", 12.9, 13.6, 14.8, 15.1);
    fadeBlock("b4", 15.1, 15.8, 16.1, 16.5);

    // Atmosphere
    const darkK = (R > 0 ? 1 : 0) * (1 - ivory);
    drawDust(t, darkK * seg(t, 1.0, 1.8) * (1 - seg(t, 4.2, 4.7)));
    const f = Math.round(t * 30);
    st(q("grain"), { opacity: (.075 * darkK).toFixed(3), backgroundPosition: `${(hash(f) * 110) | 0}px ${(hash(f + 3.3) * 110) | 0}px` });
    q("vig").style.opacity = String(darkK);
    // The whole intro lifts away to reveal Welcome.
    root.style.opacity = String(1 - eIO(seg(t, 16.35, INTRO_END)));
    return { statusLight: R > iy && t < 5.9 };
  }
  return { render, layout };
}
