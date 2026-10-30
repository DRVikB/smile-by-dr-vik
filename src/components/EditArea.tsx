"use client";
import { SheetClose, SideRailLayer, useSideRail } from "@/components/sideRail/SideRail";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo, ShotType } from "@/lib/types";

/** The suggested area from the smile guide: each designed front tooth's box (between its boundaries, from its top to
 * its edge), reaching to the guide's ends when premolars are designed, and down to the lower lip for whole-mouth work. */
async function paintFromGuide(c: HTMLCanvasElement, guide: NonNullable<Photo["smileGuide"]>, suggest: { selectedTeeth: number[]; wholeMouth: boolean }): Promise<boolean> {
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  const { guideFrame } = await import("@/lib/smileDesign/frame");
  const f = guideFrame(guide);
  const FRONT = [13, 12, 11, 21, 22, 23];
  const picked = FRONT.map((fdi, k) => (suggest.wholeMouth || suggest.selectedTeeth.includes(fdi) ? k : -1)).filter(k => k >= 0);
  if (!picked.length) return false;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#35bfba";
  const box = (u0: number, u1: number, top: (u: number) => number, bottom: (u: number) => number) => {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const u = u0 + (u1 - u0) * i / 8; const [x, y] = f.toPhoto(u, top(u)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    for (let i = 8; i >= 0; i--) { const u = u0 + (u1 - u0) * i / 8; const [x, y] = f.toPhoto(u, bottom(u)); ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill();
  };
  const deeper = (bottom: (u: number) => number, top: (u: number) => number) => suggest.wholeMouth ? (u: number) => bottom(u) + (bottom(u) - top(u)) * 0.9 : bottom;
  for (const k of picked) box(f.divisions[k], f.divisions[k + 1], f.teeth[k].top, deeper(f.teeth[k].bottom, f.teeth[k].top));
  const premolars = (side: number[]) => suggest.wholeMouth || side.some(t => suggest.selectedTeeth.includes(t));
  if (premolars([14, 15]) && f.span[0] < f.divisions[0]) box(f.span[0], f.divisions[0], f.gum, deeper(f.edge, f.gum));
  if (premolars([24, 25]) && f.span[1] > f.divisions[6]) box(f.divisions[6], f.span[1], f.gum, deeper(f.edge, f.gum));
  return true;
}

export function EditArea({ photo, onSave, onClose, requiredBeforeGeneration = false, shotType, onShotTypeChange, suggest }: {
  photo: Photo; onSave: (mask: string | undefined) => void; onClose: () => void;
  requiredBeforeGeneration?: boolean; shotType?: ShotType; onShotTypeChange?: (value: ShotType) => void;
  /** The design's teeth, so a close-up's area can be suggested from the teeth found on the device. */
  suggest?: { selectedTeeth: number[]; wholeMouth: boolean };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const centre = useRef<[number, number]>([photo.width / 2, photo.height / 2]);
  const centreView = useCallback(() => {
    const view = viewport.current, c = canvas.current;
    if (!view || !c) return;
    const scale = c.getBoundingClientRect().width / photo.width;
    view.scrollLeft = Math.max(0, centre.current[0] * scale - view.clientWidth / 2);
    view.scrollTop = Math.max(0, centre.current[1] * scale - view.clientHeight / 2);
  }, [photo.width]);
  const last = useRef<[number, number] | null>(null);
  const rail = useSideRail();
  const [tool, setTool] = useState<"Paint" | "Erase" | "Move">("Paint");
  const [brush, setBrush] = useState(1.5);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(!photo.editMask);
  const [suggested, setSuggested] = useState<"none" | "finding" | "drawn" | "not-found">("none");
  // A close-up with no area yet: paint a suggestion from the teeth found on the device. It is only a
  // starting point; nothing is used until the clinician saves it.
  useEffect(() => {
    if (photo.editMask || !suggest || shotType !== "Close-up") return;
    let active = true;
    setSuggested("finding");
    void (async () => {
      const { detectToothMap } = await import("@/lib/toothMap/detect");
      const map = await detectToothMap(photo, "Close-up").catch(() => null);
      const c = canvas.current, ctx = c?.getContext("2d");
      if (!active || !c || !ctx) return;
      const teeth = (map?.teeth ?? []).filter(t => t.visible);
      const chosen = suggest.wholeMouth ? teeth : teeth.filter(t => t.fdi !== null && suggest.selectedTeeth.includes(t.fdi));
      const use = chosen.length ? chosen : teeth;
      if (!use.length) {
        // No teeth found by the tooth map: the smile guide fitted to this photo (if any) marks where they are.
        if (photo.smileGuide && await paintFromGuide(c, photo.smileGuide, suggest)) { if (active) setSuggested("drawn"); }
        else setSuggested("not-found");
        return;
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = ctx.strokeStyle = "#35bfba"; ctx.lineJoin = ctx.lineCap = "round"; ctx.lineWidth = c.width * 0.028;
      for (const t of use) {
        ctx.beginPath();
        t.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x * c.width, y * c.height) : ctx.moveTo(x * c.width, y * c.height)));
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (suggest.wholeMouth) {
        // Alignment and full arch reach the lower teeth: extend the area down to the lower lip.
        const ys = use.flatMap(t => t.outline.map(p => p[1])), xs = use.flatMap(t => t.outline.map(p => p[0]));
        const top = Math.min(...ys), bottom = Math.max(...ys), h = bottom - top;
        ctx.fillRect(Math.min(...xs) * c.width, (top + h * 0.3) * c.height, (Math.max(...xs) - Math.min(...xs)) * c.width, h * 1.1 * c.height);
      }
      setSuggested("drawn");
    })();
    return () => { active = false; };
  // Suggested once, when the sheet opens.
  }, [photo.dataUrl]);
  useEffect(() => {
    let active = true;
    requestAnimationFrame(centreView);
    void import("@/lib/face/landmarks").then((m) => active ? m.detectFace(photo.dataUrl) : null).then((points) => {
      if (!active) return;
      if (points && points.length >= 468) centre.current = [(points[13][0] + points[14][0]) / 2, (points[13][1] + points[14][1]) / 2];
      centreView();
    }).catch(() => {});
    return () => { active = false; };
  // Geometry is read from refs after the rendered zoom has changed.
  }, [photo.dataUrl, zoom, centreView]);
  useEffect(() => {
    if (!photo.editMask) return;
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) { canvas.current?.getContext("2d")?.drawImage(image, 0, 0); setReady(true); } };
    image.onerror = () => { if (active) { setError("The saved area could not be loaded. Clear it and paint again."); setReady(true); } };
    image.src = photo.editMask;
    return () => { active = false; };
  }, [photo.editMask]);
  function paint(e: React.PointerEvent<HTMLCanvasElement>, start = false) {
    if (!e.isPrimary || !ready || tool === "Move" || (!start && !last.current)) return;
    const c = canvas.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const point: [number, number] = [(e.clientX - rect.left) * c.width / rect.width, (e.clientY - rect.top) * c.height / rect.height];
    const ctx = c.getContext("2d"); if (!ctx) return;
    e.preventDefault();
    if (start) { c.setPointerCapture(e.pointerId); last.current = point; }
    ctx.globalCompositeOperation = tool === "Erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#35bfba"; ctx.fillStyle = "#35bfba"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = c.width * brush / 100;
    ctx.beginPath(); ctx.moveTo(...(last.current ?? point)); ctx.lineTo(...point); ctx.stroke();
    ctx.beginPath(); ctx.arc(...point, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    last.current = point;
  }
  function save() {
    const c = canvas.current; const ctx = c?.getContext("2d"); if (!c || !ctx) return;
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    if (!pixels.some((v, i) => i % 4 === 3 && v > 0)) { setError("Paint at least one area, or use Remove edit area."); return; }
    onSave(c.toDataURL("image/png"));
  }
  // One screen, no scrolling: the photo takes the free height, the guidance sits behind "How to mark the area",
  // and Use this edit area is a full-width button at the foot.
  const status = suggested === "finding" ? "Finding the teeth to suggest an area…"
    : suggested === "drawn" ? "Suggested from the teeth found: check it, then Paint or Erase to adjust."
      : suggested === "not-found" ? "The teeth couldn’t be found, so paint the area yourself." : "";
  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-area-title"><SideRailLayer />
    <section className="sheet edit-area-sheet">
      <div className="sheet-heading"><h2 id="edit-area-title">Protect the edit area</h2>{rail ? <SheetClose onClose={onClose} label="Cancel" /> : <button type="button" className="text-button" onClick={onClose}>Cancel</button>}</div>
      {requiredBeforeGeneration && <p className="sheet-sub edit-area-required" role="status">Mark the dental area and save it before generating. No generation has been used.</p>}
      {shotType && onShotTypeChange && <div className="segmented" role="group" aria-label="Photo type">{(["Full face", "Close-up"] as const).map(value => <button key={value} type="button" aria-pressed={shotType === value} className={shotType === value ? "selected" : ""} onClick={() => onShotTypeChange(value)}>{value}</button>)}</div>}
      <div className="edit-area-tools">
        <div className="segmented" role="group" aria-label="Edit area tool">{(["Paint", "Erase", "Move"] as const).map((t) => <button key={t} type="button" aria-pressed={tool === t} className={tool === t ? "selected" : ""} onClick={() => { last.current = null; setTool(t); }}>{t}</button>)}</div>
        <div className="edit-area-sliders"><label>Brush<input aria-label="Brush size" type="range" min="0.25" max="5" step="0.25" value={brush} onChange={(e) => setBrush(Number(e.target.value))} /></label><label>Zoom · {zoom}%<input aria-label="Edit area zoom" type="range" min="100" max="400" step="25" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label></div>
      </div>
      <div ref={viewport} className="edit-area-viewport"><div className="edit-area-image" style={{ width: `calc(min(100cqw, 100cqh * ${photo.width / Math.max(1, photo.height)}) * ${zoom / 100})` }}>
        <img src={photo.dataUrl} alt="Original photo: paint the teeth that may change" draggable={false} onLoad={centreView} />
        <canvas ref={canvas} width={photo.width} height={photo.height} aria-label="Paint allowed changes on the photo" style={{ touchAction: tool === "Move" ? "auto" : "none", pointerEvents: tool === "Move" ? "none" : "auto" }} onPointerDown={(e) => paint(e, true)} onPointerMove={(e) => paint(e)} onPointerUp={() => { last.current = null; }} onPointerCancel={() => { last.current = null; }} onLostPointerCapture={() => { last.current = null; }} />
      </div></div>
      {status && <p className="control-hint edit-area-status" role="status">{status}</p>}
      {error && <p className="edit-area-error" role="alert">{error}</p>}
      <details className="edit-area-help">
        <summary>How to mark the area</summary>
        <p>Paint only the selected teeth and any planned additions. Leave gums, lips and untreated teeth unpainted: everything outside your painted area is restored from the original photo.</p>
        <p>Include the space for an intended edge addition, gap closure or planned alignment. Use Zoom for detail and Move to scroll the photo. The area applies to your next generation and is your boundary: a suggested area is only a starting point to check. Review it whenever the selected teeth or goal changes. If the design lengthens a painted tooth a little past your edge, its new edge is kept.</p>
      </details>
      <div className="edit-area-footer">
        <div className="edit-area-secondary"><button type="button" className="text-button" disabled={!ready} onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, photo.width, photo.height); setError(""); }}>Clear paint</button><button type="button" className="text-button" onClick={() => onSave(undefined)}>Remove edit area</button></div>
        <button type="button" className="primary-button" disabled={!ready} onClick={save}>Use this edit area</button>
      </div>
    </section>
  </div>;
}
