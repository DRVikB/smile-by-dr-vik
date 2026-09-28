"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageIcon, Trash2 } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { pickImage } from "@/lib/pickImage";
import { UserAvatar } from "./UserAvatar";

const OUTPUT = 512;
const VIEW = 280;

/**
 * Add / change / remove the profile photo: a native-style action sheet
 * (Take Photo, Choose Photo, Remove Photo, Cancel), then a simple circular
 * crop with zoom and drag. Produces a 512 × 512 JPEG; nothing larger is stored.
 */
export function ProfilePhotoEditor({ onClose, onSaved }: { onClose: () => void; onSaved?: (message: string) => void }) {
  const { avatarUrl, initials, setAvatar } = useAccount();
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(from: "camera" | "library") {
    setError("");
    try {
      const [file] = await pickImage(from, { facing: "user" });
      if (!file) return;
      const { preparePhoto } = await import("@/lib/photos");
      const photo = await preparePhoto(file);
      const img = new Image();
      img.src = photo.dataUrl;
      await img.decode();
      setSource(img);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo couldn’t be opened.");
    }
  }

  async function save(image: string | null, message: string) {
    setBusy(true);
    setError("");
    try {
      await setAvatar(image);
      onSaved?.(message);
      onClose();
    } catch {
      setError("Your profile photo couldn’t be saved. Check your connection and try again.");
      setBusy(false);
    }
  }

  // Portalled: an animated ancestor (onboarding, Settings) would otherwise contain the fixed backdrop.
  return createPortal(
    <div className="action-sheet-backdrop" onClick={() => !busy && onClose()}>
      {source ? (
        <AvatarCropper image={source} busy={busy} error={error} onCancel={() => setSource(null)}
          onDone={image => void save(image, "Profile photo updated.")} />
      ) : (
        <div className="action-sheet" role="dialog" aria-modal="true" aria-label="Profile photo" onClick={e => e.stopPropagation()}>
          <div className="action-sheet-group">
            <div className="action-sheet-header">
              <UserAvatar initials={initials} url={avatarUrl} size="medium" />
              <span>Profile photo</span>
            </div>
            <button type="button" onClick={() => void choose("camera")} disabled={busy}><Camera size={18} strokeWidth={1.7} aria-hidden="true" />Take Photo</button>
            <button type="button" onClick={() => void choose("library")} disabled={busy}><ImageIcon size={18} strokeWidth={1.7} aria-hidden="true" />Choose Photo</button>
            {avatarUrl && <button type="button" className="destructive" onClick={() => void save(null, "Profile photo removed.")} disabled={busy}><Trash2 size={18} strokeWidth={1.7} aria-hidden="true" />Remove Photo</button>}
          </div>
          {error && <p className="action-sheet-error" role="alert">{error}</p>}
          <div className="action-sheet-group">
            <button type="button" className="cancel" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function AvatarCropper({ image, busy, error, onCancel, onDone }: {
  image: HTMLImageElement;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const w = image.naturalWidth, h = image.naturalHeight;
  const base = VIEW / Math.min(w, h);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const scale = base * zoom;

  const clamp = useCallback((x: number, y: number, s: number) => {
    const maxX = Math.max(0, (w * s - VIEW) / 2), maxY = Math.max(0, (h * s - VIEW) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }, [w, h]);
  useEffect(() => setOffset(o => clamp(o.x, o.y, scale)), [scale, clamp]);

  function crop(): string {
    const left = (VIEW - w * scale) / 2 + offset.x, top = (VIEW - h * scale) / 2 + offset.y;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, -left / scale, -top / scale, VIEW / scale, VIEW / scale, 0, 0, OUTPUT, OUTPUT);
    return canvas.toDataURL("image/jpeg", 0.86);
  }

  return (
    <div className="avatar-cropper" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title" onClick={e => e.stopPropagation()}>
      <h2 id="avatar-crop-title">Move and scale</h2>
      <div className="avatar-crop-view" style={{ width: VIEW, height: VIEW }}
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; }}
        onPointerMove={e => { const d = drag.current; if (d) setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y, scale)); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}>
        <img src={image.src} alt="" draggable={false} style={{
          width: w * scale, height: h * scale,
          transform: `translate(${(VIEW - w * scale) / 2 + offset.x}px, ${(VIEW - h * scale) / 2 + offset.y}px)`,
        }} />
        <span className="avatar-crop-mask" aria-hidden="true" />
      </div>
      <label className="avatar-crop-zoom">
        <span className="sr-only">Zoom</span>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} aria-label="Zoom" />
      </label>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="avatar-crop-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Back</button>
        <button type="button" className="primary-button" onClick={() => onDone(crop())} disabled={busy}>{busy ? "Saving…" : "Use Photo"}</button>
      </div>
    </div>
  );
}
