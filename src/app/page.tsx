"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookMarked,
  Check,
  Columns2,
  Film,
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
import { EditArea } from "@/components/EditArea";
import { DesignControls } from "@/components/DesignControls";
import { PatientPhoto } from "@/components/PatientPhoto";
import { GenerationState } from "@/components/GenerationState";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { ConsultView } from "@/components/ConsultView";
import { Presentation } from "@/components/Presentation";
import { BottomActionBar, Disclaimer } from "@/components/PreviewActions";
import { CaseLog } from "@/components/CaseLog";
import { ClinicianReview } from "@/components/ClinicianReview";
import { ValidationPanel } from "@/components/ValidationPanel";
import { CaseLibrary } from "@/components/CaseLibrary";
import { Implications } from "@/components/Implications";
import { SmileAnalysisPanel } from "@/components/SmileAnalysis";
import { RevealVideoSheet } from "@/components/RevealVideoSheet";
import {
  defaultSettings,
  caseMaterials,
  type Photo,
  type LibraryCase,
  type PreviewPreferences,
  type Screen,
  type SmileSettings,
  type GenerationResult,
  type SmileVariant,
} from "@/lib/types";
import { readCase, persistCase } from "@/lib/storage";
import { addLogEntry } from "@/lib/caseLog";
import { thumbnail } from "@/lib/thumb";
import { preparePhoto } from "@/lib/photos";
import { assessResultScaleFromDataUrls } from "@/lib/resultCheck";
import { getReportPreferences, preferenceRows } from "@/lib/report";
import { useSmileTools } from "@/lib/useSmileTools";
import { GenerationCosts, generationCostLabel } from "@/components/GenerationCosts";
import { emptyCaseCosts, completeCost, type GenerationPricing, type ImageResolution } from "@/lib/generation/cost";
import { isNoChangeDesign } from "@/lib/generation/designPlan";
import { exceedsRequestLimit, previewFingerprint } from "@/lib/generation/requestPolicy";
import { toothSummary } from "@/lib/teeth";
import { imageSchema } from "@/lib/generation/schema";

type Variant = SmileVariant;
const ANALYSIS_KEY = "smile.analysis";

/**
 * Put the edit back onto the original photograph so only the mouth can
 * change. Runs on the device; if no face is found the edit is kept as-is.
 */
async function lockFace(
  photo: Photo,
  image: string,
): Promise<Pick<GenerationResult, "image" | "faceLocked" | "lipsMoved" | "editAreaProtected">> {
  const { lockFaceOutsideLips } = await import("@/lib/face/mouthLock");
  const r = await lockFaceOutsideLips(photo.dataUrl, image);
  const imageOut = photo.editMask ? await (await import("@/lib/editMask")).protectOutsideEditMask(photo.dataUrl, r.image, photo.editMask) : r.image;
  return { image: imageOut, editAreaProtected: Boolean(photo.editMask), faceLocked: r.locked, lipsMoved: r.lipsMoved };
}

export default function Smile() {
  const [screen, setScreen] = useState<Screen>("start");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [requestLimit, setRequestLimit] = useState(0);
  const [batchPending, setBatchPending] = useState<{ label: string; note: string; patch: Partial<SmileSettings> }[] | null>(null);
  const [costs, setCosts] = useState(emptyCaseCosts);
  const [pricing, setPricing] = useState<GenerationPricing | null>(null);
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [costsOpen, setCostsOpen] = useState(false);
  const costSession = useRef(0);
  const effectiveResolution = pricing?.supportsDraft ? resolution : "1K";
  function resetCaseCosts() {
    costSession.current += 1;
    setCosts(emptyCaseCosts());
    setResolution("1K");
  }
  function toggleCosts(open: boolean) {
    setCostsOpen(open);
    try { localStorage.setItem("smile.clinician-costs", String(open)); } catch { /* Device preference only. */ }
  }
  useEffect(() => {
    let active = true;
    try { setCostsOpen(localStorage.getItem("smile.clinician-costs") === "true"); } catch { /* Default closed. */ }
    fetch("/api/generation-cost", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((p: GenerationPricing) => {
        if (active && typeof p.model === "string" && typeof p.supportsDraft === "boolean") setPricing(p);
      }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editAreaOpen, setEditAreaOpen] = useState(false);
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
  const [videoOpen, setVideoOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testPreview, setTestPreview] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [validationCaseId, setValidationCaseId] = useState<string>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryCount, setLibraryCount] = useState(0);
  // Pinned cases override the automatic match, and are a chairside choice for
  // this session rather than something saved with the case.
  const [pinnedCases, setPinnedCases] = useState<string[]>([]);
  // A clinician preference, remembered on this device only.
  const [analysisOn, setAnalysisOn] = useState(false);
  useEffect(() => {
    try {
      setAnalysisOn(localStorage.getItem(ANALYSIS_KEY) === "on");
    } catch {
      // Private browsing or blocked storage: the toggle simply starts off.
    }
  }, []);
  function toggleAnalysis(on: boolean) {
    setAnalysisOn(on);
    try {
      localStorage.setItem(ANALYSIS_KEY, on ? "on" : "off");
    } catch {
      // Not remembered on this device, but still works for this session.
    }
  }
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
          setRequestLimit(c.requestLimit ?? 0);
          setCosts(c.costs ?? emptyCaseCosts());
          setResolution(c.resolution ?? "1K");
          setPhoto(c.photo);
          setValidationCaseId(c.validationCaseId);
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
            costs,
            requestLimit,
            resolution,
            patientName,
            validationCaseId,
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
  }, [photo, settings, result, screen, ready, testMode, testPreview, reference, variants, patientName, costs, resolution, validationCaseId, requestLimit]);

  useEffect(() => {
    document.body.classList.toggle("consult-open", fullscreen);
    return () => document.body.classList.remove("consult-open");
  }, [fullscreen]);

  // Fetch the on-device face model and read the patient's face while the
  // clinician is still choosing settings, so the result isn't kept waiting.
  const photoUrl = photo?.dataUrl;
  useEffect(() => {
    if (screen !== "design" || !photoUrl) return;
    void import("@/lib/face/landmarks")
      .then((m) => m.detectFace(photoUrl))
      .catch(() => {});
  }, [screen, photoUrl]);

  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  async function selectPhoto(p: Photo) {
    setValidationCaseId(undefined);
    setVariants([]);
    setOptions(null);
    if (testMode) resetCaseCosts();
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
      resetCaseCosts();
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

  async function startValidation(entry: LibraryCase) {
    try {
      const media = await (await import("@/lib/caseLibrary")).readLibraryMedia(entry.id);
      if (!media?.beforeImage) throw new Error("Add a before photograph to this library case first.");
      const blob = await (await fetch(media.beforeImage)).blob();
      await selectPhoto(await preparePhoto(new File([blob], "Validation before.jpg", { type: blob.type })));
      resetCaseCosts(); setTestMode(false); setReference(null); setPinnedCases([]); setPatientName("");
      const selectedTeeth = entry.context?.teeth ?? defaultSettings.selectedTeeth;
      setSettings({ ...defaultSettings, treatment: entry.material, selectedTeeth, toothPlans: selectedTeeth.map(tooth => ({ tooth, intent: "Auto", condition: "Natural" })), caseFeatures: entry.context?.features ?? [] });
      setValidationCaseId(entry.id); setLibraryOpen(false); setScreen("design");
    } catch (e) { setError(e instanceof Error ? e.message : "Validation case could not be opened."); }
  }

  async function requestPreview(
    photoIn: Photo,
    settingsIn: SmileSettings,
    controller: AbortController,
  ): Promise<GenerationResult> {
    const started = performance.now();
    const session = costSession.current;
    const preferences: PreviewPreferences = { styleReferenceStatus: "off", styleReferenceCount: 0, settings: structuredClone(settingsIn), referenceUsed: Boolean(reference), testMode };
    if (testMode && testPreview) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (controller.signal.aborted) throw controller.signal.reason;
      const { alignPreview } = await import("@/lib/photos");
      const locked = await lockFace(photoIn, await alignPreview(testPreview, photoIn));
      return {
        ...locked,
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
          3,
          settingsIn,
        );
        const heldOutImage = validationCaseId ? (await (await import("@/lib/caseLibrary")).readLibraryMedia(validationCaseId))?.image : undefined;
        styleReferences = await loadStyleReferences(chosen.filter(c => c.id !== validationCaseId).map((c) => c.id), heldOutImage);
        preferences.styleReferenceCount = styleReferences.length;
        preferences.styleReferenceStatus = styleReferences.length ? "used" : "no-match";
      } catch {
        styleReferences = [];
        preferences.styleReferenceStatus = "unavailable";
      }
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    const fingerprint = await previewFingerprint({ image: photoIn.dataUrl, editMask: photoIn.editMask, settings: settingsIn, resolution: effectiveResolution, provider: pricing?.model, reference: reference?.dataUrl, styleReferences });
    const reusable = [result, ...variants.map(v => v.result)].find(r => r?.requestFingerprint === fingerprint);
    if (reusable) return reusable;
    if (exceedsRequestLimit(costs.requested, 1, requestLimit)) throw new Error("This case has reached its request allowance. Review Clinician costs before generating more.");
    setCosts((c) => ({ ...c, requested: c.requested + 1 }));
    const r = await fetch("/api/generate-smile", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Smile-Request-Id": crypto.randomUUID() },
      body: JSON.stringify({
        originalImage: photoIn.dataUrl,
        resolution: effectiveResolution,
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
    if (costSession.current === session) {
      const receipt = next.mode === "mock"
        ? { usd: 0, basis: "usage" as const, model: "mock", resolution: effectiveResolution }
        : next.cost;
      setCosts((c) => completeCost(c, receipt));
    }
    if (next.mode === "live") {
      const { alignPreview } = await import("@/lib/photos");
      next = { ...next, ...(await lockFace(photoIn, await alignPreview(next.image, photoIn))) };
      // Advisory only, and only when there's a trustworthy anchor to check
      // against — an uploaded photo has no capture guide to measure from.
      if (photoIn.framing) {
        const assessment = await assessResultScaleFromDataUrls(
          photoIn.dataUrl,
          next.image,
          photoIn.framing,
        ).catch(() => null);
        if (assessment) next = { ...next, scaleFlag: assessment.flag };
      }
    }
    return { ...next, preferences, requestFingerprint: fingerprint, elapsedSeconds: (performance.now() - started) / 1000 };
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
          summary: `${toothSummary(used)} · ${used.treatment} · ${used.targetShade} · ${used.shape}`,
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
    if (isNoChangeDesign(used)) { setError("No change selected. Choose a different shade or design goal; no AI request was sent."); return; }
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
    confirmed = false,
  ) {
    if (!photo || busy || request.current) return;
    if (!testMode && exceedsRequestLimit(costs.requested, wanted.length, requestLimit)) { setError("This batch could exceed your case request allowance. Review Clinician costs or create a single preview."); return; }
    if (!testMode && !confirmed) { setBatchPending(wanted); return; }
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
   * Optional style exploration. These presets remain subordinate to the
   * selected goal and protected anatomy; they are not clinical proportions.
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
      notes: [settings.notes.trim(), extra].filter(Boolean).join(". ").slice(0,400),
    });
    void generateVariants([
      {
        label: "Harmonious",
        note: "Balanced form within your design goal.",
        patch: {
          shape: matched,
          character: "Balanced",
          ...withNote(
            "Use balanced line angles within the selected goal; the chosen tooth form takes precedence over face-style preferences",
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
    ]);
  };

  const compareMaterials = () => void generateVariants(caseMaterials.map(treatment => ({ label: treatment, note: "Same selected goal, tooth plan and shade; material changes. Check contours across these independent illustrations.", patch: { treatment } })));

  const compareShapes = () =>
    void generateVariants([
      { label: "Square", note: "Defined, confident edges.", patch: { shape: "Square" } },
      { label: "Rounded", note: "Soft and natural.", patch: { shape: "Rounded" } },
      { label: "Triangular", note: "Tapered, delicate form.", patch: { shape: "Triangular" } },
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
    setValidationCaseId(undefined);
    newSmile();
    setScreen("photo");
  }

  function newSmile() {
    setValidationCaseId(undefined);
    setBatchPending(null);
    cancelGeneration();
    resetCaseCosts();
    setPhoto(null);
    setResult(null);
    setReference(null);
    setTestMode(false);
    setTestPreview(null);
    setOptions(null);
    setVariants([]);
    setFullscreen(false);
    setEditAreaOpen(false);
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
                  resetCaseCosts();
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
                  placeholder="Name or reference"
                  onChange={(e) => setPatientName(e.target.value)}
                />
              </div>
              {validationCaseId && <p className="test-notice">Outcome validation · the actual after photo is held out. Set the actual treatment goal and shade before generating.</p>}
              <div className="design-layout">
                <div className="photo-column">
                  {result ? (
                    <div className="preview-stage">
                      <BeforeAfterSlider
                        original={photo.dataUrl}
                        preview={result.image}
                        isMock={result.mode === "mock"}
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
                      {toothSummary(settings)} · {settings.targetShade}
                    </span>
                  </div>
                </div>
                <DesignControls
                  costs={{ pricing, resolution: effectiveResolution, onResolution: setResolution, costs, testMode, busy, open: costsOpen, onOpen: toggleCosts, requestLimit, onRequestLimit: setRequestLimit }}
                  onEditArea={() => setEditAreaOpen(true)}
                  hasEditArea={Boolean(photo.editMask)}
                  settings={settings}
                  onChange={setSettings}
                  onGenerate={() => void generate()}
                  onCompare={compareShapes}
                  onCompareMaterials={compareMaterials}
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
                Slide to compare, or overlay to line up the teeth
              </div>
              {costsOpen && <p className="control-hint">Each adjustment: {generationCostLabel(pricing, effectiveResolution, 1, testMode)}</p>}
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
              <label className="style-toggle analysis-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  checked={analysisOn}
                  onChange={(e) => toggleAnalysis(e.target.checked)}
                />
                <span className="analysis-toggle-text">
                  Smile analysis
                  <small>Relative facial reference lines</small>
                </span>
              </label>
              {result.scaleFlag === "grew" && (
                <p className="scale-notice" role="status">
                  <span>Check the size</span>This result may show the teeth
                  larger or longer than the patient’s own — compare closely,
                  or try Softer, before presenting it.
                </p>
              )}
              {!testMode && ["no-match", "unavailable"].includes(result.preferences?.styleReferenceStatus ?? "") && <p className="scale-notice" role="status"><span>No own-case references used</span>{result.preferences?.styleReferenceStatus === "unavailable" ? "The case library could not be opened for this result." : "No available reference matched the chosen treatment technique or pinned selection."} Add matching cases in the library to use them next time.</p>}
              {result.mode === "live" && !testMode && (
                <p className="scale-notice" role="status"><span>{result.editAreaProtected ? "Edit area protected" : result.faceLocked ? "Face protected — check dental anatomy" : "Automatic protection unavailable"}</span>
                  {result.editAreaProtected ? "The original photo is restored outside your painted area. Check that the boundary excludes gums and untreated teeth, and review the design inside it." : result.faceLocked ? "Automatic protection covers the surrounding face, not individual teeth or gums. Compare gum margins, lower teeth and untreated teeth before presenting. Use Protect edit area for precise boundaries." : "The face could not be protected automatically. Inspect the whole result against the original, or use Protect edit area and generate again before presenting."}
                </p>
              )}
              {result.lipsMoved && (
                <p className="scale-notice" role="status">
                  <span>Lips changed</span>This version moved the lip line as
                  well as the teeth, so it may not match their own smile — try
                  again for a closer match.
                </p>
              )}
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
              <GenerationCosts pricing={pricing} resolution={effectiveResolution} onResolution={setResolution} costs={costs} testMode={testMode} busy={busy} open={costsOpen} onOpen={toggleCosts} requestLimit={requestLimit} onRequestLimit={setRequestLimit} />
              {!testMode && result.mode === "live" && <ClinicianReview key={result.variationId} result={result} onReview={review => { const next = { ...result, review }; setResult(next); setVariants(vs => vs.map(v => v.result.variationId === next.variationId ? { ...v, result: next } : v)); }} />}
              {validationCaseId && <ValidationPanel key={`${validationCaseId}:${result.variationId}`} caseId={validationCaseId} result={result} before={photo.dataUrl} />}
              <BottomActionBar
                anotherCost={costsOpen ? generationCostLabel(pricing, effectiveResolution, 3, testMode) : undefined}
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
              <Implications
                settings={reportPreferences?.settings ?? settings}
                result={result}
              />
              </div>
              </div>
              {analysisOn && (
                <SmileAnalysisPanel
                  before={photo.dataUrl}
                  after={result.image}
                  isDemo={result.mode === "mock" || testMode}
                  patientName={patientName}
                />
              )}
              <Disclaimer />
            </section>
          )}
        </>
      )}

      {editAreaOpen && photo && <EditArea photo={photo} onClose={() => setEditAreaOpen(false)} onSave={(mask) => { setPhoto({ ...photo, editMask: mask }); setEditAreaOpen(false); }} />}
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
                  {o.result.scaleFlag === "grew" && (
                    <span className="option-flag">Check size</span>
                  )}
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

      {batchPending && <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Confirm generation batch"><div className="sheet"><h2>Create {batchPending.length} options?</h2><p className="sheet-sub">{generationCostLabel(pricing, effectiveResolution, batchPending.length, testMode)}. {pricing?.free ? "Mock previews have no AI generation charge." : "This is the image-output component; input, reference and thinking tokens cost extra."} Existing identical results may be reused without a new request.</p><p className="control-hint">Options are generated independently. Compare tooth contours and protected anatomy; geometry is not guaranteed to be identical.</p><button className="primary-button" onClick={() => { const wanted = batchPending; setBatchPending(null); void generateVariants(wanted, true); }}>Create {batchPending.length} options</button><button className="secondary-button" onClick={() => setBatchPending(null)}>Cancel</button></div></div>}
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
            <p className="sheet-sub">The images include the before and after photos, Dr Vik logo, smile preferences and what the treatment would involve. The video shows the new smile fading in.</p>
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
              {result.review && <p className="report-notes"><strong>Reviewed by {result.review.reviewer}</strong>{result.review.notes}</p>}
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
              <button
                className="save-option"
                onClick={() => {
                  setSaveOpen(false);
                  setVideoOpen(true);
                }}
              >
                <Film size={18} strokeWidth={1.6} />
                <span>
                  Reveal video
                  <small>Their smile, then the new one fading in.</small>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {videoOpen && photo && result && (
        <RevealVideoSheet
          before={photo.dataUrl}
          after={result.image}
          isDemo={result.mode === "mock" || testMode}
          patientName={patientName}
          onClose={() => setVideoOpen(false)}
        />
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
          onValidate={entry => void startValidation(entry)}
        />
      )}
    </AppShell>
  );
}
