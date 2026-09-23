"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/types";

export function EditArea({ photo, onSave, onClose }: { photo: Photo; onSave: (mask: string | undefined) => void; onClose: () => void }) {
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
  const [tool, setTool] = useState<"Paint" | "Erase" | "Move">("Paint");
  const [brush, setBrush] = useState(1.5);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(!photo.editMask);
  useEffect(() => {
    let active = true;
    requestAnimationFrame(centreView);
    void import("@/lib/face/landmarks").then((m) => m.detectFace(photo.dataUrl)).then((points) => {
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
  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-area-title">
    <section className="sheet edit-area-sheet">
      <div className="sheet-heading"><h2 id="edit-area-title">Protect the edit area</h2><button type="button" className="text-button" onClick={onClose}>Cancel</button></div>
      <p className="sheet-sub">Paint only the selected teeth and any planned additions. Leave gums, lips and untreated teeth unpainted. Everything outside your painted area is restored from the original photo.</p>
      <div className="segmented" role="group" aria-label="Edit area tool">{(["Paint", "Erase", "Move"] as const).map((t) => <button key={t} type="button" aria-pressed={tool === t} className={tool === t ? "selected" : ""} onClick={() => { last.current = null; setTool(t); }}>{t}</button>)}</div>
      <div className="edit-area-sliders"><label>Brush size<input aria-label="Brush size" type="range" min="0.25" max="5" step="0.25" value={brush} onChange={(e) => setBrush(Number(e.target.value))} /></label><label>Zoom · {zoom}%<input aria-label="Edit area zoom" type="range" min="100" max="400" step="25" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label></div>
      <div ref={viewport} className="edit-area-viewport"><div className="edit-area-image" style={{ width: `${zoom}%` }}>
        <img src={photo.dataUrl} alt="Original photo: paint the teeth that may change" draggable={false} onLoad={centreView} />
        <canvas ref={canvas} width={photo.width} height={photo.height} aria-label="Paint allowed changes on the photo" style={{ touchAction: tool === "Move" ? "auto" : "none", pointerEvents: tool === "Move" ? "none" : "auto" }} onPointerDown={(e) => paint(e, true)} onPointerMove={(e) => paint(e)} onPointerUp={() => { last.current = null; }} onPointerCancel={() => { last.current = null; }} onLostPointerCapture={() => { last.current = null; }} />
      </div></div>
      <p className="control-hint">Use Zoom for detail and Move to scroll the photo. Include the space for an intended edge addition or gap closure. The area applies to your next generation. This is your boundary, not automatic tooth detection. Review it whenever the selected teeth or goal changes.</p>
      {error && <p role="alert">{error}</p>}
      <div className="edit-area-actions"><button type="button" className="text-button" disabled={!ready} onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, photo.width, photo.height); setError(""); }}>Clear paint</button><button type="button" className="text-button" onClick={() => onSave(undefined)}>Remove edit area</button><button type="button" className="primary-button" disabled={!ready} onClick={save}>Use this edit area</button></div>
    </section>
  </div>;
}
