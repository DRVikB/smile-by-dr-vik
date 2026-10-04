"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Photo } from "@/lib/types";
import { SMILE_GUIDE } from "@/lib/types";
import { preparePhoto } from "@/lib/photos";
import { isNativeApp } from "@/native/platform";
import { UPLOAD_AUTHORITY_TEXT } from "@/config/legal";
import { CaptureSymbol, CasesSymbol, IconTile, PhotosSymbol } from "@/components/icons/SmileIcons";
import { EXAMPLE_COMPARISON, EXAMPLE_PORTRAITS } from "@/lib/exampleImages";
import { ZoomPan } from "./ZoomPan";

const TIPS = [
  "Natural smile",
  "Good lighting",
  "Face the camera",
  "Remove sunglasses",
  "Keep teeth sharp and fully visible",
  "Avoid flash glare and beauty filters",
];

/** Illustrative gallery only; these are never selected or sent to the generator. */
const GALLERY = [
  EXAMPLE_PORTRAITS.man,
  { src: "/onboarding/case-porcelain.jpg", width: 480, height: 300 },
  EXAMPLE_PORTRAITS.woman,
  { src: "/onboarding/case-male-smile.jpg", width: 480, height: 300 },
  { src: EXAMPLE_COMPARISON.after, width: 1086, height: 1448 },
];

function PhotoTips() {
  return (
    <details className="photo-tips-disclosure">
      <summary><span className="photo-row-icon" aria-hidden="true"><Lightbulb size={17} strokeWidth={1.7} /></span><span>Tips for the best photo</span><ChevronDown size={16} aria-hidden="true" /></summary>
      <ul>
        {TIPS.map((tip) => (
          <li key={tip}>
            <Check size={13} strokeWidth={2.4} aria-hidden="true" />
            {tip}
          </li>
        ))}
      </ul>
      <p className="control-hint">Use a full-face smile for facial context or a straight-on close-up for tooth detail. Set the matching photo type in the Teeth step. A retracted view can show more tooth detail, but cannot establish the natural smile arc.</p>
      <p className="control-hint">Keep lighting, camera distance and head position consistent for comparisons. Check blur and reflections on the teeth themselves before continuing. Only one patient photograph is edited per preview.</p>
      <p className="control-hint">For clinical shade records, include a suitable shade reference and use your calibrated photography workflow. An uncalibrated iPad image is not an exact shade measurement. Keep any extra views or natural-smile video in your clinical record.</p>
      <p className="photo-hint">JPG, PNG or HEIC · up to 25 MB</p>
    </details>
  );
}

/**
 * Step one: take or choose the photograph. With no photo it is a "Let's get
 * started" page — Take a photo, Choose from photos, or explore the sample
 * case. With a photo it shows the photo on the same guide rectangle the camera
 * uses, so the framing asked for here is the framing the model is told about.
 */
export function PhotoUploader({
  photo,
  onPhoto,
  onContinue,
  onCamera,
  onRemove,
  onSample,
  sampleBusy = false,
  authorityConfirmed,
  onConfirmAuthority,
  onLearnMore,
  details,
}: {
  photo: Photo | null;
  onPhoto: (photo: Photo) => void | Promise<void>;
  onContinue: () => void;
  onCamera: () => void;
  onRemove: () => void;
  /** Opens the sample case in test mode (no patient photo, no AI credits). */
  onSample?: () => void;
  sampleBusy?: boolean;
  /** The clinician has confirmed authority to process this case's patient media. */
  authorityConfirmed: boolean;
  onConfirmAuthority: () => void;
  onLearnMore: () => void;
  /** Optional case details beside the selected photo (patient goals). */
  details?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  // Confirmed earlier for this case: the statement has done its job, so the page leads with the photo sources.
  const [confirmedBefore] = useState(authorityConfirmed);
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

  const choose = () => (native ? void chooseFromPhotos() : input.current?.click());

  const errorMessage = error && (
    <p className="error-message" role="alert">
      {error}
      <button aria-label="Dismiss error" onClick={() => setError("")}>
        <X size={14} />
      </button>
    </p>
  );

  return (
    <div
      className={photo ? "photo-step" : "photo-start"}
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
          <div className="photo-stage">
            <img className="photo-backdrop" src={photo.dataUrl} alt="" aria-hidden="true" />
            <ZoomPan className="photo-stage-zoom" resetKey={photo.dataUrl}>
              <img className="photo-stage-original" src={photo.dataUrl} alt="Selected patient photo" />
            </ZoomPan>
          </div>

          <div className="photo-aside">
            <h1 className="photo-heading">Looks good?</h1>
            <p className="photo-sub">Check the smile is sharp and well lit, then continue to the design.</p>
            <button className="photo-primary" disabled={busy} onClick={onContinue}>
              Continue <ArrowRight size={18} strokeWidth={1.7} />
            </button>
            {photo.quality && (photo.quality.blurry || photo.quality.tooDark || photo.quality.tooBright) && (
              <p className="photo-quality-notice" role="status">
                {photo.quality.blurry
                  ? "This photo looks a little soft. A sharper photo usually gives a more natural result — you can continue anyway."
                  : photo.quality.tooDark
                    ? "This photo looks a little dark. Better, even lighting usually gives a more natural result — you can continue anyway."
                    : "This photo looks very bright. Softer, even lighting usually gives a more natural result — you can continue anyway."}
              </p>
            )}
            <div className="photo-secondary-row">
              <button type="button" disabled={busy} onClick={choose}>
                <ImagePlus size={15} /> Change
              </button>
              <button type="button" disabled={busy} onClick={onCamera}>
                <Camera size={15} /> Retake
              </button>
              <button type="button" disabled={busy} onClick={onRemove}>
                <X size={15} /> Remove
              </button>
            </div>
            <p className="photo-filename">{photo.isSample ? "Sample photograph" : photo.name}</p>
            {details}
            <PhotoTips />
            {errorMessage}
          </div>
        </>
      ) : (
        <>
          <header className="photo-start-head sr-only">
            <h1 className="photo-heading">Let’s get started.</h1>
            <p className="photo-sub">Add a patient photo to begin the smile design.</p>
          </header>

          <div className={`upload-authority${authorityConfirmed ? " confirmed" : ""}`}>
            {!(authorityConfirmed && confirmedBefore) && (
              <label className="ai-consent-check">
                <span className="photo-row-icon" aria-hidden="true"><ShieldCheck size={18} strokeWidth={1.7} /></span>
                <span>{UPLOAD_AUTHORITY_TEXT}</span>
                <input type="checkbox" checked={authorityConfirmed} disabled={authorityConfirmed} onChange={e => { if (e.target.checked) onConfirmAuthority(); }} />
              </label>
            )}
            <p className="control-hint">
              Patient media is processed to create your SmileCompose visualisation.{" "}
              <button type="button" className="inline-link" onClick={onLearnMore}>Learn more</button>
            </p>
          </div>

          <div className="photo-options">
            <button type="button" className="photo-option photo-option-hero" onClick={onCamera} disabled={busy || !authorityConfirmed}>
              <IconTile icon={CaptureSymbol} />
              <span className="photo-option-text">
                <strong>Take a photo</strong>
                <small>Use the camera, with a guide for the smile.</small>
              </span>
              <span className="photo-option-visual photo-option-capture" aria-hidden="true">
                <img {...EXAMPLE_PORTRAITS.man} sizes="(min-width: 700px) 600px, 100vw" alt="" draggable={false} decoding="async" />
                <span className="photo-option-corner tl" /><span className="photo-option-corner tr" />
                <span className="photo-option-corner bl" /><span className="photo-option-corner br" />
                <span className="photo-option-shutter" />
                <span
                  className="photo-option-guide"
                  style={{
                    left: `${SMILE_GUIDE.x * 100}%`,
                    top: `${SMILE_GUIDE.y * 100}%`,
                    width: `${SMILE_GUIDE.width * 100}%`,
                    height: `${SMILE_GUIDE.height * 100}%`,
                  }}
                />
              </span>
              <span className="photo-option-go" aria-hidden="true"><ChevronRight size={20} strokeWidth={1.7} /></span>
            </button>

            <button type="button" className="photo-option photo-option-secondary" onClick={choose} disabled={busy || !authorityConfirmed}>
              <IconTile icon={PhotosSymbol} />
              <span className="photo-option-text">
                <strong>{native ? "Choose from photos" : "Upload a photo"}</strong>
                <small>{native ? "Select a photo from your library." : "JPG, PNG or HEIC, up to 25 MB."}</small>
              </span>
              <span className="photo-option-visual photo-option-gallery" aria-hidden="true">
                {GALLERY.map(image => <img key={image.src} {...image} sizes="(min-width: 700px) 180px, 20vw" alt="" draggable={false} decoding="async" />)}
              </span>
              <span className="photo-option-go" aria-hidden="true">
                {busy ? <LoaderCircle className="spin" size={18} /> : <ChevronRight size={20} strokeWidth={1.7} />}
              </span>
            </button>
          </div>

          <p className="photo-examples-note">Illustrative sample photographs</p>
          {!authorityConfirmed && <p className="control-hint photo-start-note">Confirm the statement above to add a patient photo.</p>}
          {native && (
            <button type="button" className="text-button photo-file-link" disabled={busy || !authorityConfirmed} onClick={() => input.current?.click()}>
              Choose a file instead
            </button>
          )}

          {onSample && <div className="sc-or" role="separator" aria-label="or">OR</div>}
          {onSample && (
            <button type="button" className="photo-sample" onClick={onSample} disabled={sampleBusy}>
              <span className="photo-row-icon" aria-hidden="true"><CasesSymbol size={18} /></span>
              <span>{sampleBusy ? "Opening the sample case…" : "Explore a sample case"}<small>No patient photo, no AI credits</small></span>
              <ChevronRight size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>
          )}

          <PhotoTips />
          {errorMessage}
        </>
      )}
    </div>
  );
}
