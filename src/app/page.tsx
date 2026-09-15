"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ImagePlus,
  MoveHorizontal,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PhotoUploader } from "@/components/PhotoUploader";
import { CameraSheet } from "@/components/CameraSheet";
import { DesignControls } from "@/components/DesignControls";
import { PatientPhoto } from "@/components/PatientPhoto";
import { GenerationState } from "@/components/GenerationState";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { BottomActionBar, Disclaimer } from "@/components/PreviewActions";
import {
  defaultSettings,
  type Photo,
  type Screen,
  type GenerationResult,
} from "@/lib/types";
import { readCase, persistCase } from "@/lib/storage";
import { preparePhoto } from "@/lib/photos";
import { downloadPreview } from "@/lib/download";
import { useSmileTools } from "@/lib/useSmileTools";
import { imageSchema } from "@/lib/generation/schema";
export default function Smile() {
  const [screen, setScreen] = useState<Screen>("start");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  useSmileTools({ screen, hasPhoto: !!photo, settings, busy }, setSettings);
  const replacement = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstScreen = useRef(true);
  useEffect(() => {
    let active = true;
    readCase()
      .then((c) => {
        if (active && c) {
          setPhoto(c.photo);
          setSettings(c.settings);
          setResult(c.result);
          setScreen(c.screen);
        }
      })
      .catch(() => {
        if (active) setStorageError(true);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    void persistCase(photo ? { photo, settings, result, screen } : null).catch(
      () => setStorageError(true),
    );
  }, [photo, settings, result, screen, ready]);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);
  function selectPhoto(p: Photo) {
    setPhoto(p);
    setResult(null);
    setError("");
    setCamera(false);
  }
  async function sample() {
    setSampleBusy(true);
    setError("");
    try {
      const response = await fetch("/sample-smile.jpg");
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const p = await preparePhoto(
        new File([blob], "Sample photograph.jpg", { type: "image/jpeg" }),
      );
      selectPhoto({ ...p, isSample: true });
    } catch {
      setError(
        "The sample photo couldn’t load. Please upload a photo instead.",
      );
    } finally {
      setSampleBusy(false);
    }
  }
  async function generate() {
    if (!photo || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const work = fetch("/api/generate-smile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalImage: photo.dataUrl, settings }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(110000),
        ]),
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw new Error(
            body.error || "We couldn’t create your preview. Please try again.",
          );
        if (
          !imageSchema.safeParse(body.image).success ||
          !["mock", "live"].includes(body.mode)
        )
          throw new Error("The preview could not be opened. Please try again.");
        return body as GenerationResult;
      });
      const [next] = await Promise.all([
        work,
        new Promise((resolve) => setTimeout(resolve, 2300)),
      ]);
      if (controller.signal.aborted) return;
      setResult(next);
      setScreen("preview");
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error && e.name !== "TimeoutError"
            ? e.message
            : "This preview took too long. Please try again.",
        );
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  function cancelGeneration() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }
  function newSmile() {
    cancelGeneration();
    setPhoto(null);
    setResult(null);
    setSettings({ ...defaultSettings });
    setError("");
    setSaved(false);
    setScreen("start");
    void persistCase(null).catch(() => setStorageError(true));
  }
  async function save() {
    if (!result) return;
    setSaving(true);
    setError("");
    try {
      await downloadPreview(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch {
      setError("The image couldn’t be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  const generation = busy ? (
    <GenerationState onCancel={cancelGeneration} />
  ) : null;
  return (
    <AppShell screen={screen}>
      {!ready ? (
        <div className="restore-state" role="status">
          Preparing your space<span>…</span>
        </div>
      ) : (
        <>
          {screen === "start" && (
            <section className="start-screen">
              <div className="start-copy">
                <span className="eyebrow">
                  A LITTLE CHANGE. A NEW POSSIBILITY.
                </span>
                <h1 ref={heading} tabIndex={-1}>
                  Create a<br />
                  new smile<span className="heading-period">.</span>
                </h1>
                <p className="intro">
                  Create a visual preview to explore possible changes to shape
                  and shade.
                </p>
                <PhotoUploader
                  photo={photo}
                  onPhoto={selectPhoto}
                  onContinue={() => setScreen("design")}
                  onCamera={() => setCamera(true)}
                />
                <p className="photo-tip">
                  For the best preview, use a clear photo with your face
                  <br className="desktop-break" /> looking forward and your
                  teeth visible.
                </p>
              </div>
              <div className="start-visual">
                <div
                  className="portrait-image"
                  style={
                    photo
                      ? { backgroundImage: `url(${photo.dataUrl})` }
                      : undefined
                  }
                  role="img"
                  aria-label={
                    photo
                      ? "Selected smile photograph"
                      : "A naturally smiling woman, sample portrait"
                  }
                />
                <div className="portrait-top">
                  <span className="glass-label">YOUR SMILE. REIMAGINED.</span>
                  <span className="photo-corner" aria-hidden="true">
                    ✳
                  </span>
                </div>
                <div className="portrait-caption">
                  <span>
                    Still you.
                    <br />A little more possibility.
                  </span>
                  {photo ? (
                    <span className="photo-ready">
                      <Check size={15} />
                      Photo selected
                    </span>
                  ) : (
                    <button
                      className="sample-button"
                      onClick={() => void sample()}
                      disabled={sampleBusy}
                    >
                      {sampleBusy ? "Opening…" : "Try this photo"}
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}
          {screen === "design" && photo && (
            <section className="design-screen">
              <div className="screen-heading">
                <div>
                  <span className="eyebrow">MAKE IT YOURS</span>
                  <h1 ref={heading} tabIndex={-1}>
                    Smile Design
                  </h1>
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => replacement.current?.click()}
                >
                  <ImagePlus size={16} />
                  Replace photo
                </button>
              </div>
              <input
                ref={replacement}
                className="sr-only"
                type="file"
                aria-label="Replace patient photo"
                accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      selectPhoto(await preparePhoto(file));
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Could not open photo.",
                      );
                    } finally {
                      e.target.value = "";
                    }
                  }
                }}
              />
              <div className="design-layout">
                <div className="photo-column">
                  <PatientPhoto photo={photo}>{generation}</PatientPhoto>
                  <div className="photo-under">
                    <span>A familiar face. New possibilities.</span>
                    <span>Upper teeth only</span>
                  </div>
                </div>
                <DesignControls
                  settings={settings}
                  onChange={setSettings}
                  onGenerate={() => void generate()}
                  busy={busy}
                />
              </div>
              <button
                className="text-button back-link"
                disabled={busy}
                onClick={() => setScreen("start")}
              >
                <ArrowLeft size={15} />
                Back to photo
              </button>
            </section>
          )}
          {screen === "preview" && photo && result && (
            <section className="preview-screen">
              <div className="screen-heading">
                <div>
                  <span className="eyebrow">A NEW PERSPECTIVE</span>
                  <h1 ref={heading} tabIndex={-1}>
                    Your Smile Preview
                  </h1>
                </div>
                <div className="preview-summary">
                  {settings.teeth} teeth<span>·</span>
                  {settings.treatment}
                  <span>·</span>
                  {settings.targetShade}
                </div>
              </div>
              <div className="preview-stage">
                <BeforeAfterSlider
                  original={photo.dataUrl}
                  preview={result.image}
                  isMock={result.mode === "mock"}
                />
                {generation}
              </div>
              <div className="comparison-hint">
                <MoveHorizontal size={15} />
                Slide to explore your smile
              </div>
              {result.mode === "mock" && (
                <p className="demo-notice">
                  <span>Demo preview</span> Your original photo is shown on both
                  sides. AI smile editing isn’t connected yet.
                </p>
              )}
              <BottomActionBar
                onEdit={() => {
                  setScreen("design");
                  setError("");
                }}
                onRegenerate={() => void generate()}
                onSave={() => void save()}
                onNew={newSmile}
                busy={busy}
                saving={saving}
              />
              {saved && (
                <p className="save-status" role="status">
                  <Check size={14} />
                  Image ready to save
                </p>
              )}
              <Disclaimer />
            </section>
          )}
          {error && (
            <div className="global-error error-message" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {storageError && (
            <p className="storage-note" role="status">
              This browser can’t save your case locally. Keep this tab open
              while you work.
            </p>
          )}
        </>
      )}
      {camera && (
        <CameraSheet onClose={() => setCamera(false)} onCapture={selectPhoto} />
      )}
    </AppShell>
  );
}
