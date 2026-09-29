"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Download,
  Film,
  ImagePlus,
  Maximize2,
  Minus,
  MoveHorizontal,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Rows2,
  Settings,
  Undo2,
  X,
} from "lucide-react";
import { AnalysisSymbol, CasesSymbol, IconTile } from "@/components/icons/SmileIcons";
import { BrandLaunch, BrandLockup, CreatorSignature } from "@/components/Brand";
import { AppShell } from "@/components/AppShell";
import { FloatingPanel } from "@/components/FloatingPanel";
import { PhotoUploader } from "@/components/PhotoUploader";
import { CameraSheet } from "@/components/CameraSheet";
import { EditArea } from "@/components/EditArea";
import { DesignStudio } from "@/components/studio/DesignStudio";
import { PatientPhoto } from "@/components/PatientPhoto";
import { GenerationState } from "@/components/GenerationState";
import { BeforeAfterSlider, type CompareMode } from "@/components/BeforeAfterSlider";
import { ConsultView } from "@/components/ConsultView";
import { Presentation } from "@/components/Presentation";
import { BottomActionBar, Disclaimer } from "@/components/PreviewActions";
import { PreviewCompactMenu } from "@/components/PreviewCompactMenu";
import { CaseLog } from "@/components/CaseLog";
import { ClinicianReview } from "@/components/ClinicianReview";
import { ValidationPanel } from "@/components/ValidationPanel";
import { CaseLibrary } from "@/components/CaseLibrary";
import { Implications } from "@/components/Implications";
import { SmileAnalysisPanel } from "@/components/SmileAnalysis";
import { RevealVideoSheet } from "@/components/RevealVideoSheet";
import { AiProcessingConsentDialog } from "@/components/AiProcessingConsent";
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
  type Treatment,
  type UploadAuthority,
} from "@/lib/types";
import { readCase, persistCase } from "@/lib/storage";
import { updateLogReview } from "@/lib/caseLog";
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
import { AI_CONSENT_VERSION, fingerprintPhotoForConsent, type AiProcessingConsent } from "@/lib/aiConsent";
import { apiUrl } from "@/services/api/client";
import { generateSmileImage } from "@/services/ai/smileImageService";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { SmileGenerationError } from "@/services/ai/smileImageService";
import { useAccount } from "@/components/account/AccountProvider";
import { useCaseLibrary } from "@/components/caseLibrary/caseLibraryContext";
import { DEFAULT_STYLE_REFERENCE_LIMIT, findMatchingStyleReferences } from "@/lib/styleMatching";
import { StyleFeedback } from "@/components/caseLibrary/StyleFeedback";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { HomeHeadline, ProfileButton, RecentCases } from "@/components/home/HomeWorkspace";
import { DOCUMENT_VERSIONS } from "@/config/legal";

type Variant = SmileVariant;
const DEMO_MATERIAL_IMAGES: Record<Exclude<Treatment, "Composite">, string> = {
  "Single-shade composite": "/demo-single-shade-composite.png",
  "Layered composite": "/demo-storyboard-after.png",
  Porcelain: "/demo-porcelain.png",
};

/** Let the full-screen generation view paint before image processing blocks Safari. */
function waitForGenerationScreen(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      resolve();
    };
    const fallback = window.setTimeout(finish, 120);
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
  });
}

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

const ignoreCount = () => {};

export default function Smile() {
  const [screen, setScreen] = useState<Screen>("start");
  const [photo, setPhoto] = useState<Photo | null>(null);
  // Groups this case's visualisations; see SmileComposeCase in src/models/case.ts.
  const [caseId, setCaseId] = useState("");
  const [uploadAuthority, setUploadAuthority] = useState<UploadAuthority | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [requestLimit, setRequestLimit] = useState(0);
  const [batchPending, setBatchPending] = useState<{ label: string; note: string; patch: Partial<SmileSettings> }[] | null>(null);
  const [aiConsent, setAiConsent] = useState<AiProcessingConsent | null>(null);
  const [pendingAiConsent, setPendingAiConsent] = useState<{
    photoFingerprint: string;
    action: { kind: "single"; override?: Partial<SmileSettings> } | { kind: "variants"; wanted: { label: string; note: string; patch: Partial<SmileSettings> }[] };
  } | null>(null);
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
    fetch(apiUrl("/api/generation-cost"), { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((p: GenerationPricing) => {
        if (active && typeof p.model === "string" && typeof p.supportsDraft === "boolean") setPricing(p);
      }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewMode, setPreviewMode] = useState<CompareMode>("slide");
  const [reviewOpen, setReviewOpen] = useState(false);
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
  const [logEntry, setLogEntry] = useState<string | undefined>();
  const [presenting, setPresenting] = useState(false);
  const [validationCaseId, setValidationCaseId] = useState<string>();
  // Device builds only: the older pin / validation / import tools for the on-device library.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const desktopReviewEligible = screen === "preview" && result?.mode === "live" && !testMode;
  const resultVariationId = result?.variationId;
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 960px) and (orientation: landscape) and (hover: hover) and (pointer: fine)");
    const update = () => setReviewOpen(Boolean(desktopReviewEligible && desktop.matches));
    update();
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, [desktopReviewEligible, resultVariationId]);
  // Pinned cases override the automatic match, and are a chairside choice for
  // this session rather than something saved with the case.
  const [pinnedCases, setPinnedCases] = useState<string[]>([]);
  // Smile analysis opens in its own sheet from the result screen.
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Undo / redo for the Studio's design choices. A burst of changes (a slider
  // drag, quick taps) within HISTORY_BURST_MS is one step.
  const history = useRef<{ past: SmileSettings[]; future: SmileSettings[]; last: number }>({ past: [], future: [], last: 0 });
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const HISTORY_BURST_MS = 600;
  const syncHistory = () => setHistoryState({ canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0 });
  function changeSettings(next: SmileSettings) {
    const h = history.current;
    const now = Date.now();
    if (now - h.last > HISTORY_BURST_MS) h.past = [...h.past.slice(-49), settings];
    h.future = [];
    h.last = now;
    setSettings(next);
    syncHistory();
  }
  function undoSettings() {
    const h = history.current;
    const previous = h.past.pop();
    if (!previous) return;
    h.future.push(settings);
    h.last = 0;
    setSettings(previous);
    syncHistory();
  }
  function redoSettings() {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(settings);
    h.last = 0;
    setSettings(next);
    syncHistory();
  }
  function clearSettingsHistory() {
    history.current = { past: [], future: [], last: 0 };
    syncHistory();
  }
  // ⌘Z / ⇧⌘Z with an iPad keyboard, except while typing in a field.
  useEffect(() => {
    if (screen !== "design") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redoSettings(); else undoSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useSmileTools({ screen, hasPhoto: !!photo, settings, busy }, setSettings);
  const account = useAccount();
  const caseLibrary = useCaseLibrary();
  const { setLegacyTools } = caseLibrary;
  useEffect(() => {
    setLegacyTools(() => setLibraryOpen(true));
    return () => setLegacyTools(null);
  }, [setLegacyTools]);

  /** Per-case clinician authority confirmation, kept with the case and (signed in) server-side. */
  function confirmUploadAuthority() {
    const record = { version: DOCUMENT_VERSIONS.upload_authority, confirmedAt: Date.now() };
    setUploadAuthority(record);
    if (caseId) void account.recordConsent({ type: "upload_authority", version: record.version, caseId });
  }

  /**
   * Live generation needs a signed-in account with Pro (the server enforces
   * this too). Test mode never needs an account. Returns false when a sheet
   * was opened instead.
   */
  function accountReadyForGeneration(): boolean {
    if (testMode || !account.configured) return true;
    if (!account.user) { account.openAuth("signIn", "generate"); return false; }
    if (!account.hasProAccess) { account.openPaywall(); return false; }
    return true;
  }

  /** Route account-related refusals to the right sheet; other errors show as text. */
  function showGenerationError(e: unknown, fallback: string) {
    if (e instanceof SmileGenerationError && e.code === "auth_required") { account.openAuth("signIn", "generate"); return; }
    if (e instanceof SmileGenerationError && e.code === "mfa_required") { account.openMfa("challenge"); return; }
    if (e instanceof SmileGenerationError && (e.code === "subscription_required" || e.code === "no_active_allowance")) { void account.refresh(); account.openPaywall(); return; }
    if (e instanceof SmileGenerationError && e.code === "allowance_exhausted") void account.refresh();
    setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : fallback);
  }
  const replacement = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const logWrites = useRef(new Map<string, Promise<void>>());
  const caseSession = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstScreen = useRef(true);

  useEffect(() => {
    let active = true;
    readCase()
      .then((c) => {
        if (active && c) {
          setCaseId(c.caseId ?? crypto.randomUUID());
          setUploadAuthority(c.uploadAuthority ?? null);
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
          setAiConsent(c.aiConsent ?? null);
          // Specific target shades (A1, B1, BL3–BL1) are chosen in the Studio's Shade step, so they are kept as saved.
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
            caseId,
            uploadAuthority,
            photo,
            costs,
            requestLimit,
            resolution,
            patientName,
            aiConsent,
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
  }, [caseId, uploadAuthority, photo, settings, result, screen, ready, testMode, testPreview, reference, variants, patientName, aiConsent, costs, resolution, validationCaseId, requestLimit]);

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
    const nextCaseId = testMode || !caseId ? crypto.randomUUID() : caseId;
    setCaseId(nextCaseId);
    const nextSettings = testMode ? { ...defaultSettings } : settings;
    const nextReference = testMode ? null : reference;
    setValidationCaseId(undefined);
    setAiConsent(null);
    setPendingAiConsent(null);
    setVariants([]);
    setOptions(null);
    if (testMode) {
      resetCaseCosts();
      setRequestLimit(0);
      setSettings(nextSettings);
      setReference(null);
      setPinnedCases([]);
      setPatientName("");
    }
    setPhoto(p);
    setResult(null);
    setTestMode(false);
    setTestPreview(null);
    setError("");
    setCamera(false);
    // Commit the selection immediately, even while still on the start screen.
    try {
      await persistCase({ caseId: nextCaseId, uploadAuthority, photo: p, settings: nextSettings, reference: nextReference, result: null, aiConsent: null,
        screen: screen === "start" || screen === "photo" ? "photo" : "design", testMode: false, testPreview: null });
    } catch {
      setStorageError(true);
    }
  }

  async function openTestMode() {
    if (sampleBusy) return;
    const session = caseSession.current;
    setSampleBusy(true);
    setError("");
    try {
      const [patientResponse, previewResponse] = await Promise.all([
        fetch("/demo-storyboard-before.png"),
        fetch(DEMO_MATERIAL_IMAGES["Single-shade composite"]),
      ]);
      if (!patientResponse.ok || !previewResponse.ok) throw new Error();
      const [patientBlob, previewBlob] = await Promise.all([
        patientResponse.blob(),
        previewResponse.blob(),
      ]);
      const [patient, preview] = await Promise.all([
        preparePhoto(
          new File([patientBlob], "SmileCompose demo before.png", {
            type: "image/png",
          }),
        ),
        preparePhoto(
          new File([previewBlob], "SmileCompose demo after.png", {
            type: "image/png",
          }),
        ),
      ]);
      if (caseSession.current !== session) return;
      newSmile();
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


  async function startValidation(entry: LibraryCase) {
    const session = caseSession.current;
    try {
      const media = await (await import("@/lib/caseLibrary")).readLibraryMedia(entry.id);
      if (!media?.beforeImage) throw new Error("Add a before photograph to this library case first.");
      const blob = await (await fetch(media.beforeImage)).blob();
      const prepared = await preparePhoto(new File([blob], "Validation before.jpg", { type: blob.type }));
      if (caseSession.current !== session) return;
      newSmile();
      setPhoto(prepared);
      const selectedTeeth = entry.context?.teeth ?? defaultSettings.selectedTeeth;
      setSettings({ ...defaultSettings, treatment: entry.material, selectedTeeth, toothPlans: selectedTeeth.map(tooth => ({ tooth, intent: "Auto", condition: "Natural" })), caseFeatures: entry.context?.features ?? [] });
      setValidationCaseId(entry.id); setLibraryOpen(false); setScreen("design");
    } catch (e) { setError(e instanceof Error ? e.message : "Validation case could not be opened."); }
  }

  async function requestPreview(
    photoIn: Photo,
    settingsIn: SmileSettings,
    controller: AbortController,
    consentVersion?: string,
  ): Promise<GenerationResult> {
    const started = performance.now();
    const session = costSession.current;
    const preferences: PreviewPreferences = { styleReferenceStatus: "off", styleReferenceCount: 0, settings: structuredClone(settingsIn), referenceUsed: Boolean(reference), testMode };
    if (testMode) {
      const material = settingsIn.treatment === "Composite"
        ? "Single-shade composite"
        : settingsIn.treatment;
      const response = await fetch(DEMO_MATERIAL_IMAGES[material], {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("The demo material image couldn’t be loaded. Please try again.");
      const blob = await response.blob();
      const prepared = await preparePhoto(new File([blob], `${material}.png`, { type: "image/png" }));
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (controller.signal.aborted) throw controller.signal.reason;
      const { alignPreview } = await import("@/lib/photos");
      const locked = await lockFace(photoIn, await alignPreview(prepared.dataUrl, photoIn));
      return {
        ...locked,
        mode: "live",
        variationId: crypto.randomUUID(),
        preferences,
      };
    }
    // Case Library style references are attached by the server, from the
    // signed-in account's own private library; the app never sends them. The
    // matching IDs only make the reuse fingerprint change when the library does.
    const styleReferences = settingsIn.libraryStyle
      ? findMatchingStyleReferences(caseLibrary.candidates, settingsIn, DEFAULT_STYLE_REFERENCE_LIMIT).map(m => m.id)
      : [];
    if (controller.signal.aborted) throw controller.signal.reason;
    const fingerprint = await previewFingerprint({ image: photoIn.dataUrl, editMask: photoIn.editMask, settings: settingsIn, resolution: effectiveResolution, provider: pricing?.model, reference: reference?.dataUrl, styleReferences });
    const reusable = [result, ...variants.map(v => v.result)].find(r => r?.requestFingerprint === fingerprint);
    if (reusable) return reusable;
    if (exceedsRequestLimit(costs.requested, 1, requestLimit)) throw new Error("This case has reached its request allowance. Review Clinician costs before generating more.");
    const { prepareGenerationPhoto } = await import("@/lib/photos");
    const requestCanvas = await prepareGenerationPhoto(photoIn);
    if (controller.signal.aborted) throw controller.signal.reason;
    let next = await generateSmileImage({
      caseId,
      originalImage: requestCanvas.photo.dataUrl,
      sourceBounds: requestCanvas.sourceBounds,
      framing: requestCanvas.photo.framing,
      resolution: effectiveResolution,
      referenceImage: reference?.dataUrl,
      settings: settingsIn,
      consentVersion,
    }, {
      signal: controller.signal,
      accessToken: await account.getAccessToken(),
      onSubmitted: () => setCosts((c) => ({ ...c, requested: c.requested + 1 })),
    });
    if (costSession.current === session) {
      const receipt = next.mode === "mock"
        ? { usd: 0, basis: "usage" as const, model: "mock", resolution: effectiveResolution }
        : next.cost;
      setCosts((c) => completeCost(c, receipt));
    }
    const { alignPreview } = await import("@/lib/photos");
    const alignedImage = await alignPreview(next.image, photoIn, requestCanvas);
    next = { ...next, image: alignedImage };
    if (next.mode === "live") {
      next = { ...next, ...(await lockFace(photoIn, alignedImage)) };
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
    if (settingsIn.libraryStyle) {
      const used = next.styleReferencesUsed?.count ?? 0;
      preferences.styleReferenceCount = used;
      preferences.styleReferenceStatus = used ? "used" : "no-match";
    }
    return { ...next, preferences, requestFingerprint: fingerprint, elapsedSeconds: (performance.now() - started) / 1000 };
  }

  /** Every generated preview is logged locally so it can be found again later. */
  async function logGenerated(
    entryResult: GenerationResult,
    used: SmileSettings,
    label?: string,
    consent?: AiProcessingConsent | null,
  ) {
    if (!photo) return;
    const id = entryResult.variationId || crypto.randomUUID();
    const writing = (async () => {
      try {
        const thumb = await thumbnail(entryResult.image);
        await getCaseRepository().recordVisualisation(
          {
            id,
            caseId: caseId || undefined,
            patientName: patientName.trim(),
            createdAt: Date.now(),
            mode: entryResult.mode,
            testMode,
            label,
            summary: `${toothSummary(used)} · ${used.treatment} · ${used.targetShade} · ${used.shape}`,
            thumb,
          },
          { id, image: entryResult.image, originalImage: photo.dataUrl, preferences: entryResult.preferences ?? { settings: used, testMode }, review: entryResult.review, scaleFlag: entryResult.scaleFlag, aiConsent: testMode ? undefined : consent ?? aiConsent ?? undefined, generation: entryResult.generation },
        );
      } catch {
        setStorageError(true);
      }
    })();
    logWrites.current.set(id, writing);
    await writing;
    if (logWrites.current.get(id) === writing) logWrites.current.delete(id);
  }

  async function persistConsentBeforeGeneration(consent: AiProcessingConsent, casePhoto: Photo, caseSettings: SmileSettings) {
    try {
      await persistCase({
        caseId,
        uploadAuthority,
        photo: casePhoto,
        settings: caseSettings,
        costs,
        requestLimit,
        resolution,
        patientName,
        aiConsent: consent,
        validationCaseId,
        testMode: false,
        testPreview: null,
        reference,
        variants,
        result,
        screen: screen === "compare" ? "design" : screen,
      });
      return true;
    } catch {
      setStorageError(true);
      setError("This device couldn’t save the permission record, so no AI request was sent. Check local storage and try again.");
      return false;
    }
  }

  function reviewResult(review?: GenerationResult["review"]) {
    if (!result) return;
    const next = { ...result, review };
    setResult(next);
    setVariants(vs => vs.map(v => v.result.variationId === next.variationId ? { ...v, result: next } : v));
    // The initial thumbnail/write may still be finishing. Preserve the review
    // on that exact saved version without recreating a deliberately deleted case.
    void (logWrites.current.get(next.variationId) ?? Promise.resolve())
      .then(() => updateLogReview(next.variationId, review))
      .catch(() => setStorageError(true));
  }

  async function generate(override?: Partial<SmileSettings>, approvedConsent?: AiProcessingConsent) {
    if (!photo || busy || request.current) return;
    const used = override ? { ...settings, ...override } : settings;
    if (isNoChangeDesign(used)) { setError("No change selected. Choose a different shade or design goal; no AI request was sent."); return; }
    if (!accountReadyForGeneration()) return;
    const consentForRequest = testMode ? null : approvedConsent ?? aiConsent;
    if (!testMode) {
      let photoFingerprint: string;
      try { photoFingerprint = await fingerprintPhotoForConsent(photo.dataUrl, reference?.dataUrl); }
      catch { setError("This device couldn’t verify the permission record. No AI request was sent. Please reload the app and try again."); return; }
      if (consentForRequest?.version !== AI_CONSENT_VERSION || consentForRequest.photoFingerprint !== photoFingerprint) {
        setPendingAiConsent({ photoFingerprint, action: { kind: "single", override } });
        return;
      }
    }
    if (override) setSettings(used);
    if (consentForRequest && !testMode && !await persistConsentBeforeGeneration(consentForRequest, photo, used)) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await waitForGenerationScreen();
      if (controller.signal.aborted) return;
      const [next] = await Promise.all([
        requestPreview(photo, used, controller, consentForRequest?.version),
        new Promise((resolve) => setTimeout(resolve, 2300)),
      ]);
      if (controller.signal.aborted) return;
      setVariants([]);
      setResult(next);
      setScreen("preview");
      void logGenerated(next, used, undefined, consentForRequest);
    } catch (e) {
      if (!controller.signal.aborted) showGenerationError(e, "This preview took too long. Please try again.");
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
    approvedConsent?: AiProcessingConsent,
  ) {
    if (!photo || busy || request.current) return;
    if (!accountReadyForGeneration()) return;
    if (!testMode && exceedsRequestLimit(costs.requested, wanted.length, requestLimit)) { setError("This batch could exceed your case request allowance. Review Clinician costs or create a single preview."); return; }
    if (!testMode && !confirmed) { setBatchPending(wanted); return; }
    const consentForRequest = testMode ? null : approvedConsent ?? aiConsent;
    if (!testMode) {
      let photoFingerprint: string;
      try { photoFingerprint = await fingerprintPhotoForConsent(photo.dataUrl, reference?.dataUrl); }
      catch { setError("This device couldn’t verify the permission record. No AI request was sent. Please reload the app and try again."); return; }
      if (consentForRequest?.version !== AI_CONSENT_VERSION || consentForRequest.photoFingerprint !== photoFingerprint) {
        setPendingAiConsent({ photoFingerprint, action: { kind: "variants", wanted } });
        return;
      }
    }
    if (consentForRequest && !testMode && !await persistConsentBeforeGeneration(consentForRequest, photo, settings)) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setSaved(false);
    const originalPhoto = photo;
    try {
      await waitForGenerationScreen();
      if (controller.signal.aborted) return;
      const minimumDisplay = new Promise((resolve) => window.setTimeout(resolve, 1700));
      const settled = await Promise.allSettled(
        wanted.map(async (v) => ({
          ...v,
          settings: { ...settings, ...v.patch },
          result: await requestPreview(
            originalPhoto,
            { ...settings, ...v.patch },
            controller,
            consentForRequest?.version,
          ),
        })),
      );
      if (controller.signal.aborted) return;
      const ok = settled
        .filter((x) => x.status === "fulfilled")
        .map((x) => (x as PromiseFulfilledResult<Variant>).value);
      if (ok.length === 0)
        throw new Error("These options couldn’t be created. Please try again.");
      await minimumDisplay;
      if (controller.signal.aborted) return;
      setVariants(ok);
      setOptions(ok);
      ok.forEach((v) => void logGenerated(v.result, v.settings, v.label, consentForRequest));
      if (ok.length < wanted.length) setError(`${ok.length} of ${wanted.length} options were created. You can compare those now or try again.`);
    } catch (e) {
      if (!controller.signal.aborted) showGenerationError(e, "This took too long. Please try again.");
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

  const compareMaterials = () => void generateVariants(caseMaterials.map(treatment => ({ label: treatment, note: testMode ? "Prepared material example on the same demo portrait. Other design controls do not change these demo images." : "Same selected goal, tooth plan and shade; material changes. Check contours across these independent illustrations.", patch: { treatment } })));

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
    caseSession.current += 1;
    setCaseId(crypto.randomUUID());
    setUploadAuthority(null);
    setValidationCaseId(undefined);
    setBatchPending(null);
    setPendingAiConsent(null);
    setAiConsent(null);
    cancelGeneration();
    resetCaseCosts();
    setRequestLimit(0);
    setPatientName("");
    setPinnedCases([]);
    setPhoto(null);
    setResult(null);
    setReference(null);
    setTestMode(false);
    setTestPreview(null);
    setOptions(null);
    setVariants([]);
    setFullscreen(false);
    setPresenting(false);
    setSaveOpen(false);
    setVideoOpen(false);
    setReviewOpen(false);
    setCamera(false);
    setPreviewMode("slide");
    setEditAreaOpen(false);
    setSettings({ ...defaultSettings });
    clearSettingsHistory();
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
      const [{ composeBeforeAfter }, { saveFile }] = await Promise.all([import("@/lib/compose"), import("@/lib/share")]);
      const blob = await composeBeforeAfter(
        photo.dataUrl,
        result.image,
        layout,
        result,
        reportPreferences,
        testMode,
      );
      const outcome = await saveFile(
        blob,
        `smilecompose-${layout === "split" ? "side-by-side" : "stacked"}-${new Date().toISOString().slice(0, 10)}.jpg`,
        "SmileCompose before and after",
      );
      if (outcome === "cancelled") return;
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
  const selectedVariantLabel = variants.find(v => v.result.variationId === result?.variationId)?.label ?? "Choose a look";
  const variantPicker = variants.length > 0 ? (
    <details className="variant-picker">
      <summary>Look · {selectedVariantLabel}<ChevronDown size={16} /></summary>
      <div className="variant-picker-options" role="group" aria-label="Generated smile options">
        {variants.map((v) => (
          <button key={v.result.variationId} type="button" disabled={busy}
            aria-pressed={result?.variationId === v.result.variationId}
            onClick={(event) => {
              (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
              selectOption(v);
            }}>{v.label}</button>
        ))}
      </div>
    </details>
  ) : null;

  return (
    <AppShell
      screen={screen}
      testMode={testMode}
      tools={screen === "design" ? (
        <div className="nav-history" role="group" aria-label="Design history">
          <button type="button" className="nav-tool" onClick={undoSettings} disabled={busy || !historyState.canUndo} aria-label="Undo" title="Undo (⌘Z)">
            <Undo2 size={18} strokeWidth={1.7} />
          </button>
          <button type="button" className="nav-tool" onClick={redoSettings} disabled={busy || !historyState.canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
            <Redo2 size={18} strokeWidth={1.7} />
          </button>
        </div>
      ) : undefined}
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
          <button
            className="nav-action"
            onClick={() => setLogOpen(true)}
            aria-label="Open cases"
          >
            <CasesSymbol size={18} />
            Cases
          </button>
          <button className="nav-action" onClick={() => account.openSettings()} aria-label="Open profile and settings">
            {account.initials ? <UserAvatar size="tiny" className="nav-avatar" initials={account.initials} url={account.avatarUrl} /> : <Settings size={16} strokeWidth={1.7} />}
            Settings
          </button>
          {screen === "design" && (
            <button
              className="nav-action"
              onClick={() => changeSettings({ ...defaultSettings })}
            >
              <RotateCcw size={16} strokeWidth={1.7} />
              Reset design
            </button>
          )}
          {screen === "preview" && (
            <button className="nav-action" onClick={() => setSaveOpen(true)}>
              <Download size={16} strokeWidth={1.7} />
              Save
            </button>
          )}
        </div>
      }
    >
      {!ready ? (
        <BrandLaunch />
      ) : (
        <>
          {screen === "start" && (
            <section className="start-screen">
              <div className="start-visual">
                <div
                  className="portrait-image"
                  role="img"
                  aria-label="Natural smile photography for SmileCompose"
                />
              </div>
              <div className="portrait-top">
                <BrandLockup inverse />
                <CreatorSignature inverse />
              </div>
              <ProfileButton className="start-profile" />
              <div className="start-copy">
                <HomeHeadline headingRef={heading} />
                <div className="splash-actions">
                  <button
                    className="splash-primary"
                    onClick={startNewSmile}
                  >
                    New Smile Design <ArrowRight size={17} strokeWidth={1.8} />
                  </button>
                  <button
                    className="splash-outline"
                    onClick={() => setLogOpen(true)}
                  >
                    <CasesSymbol size={18} />
                    Cases
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
                <RecentCases refreshKey={logOpen} onOpen={id => { setLogEntry(id); setLogOpen(true); }} onSeeAll={() => { setLogEntry(undefined); setLogOpen(true); }} />
              </div>
              <div className="hero-footer">
                <p className="splash-tagline">
                  Plan · Visualise · Communicate · Transform
                </p>
              </div>
            </section>
          )}

          {screen === "photo" && (
            <section className="photo-screen">
              <PhotoUploader
                photo={photo}
                onPhoto={selectPhoto}
                onRemove={startNewSmile}
                onContinue={() => setScreen("design")}
                onCamera={() => setCamera(true)}
                onSample={() => void openTestMode()}
                sampleBusy={sampleBusy}
                authorityConfirmed={Boolean(uploadAuthority)}
                onConfirmAuthority={confirmUploadAuthority}
                onLearnMore={account.openPrivacy}
              />
            </section>
          )}

          {screen === "design" && photo && (
            <section className="design-screen studio-screen">
              <input
                ref={replacement}
                className="sr-only"
                type="file"
                aria-label="Replace patient photo"
                accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  const session = caseSession.current;
                  if (file) {
                    try {
                      const prepared = await preparePhoto(file);
                      if (caseSession.current === session) await selectPhoto(prepared);
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
                  const session = caseSession.current;
                  if (file) {
                    try {
                      const prepared = await preparePhoto(file);
                      if (caseSession.current === session) setReference(prepared);
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
                Patient Smile Design
              </h1>
              <DesignStudio
                stage={result ? (
                  <div className="preview-stage">
                    <BeforeAfterSlider
                      original={photo.dataUrl}
                      preview={result.image}
                      isMock={result.mode === "mock"}
                      mode={previewMode}
                      onModeChange={setPreviewMode}
                    />
                  </div>
                ) : (
                  <PatientPhoto photo={photo} />
                )}
                caseBar={<>
                  {result && <div className="design-touch-compare">
                    <span className="compact-options-label">Compare</span>
                    <div className="compact-compare-switch" role="group" aria-label="Comparison style">
                      <button type="button" aria-pressed={previewMode === "slide"} onClick={() => setPreviewMode("slide")}>Slide</button>
                      <button type="button" aria-pressed={previewMode === "overlay"} onClick={() => setPreviewMode("overlay")}>Overlay</button>
                    </div>
                  </div>}
                  {validationCaseId && <p className="test-notice">Outcome validation · the actual after photo is held out. Set the actual treatment goal and shade before generating.</p>}
                  <div className="studio-case-row">
                    <div className="patient-field">
                      <label htmlFor="patient-name">Case ref.</label>
                      <input
                        id="patient-name"
                        type="text"
                        value={patientName}
                        maxLength={24}
                        placeholder="Initials or reference, e.g. AB"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        aria-describedby="patient-name-hint"
                        onChange={(e) => setPatientName(e.target.value)}
                      />
                    </div>
                    <button
                      className="icon-button studio-photo-action"
                      disabled={busy}
                      aria-label="Replace photo"
                      // A real patient photo needs this case's authority confirmation (e.g. leaving test mode).
                      onClick={() => (uploadAuthority && !testMode ? replacement.current?.click() : startNewSmile())}
                    >
                      <ImagePlus size={18} strokeWidth={1.6} />
                    </button>
                    <button className="icon-button studio-photo-action" disabled={busy} aria-label="Remove photo" onClick={startNewSmile}>
                      <X size={18} />
                    </button>
                  </div>
                  <p id="patient-name-hint" className="control-hint">Stays on this device. Use initials or a practice reference — not full names, dates of birth, NHS numbers or contact details.{testMode && <b> Test mode.</b>}</p>
                </>}
                costs={{ pricing, resolution: effectiveResolution, onResolution: setResolution, costs, testMode, busy, open: costsOpen, onOpen: toggleCosts, requestLimit, onRequestLimit: setRequestLimit }}
                onEditArea={() => setEditAreaOpen(true)}
                hasEditArea={Boolean(photo.editMask)}
                settings={settings}
                onChange={changeSettings}
                onGenerate={() => void generate()}
                onCompare={compareShapes}
                onCompareMaterials={compareMaterials}
                onHarmonise={harmoniseStyles}
                busy={busy}
                reference={reference}
                onAddReference={() => referenceInput.current?.click()}
                onClearReference={() => setReference(null)}
              />
            </section>
          )}

          {screen === "preview" && photo && result && (
            <section className="preview-screen">
              <h1 ref={heading} tabIndex={-1} className="sr-only">
                Smile Preview
              </h1>
              {variantTabs}
              {variantPicker}
              <div className="preview-layout">
              <div className="preview-stage">
                <BeforeAfterSlider
                  original={photo.dataUrl}
                  preview={result.image}
                  isMock={result.mode === "mock"}
                  mode={previewMode}
                  onModeChange={setPreviewMode}
                />
                <button
                  className="fullscreen-button"
                  onClick={() => setFullscreen(true)}
                >
                  <Maximize2 size={14} strokeWidth={1.8} />
                  Consultation view
                </button>
                {/* Always visible on the result, on every device. */}
                <button className="analysis-chip" onClick={() => setAnalysisOpen(true)}>
                  <AnalysisSymbol size={18} />
                  Smile analysis
                </button>
              </div>
              <FloatingPanel className="review-drawer" title="Review & refine" subtitle={result.mode === "live" && !testMode ? "Check anatomy · options & treatment notes" : "Analysis, options & treatment notes"} open={reviewOpen} onOpenChange={setReviewOpen}>
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
              <button type="button" className="analysis-row" onClick={() => setAnalysisOpen(true)}>
                <IconTile icon={AnalysisSymbol} size="sm" />
                <span className="analysis-toggle-text">
                  Smile analysis
                  <small>Relative facial reference lines</small>
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
              {result.scaleFlag === "grew" && (
                <p className="scale-notice" role="status">
                  <span>Check the size</span>This result may show the teeth
                  larger or longer than the patient’s own — compare closely,
                  or try Softer, before presenting it.
                </p>
              )}
              {!testMode && ["no-match", "unavailable"].includes(result.preferences?.styleReferenceStatus ?? "") && <p className="scale-notice" role="status"><span>No Case Library references used</span>{result.preferences?.styleReferenceStatus === "unavailable" ? "Your Case Library could not be opened for this result." : "No close style match was found for this treatment and these teeth."} Add matching finished cases to your Case Library to use your style next time.</p>}
              {!testMode && result.mode === "live" && result.preferences?.styleReferenceStatus === "used" && <StyleFeedback key={result.variationId} result={result} />}
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
                  Test mode uses three prepared material examples on the same
                  face. No AI credits are used.
                </p>
              )}
              <GenerationCosts pricing={pricing} resolution={effectiveResolution} onResolution={setResolution} costs={costs} testMode={testMode} busy={busy} open={costsOpen} onOpen={toggleCosts} requestLimit={requestLimit} onRequestLimit={setRequestLimit} />
              {!testMode && result.mode === "live" && <ClinicianReview key={result.variationId} result={result} onReview={reviewResult} />}
              {validationCaseId && <ValidationPanel key={`${validationCaseId}:${result.variationId}`} caseId={validationCaseId} result={result} before={photo.dataUrl} />}
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
              <Disclaimer />
              </FloatingPanel>
              </div>
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
              <PreviewCompactMenu
                mode={previewMode}
                onModeChange={setPreviewMode}
                onConsult={() => { setReviewOpen(false); setFullscreen(true); }}
                onAnalysis={() => { setReviewOpen(false); setAnalysisOpen(true); }}
                onReview={() => setReviewOpen(true)}
                onAnother={showAnother}
                onEdit={() => { setReviewOpen(false); setScreen("design"); setError(""); }}
                onSave={() => setSaveOpen(true)}
                onNew={startNewSmile}
                anotherCost={costsOpen ? generationCostLabel(pricing, effectiveResolution, 3, testMode) : undefined}
                busy={busy}
                saving={saving}
              />
              {analysisOpen && (
                <div className="sheet-backdrop analysis-backdrop" role="dialog" aria-modal="true" aria-label="Smile analysis" onClick={() => setAnalysisOpen(false)}>
                  <div className="sheet analysis-sheet" onClick={(e) => e.stopPropagation()}>
                    <SmileAnalysisPanel
                      before={photo.dataUrl}
                      after={result.image}
                      isDemo={result.mode === "mock" || testMode}
                      patientName={patientName}
                      onClose={() => setAnalysisOpen(false)}
                    />
                  </div>
                </div>
              )}
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

      {pendingAiConsent && photo && !testMode && (
        <AiProcessingConsentDialog
          photoFingerprint={pendingAiConsent.photoFingerprint}
          onCancel={() => setPendingAiConsent(null)}
          onConfirm={(consent) => {
            const pending = pendingAiConsent;
            setAiConsent(consent);
            setPendingAiConsent(null);
            if (pending.action.kind === "single") void generate(pending.action.override, consent);
            else void generateVariants(pending.action.wanted, true, consent);
          }}
        />
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
            <p className="sheet-sub">The images include the before and after photos, SmileCompose branding, smile preferences and what the treatment would involve. The video shows the new smile fading in.</p>
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
                <BrandLockup />
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
          variants={<>{variantTabs}{variantPicker}</>}
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

      {busy && photo && (
        <GenerationState onCancel={cancelGeneration} testMode={testMode} photo={photo.dataUrl} />
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
        <p className="storage-note" role="status">
          This device could not save all case data. Keep this preview open and save any images you need before closing the app.
        </p>
      )}
      {logOpen && <CaseLog initialEntryId={logEntry} onClose={() => { setLogOpen(false); setLogEntry(undefined); }} />}
      {libraryOpen && (
        <CaseLibrary
          onClose={() => { setLibraryOpen(false); void caseLibrary.refresh(); }}
          pinned={pinnedCases}
          onPinnedChange={setPinnedCases}
          onCountChange={ignoreCount}
          onValidate={entry => void startValidation(entry)}
        />
      )}
      <Onboarding appReady={ready} onCreateFirst={startNewSmile} onOpenCases={() => { setLogEntry(undefined); setLogOpen(true); }} />
    </AppShell>
  );
}
