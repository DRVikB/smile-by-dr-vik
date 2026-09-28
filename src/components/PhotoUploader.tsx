"use client";
import { useEffect, useRef, useState } from "react";
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
import { isNativeApp } from "@/native/platform";
import { UPLOAD_AUTHORITY_TEXT } from "@/config/legal";

const TIPS = [
  "Natural smile",
  "Good lighting",
  "Face the camera",
  "Remove sunglasses",
  "Keep teeth sharp and fully visible",
  "Avoid flash glare and beauty filters",
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
  authorityConfirmed,
  onConfirmAuthority,
  onLearnMore,
}: {
  photo: Photo | null;
  onPhoto: (photo: Photo) => void | Promise<void>;
  onContinue: () => void;
  onCamera: () => void;
  onRemove: () => void;
  /** The clinician has confirmed authority to process this case's patient media. */
  authorityConfirmed: boolean;
  onConfirmAuthority: () => void;
  onLearnMore: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  // Resolved after mount: the page is prerendered, so render the web UI first.
  const [native, setNative] = useState(false);
  useEffect(() => {
    mounted.current = true;
    setNative(isNativeApp());
    return () => { mounted.current = false; };
  }, []);

  /** Apple's system photo picker: no full Photo Library permission needed. */
  async function chooseFromPhotos() {
    if (pending.current) return;
    setError("");
    try {
      const { pickNativePhoto } = await import("@/native/photos");
      const file = await pickNativePhoto();
      if (file) await receive(file);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "We couldn’t open that photo.");
    }
  }

  async function receive(file?: File) {
    if (!file || pending.current) return;
    if (!authorityConfirmed) {
      setError("Confirm your authority to process this patient’s information first.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const prepared = await preparePhoto(file);
      if (mounted.current) await onPhoto(prepared);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "We couldn’t open that photo.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
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
          <>
            <img className="photo-backdrop" src={photo.dataUrl} alt="" aria-hidden="true" />
            <img className="photo-stage-original" src={photo.dataUrl} alt="Selected patient photo" />
          </>
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
          Add Patient Photo
        </h1>
        <p className="photo-sub">
          Upload or capture a clear smile photograph to begin.
        </p>

        {!photo && (
          <div className={`upload-authority${authorityConfirmed ? " confirmed" : ""}`}>
            <p className="control-hint">
              Patient media is processed to create your SmileCompose visualisation. Only upload information you are authorised to process.{" "}
              <button type="button" className="inline-link" onClick={onLearnMore}>Learn more</button>
            </p>
            <label className="ai-consent-check">
              <input type="checkbox" checked={authorityConfirmed} disabled={authorityConfirmed} onChange={e => { if (e.target.checked) onConfirmAuthority(); }} />
              <span>{UPLOAD_AUTHORITY_TEXT}</span>
            </label>
          </div>
        )}

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
                onClick={() => native ? void chooseFromPhotos() : input.current?.click()}
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
            <button className="photo-primary" onClick={onCamera} disabled={busy || !authorityConfirmed}>
              <Camera size={17} strokeWidth={1.7} />
              Take Photo
            </button>
            {native && (
              <button
                className="photo-outline"
                disabled={busy || !authorityConfirmed}
                onClick={() => void chooseFromPhotos()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <ImagePlus size={17} strokeWidth={1.7} />
                )}
                {busy ? "Preparing…" : "Choose from Photos"}
              </button>
            )}
            <button
              className="photo-outline"
              disabled={busy || !authorityConfirmed}
              onClick={() => input.current?.click()}
            >
              {busy && !native ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Upload size={17} strokeWidth={1.7} />
              )}
              {busy && !native ? "Preparing…" : native ? "Choose File" : "Upload Photo"}
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

        <details className="clinical-details"><summary>Clinical capture guide</summary>
          <p className="control-hint">Use a full-face smile for facial context or a straight-on close-up for tooth detail. Set the matching photo type in Smile design. A retracted view can show more tooth detail, but cannot establish the natural smile arc.</p>
          <p className="control-hint">Keep lighting, camera distance and head position consistent for comparisons. Check blur and reflections on the teeth themselves before continuing. Only one patient photograph is edited per preview.</p>
          <p className="control-hint">For clinical shade records, include a suitable shade reference and use your calibrated photography workflow. An uncalibrated iPad image is not an exact shade measurement. Keep any extra views or natural-smile video in your clinical record.</p>
        </details>
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
