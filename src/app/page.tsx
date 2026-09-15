"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Columns2,
  Download,
  ImagePlus,
  Maximize2,
  MoveHorizontal,
  Play,
  Rows2,
  X,
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
  type SmileSettings,
  type GenerationResult,
} from "@/lib/types";
import { readCase, persistCase } from "@/lib/storage";
import { preparePhoto } from "@/lib/photos";
import { downloadPreview } from "@/lib/download";
import { useSmileTools } from "@/lib/useSmileTools";
import { imageSchema } from "@/lib/generation/schema";

type Variant = {
  label: string;
  note: string;
  patch: Partial<SmileSettings>;
  result: GenerationResult;
};

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
  const [reference, setReference] = useState<Photo | null>(null);
  const [options, setOptions] = useState<Variant[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testPreview, setTestPreview] = useState<string | null>(null);
  useSmileTools({ screen, hasPhoto: !!photo, settings, busy }, setSettings);
  const replacement = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
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
    void persistCase(
      photo
        ? {
            photo,
            settings,
            result,
            screen: screen === "compare" ? "design" : screen,
          }
        : null,
    ).catch(() => setStorageError(true));
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
    setTestMode(false);
    setTestPreview(null);
    setError("");
    setCamera(false);
  }

  async function openTestMode() {
    if (sampleBusy) return;
    setSampleBusy(true);
    setError("");
    try {
      const [patientResponse, previewResponse] = await Promise.all([
        fetch("/sample-smile.jpg"),
        fetch("/test-smile-preview.jpg"),
      ]);
      if (!patientResponse.ok || !previewResponse.ok) throw new Error();
      const [patientBlob, previewBlob] = await Promise.all([
        patientResponse.blob(),
        previewResponse.blob(),
      ]);
      const [patient, preview] = await Promise.all([
        preparePhoto(
          new File([patientBlob], "Dr Vik test patient.jpg", {
            type: "image/jpeg",
          }),
        ),
        preparePhoto(
          new File([previewBlob], "Dr Vik test preview.jpg", {
            type: "image/jpeg",
          }),
        ),
      ]);
      setPhoto({ ...patient, isSample: true });
      setTestPreview(preview.dataUrl);
      setTestMode(true);
      setResult(null);
      setSettings({ ...defaultSettings });
      setScreen("design");
    } catch {
      setError("Test mode couldn’t open. Please try again.");
    } finally {
      setSampleBusy(false);
    }
  }

  async function requestPreview(
    photoIn: Photo,
    settingsIn: SmileSettings,
    controller: AbortController,
  ): Promise<GenerationResult> {
    if (testMode && testPreview) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (controller.signal.aborted) throw controller.signal.reason;
      const { alignPreview } = await import("@/lib/photos");
      return {
        image: await alignPreview(testPreview, photoIn),
        mode: "live",
        variationId: crypto.randomUUID(),
      };
    }
    const r = await fetch("/api/generate-smile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalImage: photoIn.dataUrl,
        referenceImage: reference?.dataUrl,
        settings: settingsIn,
      }),
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(255000),
      ]),
    });
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
    let next = body as GenerationResult;
    if (next.mode === "live") {
      const { alignPreview } = await import("@/lib/photos");
      next = { ...next, image: await alignPreview(next.image, photoIn) };
    }
    return next;
  }

  async function generate() {
    if (!photo || busy || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const [next] = await Promise.all([
        requestPreview(photo, settings, controller),
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

  async function generateVariants(
    wanted: { label: string; note: string; patch: Partial<SmileSettings> }[],
  ) {
    if (!photo || busy || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setSaved(false);
    const originalPhoto = photo;
    try {
      const settled = await Promise.allSettled(
        wanted.map(async (v) => ({
          ...v,
          result: await requestPreview(
            originalPhoto,
            { ...settings, ...v.patch },
            controller,
          ),
        })),
      );
      if (controller.signal.aborted) return;
      const ok = settled
        .filter((x) => x.status === "fulfilled")
        .map((x) => (x as PromiseFulfilledResult<Variant>).value);
      if (ok.length === 0)
        throw new Error("These options couldn’t be created. Please try again.");
      setOptions(ok);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error && e.name !== "TimeoutError"
            ? e.message
            : "This took too long. Please try again.",
        );
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }

  const showAnother = () =>
    void generateVariants([
      { label: "Subtle", note: "A natural enhancement.", patch: { intensity: 20 } },
      { label: "Refined", note: "A balanced, polished look.", patch: { intensity: 50 } },
      { label: "Bright", note: "A brighter, more defined smile.", patch: { intensity: 80 } },
    ]);

  const compareShapes = () =>
    void generateVariants([
      { label: "Square", note: "Defined, confident edges.", patch: { shape: "Square" } },
      { label: "Rounded", note: "Soft and natural.", patch: { shape: "Rounded" } },
      { label: "Triangular", note: "Tapered and youthful.", patch: { shape: "Triangular" } },
    ]);

  function selectOption(v: Variant) {
    setSettings((s) => ({ ...s, ...v.patch }));
    setResult(v.result);
    setOptions(null);
    setScreen("preview");
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
    setReference(null);
    setTestMode(false);
    setTestPreview(null);
    setOptions(null);
    setFullscreen(false);
    setSettings({ ...defaultSettings });
    setError("");
    setSaved(false);
    setScreen("start");
    void persistCase(null).catch(() => setStorageError(true));
  }

  async function save() {
    if (!result) return;
    setSaveOpen(false);
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

  async function saveComposite(layout: "split" | "stacked") {
    if (!result || !photo) return;
    setSaveOpen(false);
    setSaving(true);
    setError("");
    try {
      const { composeBeforeAfter, downloadBlob } = await import("@/lib/compose");
      const blob = await composeBeforeAfter(
        photo.dataUrl,
        result.image,
        layout,
        result,
      );
      downloadBlob(
        blob,
        `smile-${layout === "split" ? "side-by-side" : "stacked"}-${new Date().toISOString().slice(0, 10)}.jpg`,
      );
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
    <AppShell
      screen={screen}
      onBack={
        screen === "design"
          ? () => setScreen("start")
          : screen === "preview"
            ? () => setScreen("design")
            : undefined
      }
      action={
        screen === "design" ? (
          <div className="nav-actions">
            {testMode && <span className="test-mode-pill">Test mode</span>}
            <button
              className="nav-action"
              onClick={() => setSettings({ ...defaultSettings })}
            >
              Reset
            </button>
          </div>
        ) : screen === "preview" ? (
          <div className="nav-actions">
            {testMode && <span className="test-mode-pill">Test mode</span>}
            <button className="nav-action" onClick={() => setSaveOpen(true)}>
              Save
            </button>
          </div>
        ) : undefined
      }
    >
      {!ready ? (
        <div className="restore-state" role="status">
          Preparing your space…
        </div>
      ) : (
        <>
          {screen === "start" && (
            <section className="start-screen">
              <div className="start-visual">
                <div
                  className="portrait-image"
                  role="img"
                  aria-label="A natural smile photographed for Dr Vik"
                />
              </div>
              <div className="portrait-top">
                <span className="start-brand">
                  <span className="wordmark">Smile</span>
                  <img className="dr-vik-mark" src="/dr-vik-logo.png" alt="Dr Vik" />
                </span>
              </div>
              <div className="start-copy">
                <h1 ref={heading} tabIndex={-1}>
                  A preview
                  <br />
                  of what’s possible
                </h1>
                <p className="intro">
                  Visualise your future smile in seconds.
                </p>
                <PhotoUploader
                  photo={photo}
                  onPhoto={selectPhoto}
                  onContinue={() => setScreen("design")}
                  onCamera={() => setCamera(true)}
                />
                {!photo && (
                  <button
                    className="sample-button"
                    onClick={() => void openTestMode()}
                    disabled={sampleBusy}
                  >
                    <Play size={14} fill="currentColor" strokeWidth={1.7} />
                    {sampleBusy ? "Opening…" : "Open test mode"}
                    <span>No AI credits</span>
                  </button>
                )}
              </div>
              <div className="hero-footer">
                <div className="hero-words">
                  <span>Confidence</span>
                  <span>Aesthetics</span>
                  <span>You</span>
                </div>
                <span className="hero-location">Dr Vik · London</span>
              </div>
            </section>
          )}

          {screen === "design" && photo && (
            <section className="design-screen">
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
                        err instanceof Error ? err.message : "Could not open photo.",
                      );
                    } finally {
                      e.target.value = "";
                    }
                  }
                }}
              />
              <input
                ref={referenceInput}
                className="sr-only"
                type="file"
                aria-label="Add reference smile photo"
                accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      setReference(await preparePhoto(file));
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Could not open reference photo.",
                      );
                    } finally {
                      e.target.value = "";
                    }
                  }
                }}
              />
              <h1 ref={heading} tabIndex={-1} className="sr-only">
                Choose your smile
              </h1>
              <div className="design-layout">
                <div className="photo-column">
                  {result ? (
                    <div className="preview-stage">
                      <BeforeAfterSlider
                        original={photo.dataUrl}
                        preview={result.image}
                        isMock={result.mode === "mock"}
                        previewLabel="Live Preview"
                      />
                      {generation}
                    </div>
                  ) : (
                    <PatientPhoto photo={photo}>{generation}</PatientPhoto>
                  )}
                  <div className="photo-under">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => replacement.current?.click()}
                    >
                      <ImagePlus size={15} strokeWidth={1.6} />
                      Replace photo
                    </button>
                    <span>
                      {testMode && <b>Test mode · </b>}
                      {settings.teeth} upper teeth · {settings.targetShade}
                    </span>
                  </div>
                </div>
                <DesignControls
                  settings={settings}
                  onChange={setSettings}
                  onGenerate={() => void generate()}
                  onCompare={compareShapes}
                  busy={busy}
                  reference={reference}
                  onAddReference={() => referenceInput.current?.click()}
                  onClearReference={() => setReference(null)}
                />
              </div>
            </section>
          )}

          {screen === "preview" && photo && result && (
            <section className="preview-screen">
              <h1 ref={heading} tabIndex={-1} className="sr-only">
                Your Smile Preview
              </h1>
              <div className="preview-stage">
                <BeforeAfterSlider
                  original={photo.dataUrl}
                  preview={result.image}
                  isMock={result.mode === "mock"}
                />
                <button
                  className="fullscreen-button"
                  onClick={() => setFullscreen(true)}
                >
                  <Maximize2 size={14} strokeWidth={1.8} />
                  Full Screen
                </button>
                {generation}
              </div>
              <div className="comparison-hint">
                <MoveHorizontal size={15} strokeWidth={1.6} />
                Slide to compare
              </div>
              {result.mode === "mock" && (
                <p className="demo-notice">
                  <span>Demo preview</span>Your original photo is shown on both
                  sides. AI smile editing isn’t connected yet.
                </p>
              )}
              {testMode && (
                <p className="test-notice">
                  Test mode uses a prepared Dr Vik example, so no AI credits are
                  used.
                </p>
              )}
              <BottomActionBar
                onAnother={showAnother}
                onEdit={() => {
                  setScreen("design");
                  setError("");
                }}
                onSave={() => setSaveOpen(true)}
                onNew={newSmile}
                busy={busy}
                saving={saving}
              />
              {saved && (
                <p className="save-status" role="status">
                  <Check size={14} /> Image saved
                </p>
              )}
              <Disclaimer />
            </section>
          )}
        </>
      )}

      {camera && (
        <CameraSheet onCapture={selectPhoto} onClose={() => setCamera(false)} />
      )}

      {options && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Smile variations"
          onClick={() => setOptions(null)}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-heading">
              <h2>Smile Variations</h2>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setOptions(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="sheet-sub">Same settings, different options.</p>
            <div className="variation-list">
              {options.map((o) => (
                <button
                  key={o.label}
                  className="option-card"
                  onClick={() => selectOption(o)}
                >
                  <span
                    className="option-image"
                    style={{ backgroundImage: `url(${o.result.image})` }}
                    role="img"
                    aria-label={`${o.label} preview`}
                  />
                  <span className="option-cap">
                    <span>{o.label}</span>
                    <span className="option-pick">{o.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {saveOpen && result && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Save image"
          onClick={() => setSaveOpen(false)}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-heading">
              <h2>Save Image</h2>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setSaveOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="sheet-sub">Choose how the preview is saved.</p>
            <div className="variation-list">
              <button className="save-option" onClick={() => void save()}>
                <Download size={18} strokeWidth={1.6} />
                <span>
                  Preview only
                  <small>The smile preview on its own.</small>
                </span>
              </button>
              <button
                className="save-option"
                onClick={() => void saveComposite("split")}
              >
                <Columns2 size={18} strokeWidth={1.6} />
                <span>
                  Side by side
                  <small>Before and after, 50/50.</small>
                </span>
              </button>
              <button
                className="save-option"
                onClick={() => void saveComposite("stacked")}
              >
                <Rows2 size={18} strokeWidth={1.6} />
                <span>
                  Stacked
                  <small>Before above, preview below.</small>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {fullscreen && photo && result && (
        <div
          className="consult"
          onPointerDown={() => setHolding(true)}
          onPointerUp={() => setHolding(false)}
          onPointerCancel={() => setHolding(false)}
          onPointerLeave={() => setHolding(false)}
        >
          <div className="consult-media">
            <img
              src={holding ? photo.dataUrl : result.image}
              alt={holding ? "Original photograph" : "Smile preview"}
            />
          </div>
          <div className="consult-top">
            <div className="product-lockup product-lockup-inverse">
              <span className="wordmark">Smile</span>
              <span className="brand-divider" aria-hidden="true" />
              <img className="dr-vik-mark" src="/dr-vik-logo.png" alt="Dr Vik" />
            </div>
            <button
              className="consult-close"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setFullscreen(false)}
            >
              <X size={15} /> Close
            </button>
          </div>
          <p className="consult-serif">
            A more
            <br />
            confident you
          </p>
          <div className="consult-foot">
            <span className="consult-practice">Dr Vik · London</span>
            <span className="consult-hint">Tap and hold to see original</span>
            <span className="consult-meta">
              AI Smile Preview
              <small>for discussion purposes only</small>
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="global-error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {storageError && (
        <p className="storage-note">
          This browser isn’t saving your case locally. Your preview still works.
        </p>
      )}
    </AppShell>
  );
}
