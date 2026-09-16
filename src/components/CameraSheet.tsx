"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { SMILE_GUIDE, type Photo } from "@/lib/types";
import { preparePhoto } from "@/lib/photos";
export function CameraSheet({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (photo: Photo) => void | Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [light, setLight] = useState<number | null>(null);
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

  async function capture() {
    if (!video.current || !ready) return;
    setBusy(true);
    try {
      const v = video.current;
      // Crop to what the guide actually showed, so the framing the clinician
      // lined up is the framing that reaches the model.
      const box = v.getBoundingClientRect();
      const shown = box.width && box.height ? box.width / box.height : 3 / 4;
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      let sw = vw;
      let sh = vh;
      let sx = 0;
      let sy = 0;
      if (vw / vh > shown) {
        sw = vh * shown;
        sx = (vw - sw) / 2;
      } else {
        sh = vw / shown;
        sy = (vh - sh) / 2;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
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
        <div className="camera-view">
          <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(Boolean(video.current?.videoWidth))} />
          {!ready && (
            <span>
              <Camera size={35} strokeWidth={1.3} />
              {error ? "Camera unavailable" : "Opening your camera…"}
            </span>
          )}
          {ready && (
            <>
              <div className="capture-guide" aria-hidden="true">
                <span className="capture-guide-face" />
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
              <p className="capture-hint" role="status">
                {light !== null && light < 60
                  ? "A little more light on the face would help"
                  : light !== null && light > 215
                    ? "Very bright — try moving out of direct light"
                    : "Line the smile up inside the box"}
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
