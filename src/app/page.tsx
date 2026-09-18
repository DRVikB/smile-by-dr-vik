"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookMarked,
  Check,
  Columns2,
  ImagePlus,
  History,
  Maximize2,
  Minus,
  MoveHorizontal,
  Play,
  Plus,
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
import { ConsultView } from "@/components/ConsultView";
import { Presentation } from "@/components/Presentation";
import { BottomActionBar, Disclaimer } from "@/components/PreviewActions";
import { CaseLog } from "@/components/CaseLog";
import { CaseLibrary } from "@/components/CaseLibrary";
import {
  defaultSettings,
  type Photo,
  type Screen,
  type SmileSettings,
  type GenerationResult,
  type SmileVariant,
} from "@/lib/types";
import { readCase, persistCase } from "@/lib/storage";
import { addLogEntry } from "@/lib/caseLog";
import { thumbnail } from "@/lib/thumb";
import { preparePhoto } from "@/lib/photos";
import { getReportPreferences, preferenceRows } from "@/lib/report";
import { useSmileTools } from "@/lib/useSmileTools";
import { imageSchema } from "@/lib/generation/schema";

type Variant = SmileVariant;

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
  const [variants, setVariants] = useState<Variant[]>([]);
  const [options, setOptions] = useState<Variant[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testPreview, setTestPreview] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryCount, setLibraryCount] = useState(0);
  // Pinned cases override the automatic match, and are a chairside choice for
  // this session rather than something saved with the case.
  const [pinnedCases, setPinnedCases] = useState<string[]>([]);
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
          setVariants(c.variants ?? []);
          setReference(c.reference ?? null);
          setTestMode(Boolean(c.testMode));
          setTestPreview(c.testPreview ?? null);
          setPatientName(c.patientName ?? "");
          setSettings({ ...c.settings, targetShade:
            ["The same", "Whiten", "Bleach"].includes(c.settings.targetShade)
              ? c.settings.targetShade
              : c.settings.targetShade.startsWith("BL") ? "Bleach" : "Whiten" });
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
            patientName,
            testMode,
            testPreview,
            reference,
            variants,
            settings,
            result,
            screen: screen === "compare" ? "design" : screen,
          }
        : null,
    ).catch(() => setStorageError(true));
  }, [photo, settings, result, screen, ready, testMode, testPreview, reference, variants, patientName]);

  useEffect(() => {
    document.body.classList.toggle("consult-open", fullscreen);
    return () => document.body.classList.remove("consult-open");
  }, [fullscreen]);

  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  async function selectPhoto(p: Photo) {
    setVariants([]);
    setOptions(null);
    setPhoto(p);
    setResult(null);
    setTestMode(false);
    setTestPreview(null);
    setError("");
    setCamera(false);
    // Commit the selection immediately, even while still on the start screen.
    try {
      await persistCase({ photo: p, settings, reference, result: null,
        screen: screen === "start" || screen === "photo" ? "photo" : "design", testMode: false, testPreview: null });
    } catch {
      setStorageError(true);
    }
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
      setVariants([]);
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

  useEffect(() => {
    let live = true;
    import("@/lib/caseLibrary")
      .then((m) => m.listLibrary())
      .then((all) => {
        if (live) setLibraryCount(all.length);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [libraryOpen]);

  async function requestPreview(
    photoIn: Photo,
    settingsIn: SmileSettings,
    controller: AbortController,
  ): Promise<GenerationResult> {
    const preferences = { settings: structuredClone(settingsIn), referenceUsed: Boolean(reference), testMode };
    if (testMode && testPreview) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (controller.signal.aborted) throw controller.signal.reason;
      const { alignPreview } = await import("@/lib/photos");
      return {
        image: await alignPreview(testPreview, photoIn),
        mode: "live",
        variationId: crypto.randomUUID(),
        preferences,
      };
    }
    if (!navigator.onLine) throw new Error("You’re offline. Reconnect to create a preview; your current case is kept on this device.");
    // The clinician's own finished cases, attached so the preview matches their
    // work. A library that can't be opened must never block a preview.
    let styleReferences: string[] = [];
    if (settingsIn.libraryStyle) {
      try {
        const { chooseLibraryCases, listLibrary, loadStyleReferences } =
          await import("@/lib/caseLibrary");
        const chosen = chooseLibraryCases(
          await listLibrary(),
          settingsIn.treatment,
          pinnedCases,
        );
        styleReferences = await loadStyleReferences(chosen.map((c) => c.id));
      } catch {
        styleReferences = [];
      }
    }
    const r = await fetch("/api/generate-smile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalImage: photoIn.dataUrl,
        referenceImage: reference?.dataUrl,
        styleReferences: styleReferences.length ? styleReferences : undefined,
        framing: photoIn.framing,
        settings: settingsIn,
      }),
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(255000),
      ]),
    }).catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      throw new Error("The image-generation service couldn’t be reached. Please check your connection and try again. Your current case remains on this device.");
    });
    const body = await r.json().catch(() => { throw new Error("The image-generation service is unavailable. Your case is kept on this device. Please try again shortly."); });
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
    return { ...next, preferences };
  }

  /** Every generated preview is logged locally so it can be found again later. */
  async function logGenerated(
    entryResult: GenerationResult,
    used: SmileSettings,
    label?: string,
  ) {
    if (!photo) return;
    const id = entryResult.variationId || crypto.randomUUID();
    try {
      const thumb = await thumbnail(entryResult.image);
      await addLogEntry(
        {
          id,
          patientName: patientName.trim(),
          createdAt: Date.now(),
          mode: entryResult.mode,
          testMode,
          label,
          summary: `${used.teeth} teeth · ${used.treatment} · ${used.targetShade} · ${used.shape}`,
          thumb,
        },
        { id, image: entryResult.image, originalImage: photo.dataUrl },
      );
    } catch {
      // The log is a convenience — never let it interrupt a consultation.
    }
  }

  async function generate(override?: Partial<SmileSettings>) {
    if (!photo || busy || request.current) return;
    const used = override ? { ...settings, ...override } : settings;
    if (override) setSettings(used);
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const [next] = await Promise.all([
        requestPreview(photo, used, controller),
        new Promise((resolve) => setTimeout(resolve, 2300)),
      ]);
      if (controller.signal.aborted) return;
      setVariants([]);
      setResult(next);
      setScreen("preview");
      void logGenerated(next, used);
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
          settings: { ...settings, ...v.patch },
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
      setVariants(ok);
      setOptions(ok);
      ok.forEach((v) => void logGenerated(v.result, v.settings, v.label));
      if (ok.length < wanted.length) setError(`${ok.length} of ${wanted.length} options were created. You can compare those now or try again.`);
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

  /**
   * Classical face-shape / tooth-form correspondence. "Auto" leaves the
   * clinician's chosen form alone rather than guessing at the facial outline
   * here — the model reads it from the photograph instead.
   */
  const FORM_FOR_FACE: Record<string, SmileSettings["shape"] | null> = {
    Auto: null,
    Square: "Square",
    Ovoid: "Rounded",
    Tapering: "Triangular",
  };

  const harmoniseStyles = () => {
    const matched = FORM_FOR_FACE[settings.faceShape] ?? settings.shape;
    const withNote = (extra: string): Partial<SmileSettings> => ({
      notes: [settings.notes.trim(), extra].filter(Boolean).join(". "),
    });
    void generateVariants([
      {
        label: "Harmonious",
        note: "Tooth form matched to the face.",
        patch: {
          shape: matched,
          character: "Balanced",
          ...withNote(
            "Prioritise harmony with this patient's facial outline and existing teeth above any other stylistic goal",
          ),
        },
      },
      {
        label: "Softer",
        note: "Rounded corners, open embrasures.",
        patch: {
          shape: "Rounded",
          character: "Soft",
          ...withNote(
            "Soften the incisal corners and open the embrasures a little further than the existing teeth",
          ),
        },
      },
      {
        label: "Defined",
        note: "Stronger edges and line angles.",
        patch: {
          shape: "Square",
          character: "Defined",
          ...withNote(
            "Strengthen the incisal line angles and keep the incisal plane crisp, without widening or lengthening any tooth",
          ),
        },
      },
      {
        label: "Youthful",
        note: "Dominant centrals, lively edges.",
        patch: {
          shape: matched,
          character: "Soft",
          ...withNote(
            "Give the central incisors gentle dominance over the laterals and keep the incisal embrasures noticeably open, without lengthening any tooth past the lower lip line",
          ),
        },
      },
    ]);
  };

  const compareShapes = () =>
    void generateVariants([
      { label: "Square", note: "Defined, confident edges.", patch: { shape: "Square" } },
      { label: "Rounded", note: "Soft and natural.", patch: { shape: "Rounded" } },
      { label: "Triangular", note: "Tapered and youthful.", patch: { shape: "Triangular" } },
    ]);

  function selectOption(v: Variant) {
    setSettings(v.settings);
    setSaved(false);
    setResult(v.result);
    setOptions(null);
    setScreen("preview");
  }

  function cancelGeneration() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }

  /** New Smile always starts clean: the previous patient's photo never carries over. */
  function startNewSmile() {
    newSmile();
    setScreen("photo");
  }

  function newSmile() {
    cancelGeneration();
    setPhoto(null);
    setResult(null);
    setReference(null);
    setTestMode(false);
    setTestPreview(null);
    setOptions(null);
    setVariants([]);
    setFullscreen(false);
    setSettings({ ...defaultSettings });
    setError("");
    setSaved(false);
    setScreen("start");
    void persistCase(null).catch(() => setStorageError(true));
  }

  const reportPreferences = result ? getReportPreferences(result, variants) : undefined;

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
        reportPreferences,
        testMode,
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

  const variantTabs = variants.length > 0 ? (
    <div className="variant-tabs" role="group" aria-label="Generated smile options">
      {variants.map((v) => (
        <button key={v.result.variationId} type="button" disabled={busy}
          aria-pressed={result?.variationId === v.result.variationId}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => selectOption(v)}>{v.label}</button>
      ))}
    </div>
  ) : null;

  const generation = busy ? (
    <GenerationState onCancel={cancelGeneration} />
  ) : null;

  return (
    <AppShell
      screen={screen}
      onBack={
        screen === "photo"
          ? () => setScreen("start")
          : screen === "design"
            ? () => setScreen("photo")
            : screen === "preview"
              ? () => setScreen("design")
              : undefined
      }
      step={
        screen === "photo"
          ? { current: 1, total: 3 }
          : screen === "design"
            ? { current: 2, total: 3 }
            : screen === "preview"
              ? { current: 3, total: 3 }
              : undefined
      }
      action={
        <div className="nav-actions">
          {testMode && <span className="test-mode-pill">Test mode</span>}
          <button
            className="nav-action"
            onClick={() => setLogOpen(true)}
            aria-label="Open case log"
          >
            <History size={16} strokeWidth={1.7} />
            Log
          </button>
          <button
            className="nav-action"
            onClick={() => setLibraryOpen(true)}
            aria-label="Open case library"
          >
            <BookMarked size={16} strokeWidth={1.7} />
            Library
          </button>
          {screen === "design" && (
            <button
              className="nav-action"
              onClick={() => setSettings({ ...defaultSettings })}
            >
              Reset
            </button>
          )}
          {screen === "preview" && (
            <button className="nav-action" onClick={() => setSaveOpen(true)}>
              Save
            </button>
          )}
        </div>
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
                <span className="splash-lockup">
                  <span className="wordmark">Smile</span>
                </span>
                <img
                  className="portrait-logo"
                  src="/dr-vik-logo.png"
                  alt="Dr Vik"
                />
              </div>
              <div className="start-copy">
                <h1 ref={heading} tabIndex={-1} className="splash-heading">
                  A preview
                  <br />
                  of what’s
                  <br />
                  possible.
                </h1>
                <span className="splash-rule" aria-hidden="true" />
                <p className="splash-sub">A smile that’s still you.</p>
                <div className="splash-actions">
                  <button
                    className="splash-primary"
                    onClick={startNewSmile}
                  >
                    New Smile <ArrowRight size={17} strokeWidth={1.8} />
                  </button>
                  <button
                    className="splash-outline"
                    onClick={() => setLogOpen(true)}
                  >
                    <History size={16} strokeWidth={1.7} />
                    Recent Cases
                  </button>
                  <button
                    className="splash-quiet"
                    onClick={() => void openTestMode()}
                    disabled={sampleBusy}
                  >
                    <Play size={12} fill="currentColor" strokeWidth={1.7} />
                    {sampleBusy ? "Opening…" : "Open test mode"}
                    <span>no AI credits</span>
                  </button>
                </div>
              </div>
              <div className="hero-footer">
                <p className="splash-tagline">
                  Thoughtfully planned. Personally cared for.
                </p>
              </div>
            </section>
          )}

          {screen === "photo" && (
            <section className="photo-screen">
              <PhotoUploader
                photo={photo}
                onPhoto={selectPhoto}
                onRemove={() => {
                  setPhoto(null);
                  setResult(null);
                  void persistCase(null).catch(() => setStorageError(true));
                }}
                onContinue={() => setScreen("design")}
                onCamera={() => setCamera(true)}
              />
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
                      await selectPhoto(await preparePhoto(file));
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
              <div className="patient-field">
                <label htmlFor="patient-name">Patient</label>
                <input
                  id="patient-name"
                  type="text"
                  value={patientName}
                  maxLength={60}
                  placeholder="Name or reference — saved to the case log on this device"
                  onChange={(e) => setPatientName(e.target.value)}
                />
              </div>
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
                    <button className="text-button" disabled={busy} onClick={startNewSmile}>
                      <X size={15} /> Remove photo
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
                  onHarmonise={harmoniseStyles}
                  libraryCount={libraryCount}
                  pinnedCount={pinnedCases.length}
                  onOpenLibrary={() => setLibraryOpen(true)}
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
              {variantTabs}
              <div className="preview-layout">
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
                  Consultation view
                </button>
                {generation}
              </div>
              <div className="preview-side">
              <div className="comparison-hint">
                <MoveHorizontal size={15} strokeWidth={1.6} />
                Slide to compare
              </div>
              <div className="adjust-row">
                <span className="adjust-label">Not quite right?</span>
                <button
                  className="adjust-button"
                  disabled={busy || settings.intensity <= 0}
                  onClick={() =>
                    void generate({
                      intensity: Math.max(0, settings.intensity - 20),
                    })
                  }
                >
                  <Minus size={15} strokeWidth={1.8} />
                  Softer
                </button>
                <button
                  className="adjust-button"
                  disabled={busy || settings.intensity >= 100}
                  onClick={() =>
                    void generate({
                      intensity: Math.min(100, settings.intensity + 20),
                    })
                  }
                >
                  <Plus size={15} strokeWidth={1.8} />
                  Stronger
                </button>
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
                onNew={startNewSmile}
                busy={busy}
                saving={saving}
              />
              {saved && (
                <p className="save-status" role="status">
                  <Check size={14} /> Image saved
                </p>
              )}
              </div>
              </div>
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
          <div
            className="sheet variation-sheet"
            onClick={(e) => e.stopPropagation()}
          >
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
            <p className="sheet-sub">Tap the one they prefer.</p>
            <div
              className="variation-list"
              style={
                {
                  "--cols": Math.min(5, options.length + (photo ? 1 : 0)),
                } as React.CSSProperties
              }
            >
              {photo && (
                <figure className="option-card option-original">
                  <span
                    className="option-image"
                    style={{ backgroundImage: `url(${photo.dataUrl})` }}
                    role="img"
                    aria-label="Their smile today"
                  />
                  <figcaption className="option-cap">
                    <span>Now</span>
                    <span className="option-pick">Their smile today.</span>
                  </figcaption>
                </figure>
              )}
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

      {saveOpen && result && photo && (
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
            <p className="sheet-sub">Both formats include your before and after photos, Dr Vik logo and smile preferences.</p>
            <div className="report-photo-pair" aria-label="Before and after report preview">
              <figure>
                <img src={photo.dataUrl} alt="Before: original photograph" />
                <figcaption>Before</figcaption>
              </figure>
              <figure>
                <img src={result.image} alt="After: generated smile preview" />
                <figcaption>{testMode || result.mode === "mock" ? "Demo preview" : "After · Smile preview"}</figcaption>
              </figure>
            </div>
            <div className="report-summary">
              <div className="report-summary-heading">
                <span>Your smile preferences</span>
                <img src="/dr-vik-logo.png" alt="Dr Vik" />
              </div>
              {reportPreferences ? <dl>
                {preferenceRows(reportPreferences.settings).map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl> : <p>This older preview has no saved preferences. Create a new preview to include them.</p>}
              {reportPreferences?.settings.notes.trim() && <p className="report-notes"><strong>Notes</strong>{reportPreferences.settings.notes}</p>}
            </div>
            <div className="variation-list">
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
        <ConsultView
          original={photo.dataUrl}
          preview={result.image}
          isMock={result.mode === "mock" || testMode}
          variants={variantTabs}
          onPresent={() => setPresenting(true)}
          onClose={() => setFullscreen(false)}
        />
      )}

      {presenting && photo && result && (
        <Presentation
          before={photo.dataUrl}
          after={result.image}
          patientName={patientName}
          isDemo={result.mode === "mock" || testMode}
          onClose={() => setPresenting(false)}
        />
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
      {logOpen && <CaseLog onClose={() => setLogOpen(false)} />}
      {libraryOpen && (
        <CaseLibrary
          onClose={() => setLibraryOpen(false)}
          pinned={pinnedCases}
          onPinnedChange={setPinnedCases}
          onCountChange={setLibraryCount}
        />
      )}
    </AppShell>
  );
}
