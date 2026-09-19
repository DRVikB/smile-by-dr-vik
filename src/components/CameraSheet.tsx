"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Minus, Plus, X } from "lucide-react";
import { SMILE_GUIDE, type Photo } from "@/lib/types";
import { preparePhoto } from "@/lib/photos";
import { zoomedCrop } from "@/lib/capture";
import { clampPan, zoomAbout, IDENTITY, type ZoomState } from "./ZoomPan";

type Facing = "environment" | "user";

// The front camera's field of view reads a patient as small at a natural
// arm's length distance — noticeably wider than the framing the native
// camera app shows by default — so it starts pre-zoomed further than the
// back camera ever needs to.
const DEFAULT_ZOOM: Record<Facing, ZoomState> = {
  user: { scale: 1.85, x: 0, y: 0 },
  environment: IDENTITY,
};
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.35;

export function CameraSheet({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (photo: Photo) => void | Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [light, setLight] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomState>(DEFAULT_ZOOM.environment);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    let stream: MediaStream | undefined;
    const element = video.current;
    setReady(false);
    setError("");
    // A camera swap has a different field of view, so any zoom the
    // clinician dialled in for the other camera no longer applies.
    setZoom(DEFAULT_ZOOM[facing]);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error();
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play();
          if (active) setReady(video.current.videoWidth > 0);
        }
      } catch {
        if (active)
          setError(
            "Camera access isn’t available. You can use your device camera or upload a photo instead.",
          );
      }
    }
    void start();
    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
      if (element) element.srcObject = null;
    };
  }, [facing]);
  useEffect(() => {
    if (!ready) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const timer = setInterval(() => {
      const v = video.current;
      if (!v || !ctx || !v.videoWidth) return;
      try {
        ctx.drawImage(v, 0, 0, 32, 32);
        const { data } = ctx.getImageData(0, 0, 32, 32);
        let total = 0;
        for (let i = 0; i < data.length; i += 4)
          total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        setLight(total / (data.length / 4));
      } catch {
        setLight(null);
      }
    }, 700);
    return () => clearInterval(timer);
  }, [ready]);

  function stageSize() {
    const box = stage.current?.getBoundingClientRect();
    return { w: box?.width ?? 0, h: box?.height ?? 0 };
  }

  function adjustZoom(delta: number) {
    const { w, h } = stageSize();
    setZoom((z) => clampPan(zoomAbout(z, z.scale + delta, 0, 0, MAX_ZOOM), w, h));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!ready) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: zoom.scale,
      };
    }
    if (zoom.scale > 1 || pointers.current.size === 2) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.stopPropagation();
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const previous = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance <= 0) return;
      const box = stage.current!.getBoundingClientRect();
      const midX = (a.x + b.x) / 2 - box.left - box.width / 2;
      const midY = (a.y + b.y) / 2 - box.top - box.height / 2;
      // The front camera's preview is mirrored for a natural, look-in-a-mirror
      // feel (see the render below), so a touch point's on-screen x has to be
      // flipped back before it is used to zoom the unmirrored underlying video.
      const pinchX = facing === "user" ? -midX : midX;
      const next = (distance / pinch.current.distance) * pinch.current.scale;
      const { w, h } = stageSize();
      setZoom((z) => clampPan(zoomAbout(z, next, pinchX, midY, MAX_ZOOM), w, h));
      e.stopPropagation();
      return;
    }

    if (pointers.current.size === 1 && zoom.scale > 1) {
      const { w, h } = stageSize();
      const dx = e.clientX - previous.x;
      setZoom((z) =>
        clampPan(
          {
            ...z,
            x: z.x + (facing === "user" ? -dx : dx),
            y: z.y + (e.clientY - previous.y),
          },
          w,
          h,
        ),
      );
      e.stopPropagation();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasTracked = pointers.current.has(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!wasTracked) return;

    const now = Date.now();
    if (now - lastTap.current < 320) {
      const { w, h } = stageSize();
      setZoom((z) =>
        z.scale > 1 ? DEFAULT_ZOOM[facing] : clampPan(zoomAbout(z, 2.5, 0, 0, MAX_ZOOM), w, h),
      );
      lastTap.current = 0;
      e.stopPropagation();
    } else lastTap.current = now;
  }

  async function capture() {
    if (!video.current || !stage.current || !ready) return;
    setBusy(true);
    try {
      const v = video.current;
      const box = stage.current.getBoundingClientRect();
      const { sx, sy, sw, sh } = zoomedCrop(
        v.videoWidth,
        v.videoHeight,
        box.width,
        box.height,
        zoom,
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error())),
          "image/jpeg",
          0.95,
        ),
      );
      const photo = await preparePhoto(
        new File([blob], "smile-photo.jpg", { type: "image/jpeg" }),
      );
      await onCapture({ ...photo, framing: SMILE_GUIDE });
    } catch {
      setError("We couldn’t capture that photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const zoomed = zoom.scale > 1.03;
  const hint =
    light !== null && light < 60
      ? "A little more light on the face would help"
      : light !== null && light > 215
        ? "Very bright — try moving out of direct light"
        : facing === "user"
          ? "Line the smile up inside the box — pinch or use +/− to zoom in"
          : "Line the smile up inside the box, or pinch to fine-tune";

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="camera-sheet"
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const nodes = sheet.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not([type="file"]):not(:disabled)',
            );
            if (!nodes?.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === sheet.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === sheet.current)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="sheet-heading">
          <div>
            <h2 id="camera-title">A natural starting point.</h2>
            <p>Look straight ahead and smile.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close camera"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Camera selection">
          <button type="button" disabled={busy} aria-pressed={facing === "environment"}
            className={facing === "environment" ? "selected" : ""}
            onClick={() => { if (facing !== "environment") { setReady(false); setFacing("environment"); } }}>Back camera</button>
          <button type="button" disabled={busy} aria-pressed={facing === "user"}
            className={facing === "user" ? "selected" : ""}
            onClick={() => { if (facing !== "user") { setReady(false); setFacing("user"); } }}>Front camera</button>
        </div>
        <div
          className="camera-view"
          ref={stage}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="camera-zoom-inner"
            style={{
              // A selfie feels wrong unmirrored, so the front camera's preview
              // is flipped for a natural look-in-a-mirror feel — purely a CSS
              // mirror of the display. The saved photo still comes straight
              // from the raw video pixels in capture() below, so it stays
              // true-to-life (unflipped) like the back camera and uploads.
              transform: `${facing === "user" ? "scaleX(-1) " : ""}translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
            }}
          >
            <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(Boolean(video.current?.videoWidth))} />
          </div>
          {!ready && (
            <span>
              <Camera size={35} strokeWidth={1.3} />
              {error ? "Camera unavailable" : "Opening your camera…"}
            </span>
          )}
          {ready && (
            <>
              <div className="capture-guide" aria-hidden="true">
                <span
                  className="capture-guide-smile"
                  style={{
                    left: `${SMILE_GUIDE.x * 100}%`,
                    top: `${SMILE_GUIDE.y * 100}%`,
                    width: `${SMILE_GUIDE.width * 100}%`,
                    height: `${SMILE_GUIDE.height * 100}%`,
                  }}
                />
              </div>
              <div
                className="camera-zoom-controls"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label="Zoom out"
                  disabled={zoom.scale <= 1.001}
                  onClick={() => adjustZoom(-ZOOM_STEP)}
                >
                  <Minus size={15} />
                </button>
                <span>{zoomed ? `${Math.round(zoom.scale * 10) / 10}×` : "1×"}</span>
                <button type="button" aria-label="Zoom in" onClick={() => adjustZoom(ZOOM_STEP)}>
                  <Plus size={15} />
                </button>
              </div>
              <p className="capture-hint" role="status">
                {hint}
              </p>
            </>
          )}
        </div>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={!ready || busy}
          onClick={() => void capture()}
        >
          <Camera size={18} />
          {busy ? "Preparing photo…" : "Take Photo"}
        </button>
        <input
          ref={nativeInput}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
          capture={facing}
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              setBusy(true);
              try {
                await onCapture(await preparePhoto(file));
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not open photo.",
                );
              } finally {
                setBusy(false);
                if (nativeInput.current) nativeInput.current.value = "";
              }
            }
          }}
        />
        <button
          className="text-button camera-fallback"
          disabled={busy}
          onClick={() => nativeInput.current?.click()}
        >
          Use device camera or photo library
        </button>
      </div>
    </div>
  );
}
