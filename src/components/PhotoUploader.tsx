"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  ImagePlus,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import type { Photo } from "@/lib/types";
import { preparePhoto } from "@/lib/photos";
export function PhotoUploader({
  photo,
  onPhoto,
  onContinue,
  onCamera,
  onRemove,
}: {
  photo: Photo | null;
  onPhoto: (photo: Photo) => void | Promise<void>;
  onContinue: () => void;
  onCamera: () => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function receive(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await onPhoto(await preparePhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t open that photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div
      className="upload-controls"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void receive(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
        className="sr-only"
        aria-label="Upload patient photo"
        onChange={(e) => void receive(e.target.files?.[0])}
      />
      {photo ? (
        <>
          <div className="selected-photo">
            <img src={photo.dataUrl} alt="Selected patient photo" />
            <div>
              <span className="selected-title">Your photo is ready</span>
              <span>{photo.isSample ? "Sample photograph" : photo.name}</span>
            </div>
          </div>
          <div className="selected-photo-actions">
            <button type="button" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={16} /> Change photo</button>
            <button type="button" disabled={busy} onClick={onCamera}><Camera size={16} /> Retake</button>
            <button type="button" disabled={busy} onClick={onRemove}><X size={16} /> Remove photo</button>
          </div>
          <button
            className="continue-button"
            disabled={busy}
            onClick={onContinue}
          >
            Continue <ArrowRight size={18} strokeWidth={1.7} />
          </button>
        </>
      ) : (
        <>
          <button className="capture-card" onClick={onCamera} disabled={busy}>
            <span className="camera-symbol">
              <Camera size={19} strokeWidth={1.6} />
            </span>
            <strong>Take a Photo</strong>
          </button>
          <button
            className="upload-button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Upload size={18} strokeWidth={1.6} />
            )}
            {busy ? "Preparing…" : "Upload Photo"}
          </button>
        </>
      )}
      <p className="file-hint">JPG, PNG or HEIC · up to 25 MB</p>
      {error && (
        <p className="error-message" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </p>
      )}
    </div>
  );
}
