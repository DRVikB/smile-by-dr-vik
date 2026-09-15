"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import type { Photo } from "@/lib/types";
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
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    let stream: MediaStream | undefined;
    const before = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error();
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
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
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  async function capture() {
    if (!video.current || !ready) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.current.videoWidth;
      canvas.height = video.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(video.current, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error())),
          "image/jpeg",
          0.95,
        ),
      );
      await onCapture(
        await preparePhoto(
          new File([blob], "smile-photo.jpg", { type: "image/jpeg" }),
        ),
      );
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
        <div className="camera-view">
          <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(Boolean(video.current?.videoWidth))} />
          {!ready && (
            <span>
              <Camera size={35} strokeWidth={1.3} />
              {error ? "Camera unavailable" : "Opening your camera…"}
            </span>
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
          capture="user"
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
