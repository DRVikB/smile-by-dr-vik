"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import type { Photo } from "@/lib/types";
import { SMILE_GUIDE } from "@/lib/types";
import { preparePhoto } from "@/lib/photos";

const TIPS = [
  "Natural smile",
  "Good lighting",
  "Face the camera",
  "Remove sunglasses",
];

/**
 * Step one: take or choose the photograph. The empty stage shows the same
 * guide rectangle the camera uses, so the framing the clinician is asked for
 * here is the framing the model is later told about.
 */
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
      className="photo-step"
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

      <div className="photo-stage">
        {photo ? (
          <img src={photo.dataUrl} alt="Selected patient photo" />
        ) : (
          <div className="photo-stage-empty">
            <span
              className="photo-stage-guide"
              aria-hidden="true"
              style={{
                left: `${SMILE_GUIDE.x * 100}%`,
                top: `${SMILE_GUIDE.y * 100}%`,
                width: `${SMILE_GUIDE.width * 100}%`,
                height: `${SMILE_GUIDE.height * 100}%`,
              }}
            />
            <p
              style={{
                top: `${(SMILE_GUIDE.y + SMILE_GUIDE.height) * 100}%`,
              }}
            >
              The smile sits here in the frame.
            </p>
          </div>
        )}
      </div>

      <div className="photo-aside">
        <h1 className="photo-heading">
          Let’s start
          <br />
          with a photo.
        </h1>
        <p className="photo-sub">
          A clear, front-facing smile in good lighting gives the best results.
        </p>

        {photo ? (
          <>
            <button
              className="photo-primary"
              disabled={busy}
              onClick={onContinue}
            >
              Continue <ArrowRight size={18} strokeWidth={1.7} />
            </button>
            {photo.quality &&
              (photo.quality.blurry ||
                photo.quality.tooDark ||
                photo.quality.tooBright) && (
              <p className="photo-quality-notice" role="status">
                {photo.quality.blurry
                  ? "This photo looks a little soft. A sharper photo usually gives a more natural result — you can continue anyway."
                  : photo.quality.tooDark
                    ? "This photo looks a little dark. Better, even lighting usually gives a more natural result — you can continue anyway."
                    : photo.quality.tooBright
                      ? "This photo looks very bright. Softer, even lighting usually gives a more natural result — you can continue anyway."
                      : null}
              </p>
            )}
            <div className="photo-secondary-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <ImagePlus size={15} /> Change
              </button>
              <button type="button" disabled={busy} onClick={onCamera}>
                <Camera size={15} /> Retake
              </button>
              <button type="button" disabled={busy} onClick={onRemove}>
                <X size={15} /> Remove
              </button>
            </div>
            <p className="photo-filename">
              {photo.isSample ? "Sample photograph" : photo.name}
            </p>
          </>
        ) : (
          <>
            <button className="photo-primary" onClick={onCamera} disabled={busy}>
              <Camera size={17} strokeWidth={1.7} />
              Take Photo
            </button>
            <button
              className="photo-outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Upload size={17} strokeWidth={1.7} />
              )}
              {busy ? "Preparing…" : "Upload Photo"}
            </button>
          </>
        )}

        <div className="photo-tips">
          <strong>Tips for the best photo</strong>
          <ul>
            {TIPS.map((tip) => (
              <li key={tip}>
                <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

        <p className="photo-hint">JPG, PNG or HEIC · up to 25 MB</p>

        {error && (
          <p className="error-message" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
