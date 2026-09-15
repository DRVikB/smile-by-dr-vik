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
}: {
  photo: Photo | null;
  onPhoto: (photo: Photo) => void;
  onContinue: () => void;
  onCamera: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  async function receive(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onPhoto(await preparePhoto(file));
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
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
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
        <div className="selected-photo">
          <img src={photo.dataUrl} alt="Selected patient photo" />
          <div>
            <span className="selected-title">Your photo is ready</span>
            <span>{photo.isSample ? "Sample photograph" : photo.name}</span>
          </div>
          <button
            className="icon-button"
            aria-label="Choose another photo"
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={20} />
          </button>
        </div>
      ) : (
        <button
          className={`capture-card ${dragging ? "dragging" : ""}`}
          onClick={onCamera}
          disabled={busy}
        >
          <span className="camera-symbol">
            <Camera strokeWidth={1.5} size={28} />
          </span>
          <span>
            <strong>Take Photo</strong>
            <span>Capture a natural, front-facing smile</span>
          </span>
          <ArrowRight size={20} />
        </button>
      )}
      <button
        className="upload-button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Upload size={18} />
        )}{" "}
        {busy
          ? "Preparing your photo…"
          : photo
            ? "Choose another photo"
            : "Upload Photo"}
      </button>
      <p className="file-hint">JPG, PNG or HEIC · Up to 25 MB</p>
      {error && (
        <p className="error-message" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </p>
      )}
      <button
        className="primary-button continue-button"
        disabled={!photo || busy}
        onClick={onContinue}
      >
        Continue <ArrowRight size={18} />
      </button>
    </div>
  );
}
