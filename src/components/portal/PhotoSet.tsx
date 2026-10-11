"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { MAX_PHOTOS, PHOTO_SLOTS, type PhotoSlot } from "@/lib/portal";
import { photoForSlot, type SlotPhotos } from "./portalData";

const labelOf = (slot: PhotoSlot) => PHOTO_SLOTS.find(s => s.id === slot)!.label;

/**
 * The clinical photo set: eight labelled slots showing small previews. Tap an empty slot (or drop
 * photos on it) to add; tap a filled slot to view the full photo; drag one slot onto another to swap.
 * Several files dropped at once fill that slot and then the empty ones after it.
 */
export function PhotoSet({ thumbs, designThumb, layout = "strip", busy, onAdd, onSwap, onOpen }: {
  /** Small previews (or the photos themselves before they are saved). */
  thumbs: SlotPhotos;
  /** The design photo's preview, shown in the front slot when the set has no front of its own. */
  designThumb?: string;
  layout?: "strip" | "large";
  busy?: boolean;
  onAdd: (photos: Partial<Record<PhotoSlot, string>>) => void;
  onSwap: (a: PhotoSlot, b: PhotoSlot) => void;
  onOpen: (slot: PhotoSlot) => void;
}) {
  const inputs = useRef<Partial<Record<PhotoSlot, HTMLInputElement | null>>>({});
  const [over, setOver] = useState<PhotoSlot | null>(null);
  const [error, setError] = useState("");

  async function place(files: File[], start: PhotoSlot) {
    setError("");
    const images = files.filter(f => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, MAX_PHOTOS);
    if (!images.length) { setError("Choose a photo (JPEG, PNG or HEIC)."); return; }
    const order = PHOTO_SLOTS.map(s => s.id);
    const targets = images.length === 1 ? [start] : [start, ...order.filter(id => id !== start && !thumbs[id] && !(id === "front" && designThumb))].slice(0, images.length);
    const added: Partial<Record<PhotoSlot, string>> = {};
    try {
      for (let i = 0; i < targets.length; i++) added[targets[i]] = await photoForSlot(images[i]);
      onAdd(added);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo couldn’t be added.");
    }
  }

  return <div className={`pt-set pt-set-${layout}`}>
    {PHOTO_SLOTS.map(({ id, label }) => {
      const src = thumbs[id] ?? (id === "front" ? designThumb : undefined);
      return <div key={id}
        className={`pt-slot${src ? " filled" : ""}${id === "front" ? " key" : ""}${over === id ? " over" : ""}`}
        role="button" tabIndex={0} aria-label={src ? `${label}: view photo` : `${label}: add photo`}
        draggable={Boolean(thumbs[id])}
        onClick={() => { if (busy) return; if (src) onOpen(id); else inputs.current[id]?.click(); }}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (src) onOpen(id); else inputs.current[id]?.click(); } }}
        onDragStart={e => e.dataTransfer.setData("text/x-photo-slot", id)}
        onDragOver={e => { e.preventDefault(); setOver(id); }}
        onDragLeave={() => setOver(current => (current === id ? null : current))}
        onDrop={e => {
          e.preventDefault(); setOver(null);
          const from = e.dataTransfer.getData("text/x-photo-slot") as PhotoSlot;
          if (from && from !== id) { onSwap(from, id); return; }
          if (e.dataTransfer.files.length) void place([...e.dataTransfer.files], id);
        }}>
        {src ? <>
          <img src={src} alt="" draggable={false} />
          {id === "front" && <span className="pt-design">Design</span>}
          <span className="pt-cap">{label}</span>
        </> : <span className="pt-empty"><b><Plus size={15} /></b>{label}{id === "front" && <small>Used for the design</small>}</span>}
        <input ref={el => { inputs.current[id] = el; }} type="file" accept="image/*,.heic,.heif" multiple hidden
          onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) void place(files, id); }} />
      </div>;
    })}
    {error && <p className="error-message pt-set-error" role="alert">{error}</p>}
  </div>;
}

/** Full-screen view of one photo from the set, with replace, remove and previous/next. */
export function PhotoViewer({ slot, filled, load, onClose, onReplace, onRemove, onMove }: {
  slot: PhotoSlot;
  /** Filled slots in order, for previous/next. */
  filled: PhotoSlot[];
  load: (slot: PhotoSlot) => Promise<string | null>;
  onClose: () => void;
  onReplace?: (slot: PhotoSlot, photo: string) => void;
  /** Absent for the design photo, which belongs to the design. */
  onRemove?: (slot: PhotoSlot) => void;
  onMove: (slot: PhotoSlot) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const input = useRef<HTMLInputElement>(null);
  // Load once per slot, not on every render of the parent.
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let cancelled = false;
    setState("loading"); setSrc(null);
    loader.current(slot).then(url => { if (!cancelled) { setSrc(url); setState(url ? "ready" : "missing"); } }, () => { if (!cancelled) setState("missing"); });
    return () => { cancelled = true; };
  }, [slot]);
  const at = filled.indexOf(slot);
  const prev = at > 0 ? filled[at - 1] : null, next = at >= 0 && at < filled.length - 1 ? filled[at + 1] : null;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && prev) onMove(prev);
      if (e.key === "ArrowRight" && next) onMove(next);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, onMove, prev, next]);
  return <div className="pt-viewer" role="dialog" aria-modal="true" aria-label={labelOf(slot)} onClick={onClose}>
    <div className="pt-viewer-top" onClick={e => e.stopPropagation()}>
      <span>{labelOf(slot)}{filled.length > 1 && <small> · {at + 1} of {filled.length}</small>}</span>
      <span className="pt-viewer-actions">
        {onReplace && <button type="button" onClick={() => input.current?.click()}><RefreshCw size={15} />Replace</button>}
        {onRemove && <button type="button" onClick={() => { onRemove(slot); onClose(); }}><Trash2 size={15} />Remove</button>}
        <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
      </span>
    </div>
    <div className="pt-viewer-stage" onClick={e => e.stopPropagation()}>
      {prev && <button type="button" className="pt-viewer-nav prev" aria-label="Previous photo" onClick={() => onMove(prev)}><ChevronLeft size={22} /></button>}
      {state === "ready" && src ? <img src={src} alt={labelOf(slot)} />
        : <p className="pt-viewer-msg">{state === "loading" ? "Loading the full photo…" : "This photo isn’t available on this device yet. Check your connection and try again."}</p>}
      {next && <button type="button" className="pt-viewer-nav next" aria-label="Next photo" onClick={() => onMove(next)}><ChevronRight size={22} /></button>}
    </div>
    <input ref={input} type="file" accept="image/*,.heic,.heif" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (file && onReplace) { const photo = await photoForSlot(file); setSrc(photo); setState("ready"); onReplace(slot, photo); }
    }} />
  </div>;
}
