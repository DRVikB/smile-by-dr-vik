"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Share2,
  ImagePlus,
  Maximize2,
  Minus,
  MoveHorizontal,
  Plus,
  Redo2,
  RotateCcw,
  Settings,
  Undo2,
  X,
} from "lucide-react";
import { AnalysisSymbol, CasesSymbol, IconTile, LibrarySymbol } from "@/components/icons/SmileIcons";
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
import { ShareSheet } from "@/components/share/ShareSheet";
import { ToothMapOverlay } from "@/components/toothMap/ToothMapOverlay";
import { useToothMap } from "@/components/toothMap/useToothMap";
import { ToothMapDebug } from "@/components/toothMap/ToothMapDebug";
import { BottomActionBar, Disclaimer } from "@/components/PreviewActions";
import { PreviewCompactMenu } from "@/components/PreviewCompactMenu";
import { CaseLog } from "@/components/CaseLog";
import { ClinicianReview } from "@/components/ClinicianReview";
import { ValidationPanel } from "@/components/ValidationPanel";
import { CaseLibrary } from "@/components/CaseLibrary";
import { Implications } from "@/components/Implications";
import { RevealVideoSheet } from "@/components/RevealVideoSheet";
import { AiProcessingConsentDialog } from "@/components/AiProcessingConsent";
import {
  defaultSettings,
  caseMaterials,
  SMILE_GUIDE,
  type Photo,
  type LibraryCase,
  type PreviewPreferences,
  type Screen,
  type SmileSettings,
  type GenerationResult,
  type SmileVariant,
  type UploadAuthority,
} from "@/lib/types";

import { isNativeApp } from "@/native/platform";
import { takeNativePhoto } from "@/native/photos";
import type { ShortcutAction } from "@/native/shortcuts";

import { thumbnail } from "@/lib/thumb";
import { preparePhoto } from "@/lib/photos";
import { assessResultScaleFromDataUrls } from "@/lib/resultCheck";
import { getReportPreferences } from "@/lib/report";
import { useSmileTools } from "@/lib/useSmileTools";
import { GenerationCosts, allowanceLabel } from "@/components/GenerationCosts";
import { emptyCaseCosts, completeCost, type GenerationPricing, type ImageResolution } from "@/lib/generation/cost";
import { isNoChangeDesign } from "@/lib/generation/designPlan";
import { exceedsRequestLimit, previewFingerprint } from "@/lib/generation/requestPolicy";
import { toothSummary } from "@/lib/teeth";
import { AI_CONSENT_VERSION, fingerprintPhotoForConsent, type AiProcessingConsent } from "@/lib/aiConsent";
import { apiUrl } from "@/services/api/client";
import { generateSmileImage } from "@/services/ai/smileImageService";
import { onWorkspaceDetach, type WorkspaceLease } from "@/lib/workspace";
import { createLibraryStore } from "@/lib/caseLibrary";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { SmileGenerationError } from "@/services/ai/smileImageService";
import { useAccount } from "@/components/account/AccountProvider";
import { useCaseLibrary } from "@/components/caseLibrary/caseLibraryContext";
import { DEFAULT_STYLE_REFERENCE_LIMIT, findMatchingStyleReferences } from "@/lib/styleMatching";
import { StyleFeedback } from "@/components/caseLibrary/StyleFeedback";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { HomeHeadline, ProfileButton, RecentCases } from "@/components/home/HomeWorkspace";
import { AllowanceBanner, AllowancePill } from "@/components/account/Allowance";
import { DOCUMENT_VERSIONS } from "@/config/legal";
import { DEMO_PREVIEW_NOTICE, loadDemoPreview } from "@/lib/demoPreviews";

type Variant = SmileVariant;

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
 * Put the edit back onto the original photograph, on the device. The face
 * lock keeps everything outside the lips; a painted edit area narrows that;
 * a reviewed Tooth Map protects every selected tooth. Alignment and
 * full-arch concepts keep their existing generator and facial protection.
 */
async function lockFace(
  photo: Photo,
  image: string,
  settings: SmileSettings,
  scope: WorkspaceLease,
): Promise<Pick<GenerationResult, "image" | "faceLocked" | "lipsMoved" | "editAreaProtected" | "toothProtection">> {
  scope.assert();
  const { lockFaceOutsideLips } = await import("@/lib/face/mouthLock");
  scope.assert();
  const r = await lockFaceOutsideLips(photo.dataUrl, image);
  scope.assert();
  const { protectionPlan, protectWithToothMap } = await import("@/lib/toothMap/protect");
  const preciseTooth = photo.toothMap && protectionPlan(photo.toothMap, photo.dataUrl, settings).ok;
  if (!r.locked && settings.shotType === "Full face" && !photo.editMask && !preciseTooth)
    throw new Error("This preview could not be aligned and protected against your original face. It has not been presented. Your photo is safe; use Protect edit area or a clearer photo before trying again.");
  let imageOut = photo.editMask ? await (await import("@/lib/editMask")).protectOutsideEditMask(photo.dataUrl, r.image, photo.editMask) : r.image;
  let toothProtection: GenerationResult["toothProtection"];
  const archOnly = settings.treatmentMode === "full_arch" && settings.fullArch && settings.fullArch.arch !== "both" ? settings.fullArch.arch : null;
  const arch = archOnly ? await import("@/lib/toothMap/arch") : null;
  if (arch?.FULL_ARCH_ARCH_COMPOSITE && archOnly && photo.toothMap?.mouthOpening && photo.toothMap.photoId === (await import("@/lib/toothMap/types")).photoFingerprint(photo.dataUrl)) {
    // Full-arch, one arch (only when enabled): everything outside that arch — the opposite arch included — is the original photo.
    const outcome = await arch.protectArch(photo.dataUrl, imageOut, photo.toothMap, archOnly);
    if (outcome) { imageOut = outcome.image; toothProtection = outcome.protection; }
  } else if (photo.toothMap && protectionPlan(photo.toothMap, photo.dataUrl, settings).ok) {
    const { TOOTH_MAP_DEBUG, rememberToothDebug } = await import("@/lib/toothMap/debug");
    const outcome = await protectWithToothMap(photo.dataUrl, imageOut, photo.toothMap, settings, { debug: TOOTH_MAP_DEBUG });
    imageOut = outcome.image;
    toothProtection = outcome.protection;
    scope.assert();
    rememberToothDebug(imageOut, { heatmap: outcome.debugImage, mask: outcome.debugMask });
  }
  scope.assert();
  return { image: imageOut, editAreaProtected: Boolean(photo.editMask), faceLocked: r.locked, lipsMoved: r.lipsMoved, ...(toothProtection ? { toothProtection } : {}) };
}

const ignoreCount = () => {};

/** The teeth (with a margin) for the Teeth step to zoom to; null when there is no map. */
function toothFocus(map: Photo["toothMap"]): { x: number; y: number; width: number; height: number } | null {
  const points = map?.teeth.filter(t => t.visible).flatMap(t => t.outline) ?? [];
  if (!points.length) return null;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const mx = (x1 - x0) * 0.12, my = (y1 - y0) * 0.8;
  return { x: Math.max(0, x0 - mx), y: Math.max(0, y0 - my), width: Math.min(1, x1 - x0 + mx * 2), height: Math.min(1, y1 - y0 + my * 2) };
}

export default function Smile() {
  const [repository] = useState(getCaseRepository);
  const [deviceLibrary] = useState(() => createLibraryStore(repository.scope));
  const { readCase, persistCase, updateLogReview } = repository;
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
  const [sampleBusy, setSampleBusy] = useState(false);
  const [reference, setReference] = useState<Photo | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [options, setOptions] = useState<Variant[] | null>(null);
  // Share with patient: the Smile Preview or the Consultation Report.
  const [shareOpen, setShareOpen] = useState(false);
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
  // Smile analysis lines drawn on the result's comparison.
  const [analysisOn, setAnalysisOn] = useState(false);

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
  // Every visible tooth as its own region, found on this device when a photo reaches the Studio.
  const toothMap = useToothMap({ photo, setPhoto, settings, onChange: changeSettings, active: screen === "design" && Boolean(photo) });
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
    if (repository.scope.signal.aborted) return;
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
  // Bumped after each version is written to Cases.
  const [caseLogVersion, setCaseLogVersion] = useState(0);
  const caseSession = useRef(0);
  useEffect(() => onWorkspaceDetach(() => { caseSession.current++; request.current?.abort(); logWrites.current.clear(); }), []);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstScreen = useRef(true);

  function restoreWorkingCase(c:import("@/lib/types").SmileCase) {
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

  useEffect(()=>repository.subscribeWorkingCase(c=>{
    // A resolved conflict/deletion also replaces the visible editor, preventing
    // its old autosave or in-flight result from reintroducing discarded state.
    caseSession.current++;cancelGeneration();setBatchPending(null);setPendingAiConsent(null);setOptions(null);
    setShareOpen(false);setVideoOpen(false);setPresenting(false);setFullscreen(false);
    if(c)restoreWorkingCase(c);else{newSmile();setScreen("start");}
  }),[repository]);

  useEffect(() => {
    let active = true;
    readCase()
      .then((c) => {
        if (active && c) {
          restoreWorkingCase(c);
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
      caseSession.current++;
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
    const analysis=new AbortController();
    void import("@/lib/face/landmarks")
      .then(async (m) => {
        repository.scope.assert();const points=await m.detectFace(photoUrl, analysis.signal);repository.scope.assert();
        if(analysis.signal.aborted)return;
        if(points){const {makeAnalysisSnapshot}=await import("@/services/cases/sync/analysisSnapshot");repository.scope.assert();
          setPhoto(current=>current?.dataUrl===photoUrl&&!current.analysisSnapshot?{...current,analysisSnapshot:makeAnalysisSnapshot(photoUrl,current.width,current.height,points)}:current);
        }
      })
      .catch(() => {});
    return ()=>analysis.abort();
  }, [screen, photoUrl, repository.scope]);

  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  async function selectPhoto(p: Photo) {
    p={...p,sourceProvenance:p.sourceProvenance??"prepared"};
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

  // Home Screen quick actions: queued until the saved case has been restored, so neither overwrites the other.
  const [shortcut, setShortcut] = useState<ShortcutAction | null>(null);
  useEffect(() => {
    if (!isNativeApp()) return;
    let stop: (() => void) | undefined;
    let live = true;
    void import("@/native/shortcuts")
      .then(({ onShortcut }) => onShortcut(action => setShortcut(action)))
      .then(remove => { if (live) stop = remove; else remove(); })
      .catch(() => { /* quick actions are a convenience */ });
    return () => { live = false; stop?.(); };
  }, []);
  useEffect(() => {
    if (!ready || !shortcut) return;
    const action = shortcut;
    setShortcut(null);
    if (action === "new") startNewSmile();
    else if (action === "cases") { setLogEntry(undefined); setLogOpen(true); }
    else if (action === "library") caseLibrary.open();
    else if (action === "plan") account.openSettings("subscription");
    else if (action === "recent") void openLatestCase();
    else void openTestMode();
    // Runs once per queued action; the handlers read current state when called.
  }, [ready, shortcut]);

  /** The widget's "Recent case": the newest case's latest version in Cases, or Cases when there are none. */
  async function openLatestCase() {
    const latest = await repository.listActiveLog().then(list => list[0]).catch(() => undefined);
    setLogEntry(latest?.id);
    setLogOpen(true);
  }

  // The widget shows when the latest case was edited (only the time), so it follows every change to Cases.
  useEffect(() => {
    if (!ready || logOpen || !isNativeApp()) return;
    void Promise.all([Promise.resolve(repository), import("@/native/shortcuts")])
      .then(async ([log, widget]) => widget.setWidgetRecentCase((await log.listActiveLog())[0]?.createdAt ?? null))
      .catch(() => { /* the widget keeps its last value */ });
  }, [ready, logOpen, caseLogVersion]);

  /** In the iOS app, the iPhone camera itself (full quality); in a browser, the in-page camera sheet. */
  async function openCamera() {
    if (!isNativeApp()) { setCamera(true); return; }
    try {
      const file = await takeNativePhoto(SMILE_GUIDE);
      if (!file) return;
      const prepared = await preparePhoto(file);
      await selectPhoto({ ...prepared, framing: SMILE_GUIDE });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The camera couldn’t be opened.");
    }
  }

  async function openTestMode() {
    if (sampleBusy) return;
    const session = caseSession.current;
    setSampleBusy(true);
    setError("");
    try {
      const [patientResponse, previewImage] = await Promise.all([
        fetch("/demo-storyboard-before.webp"),
        loadDemoPreview(defaultSettings),
      ]);
      if (!patientResponse.ok) throw new Error();
      const patientBlob = await patientResponse.blob();
      const patient = await preparePhoto(new File([patientBlob], "SmileCompose demo before.png", { type: "image/png" }));
      if (caseSession.current !== session) return;
      newSmile();
      setPhoto({ ...patient, isSample: true });
      setTestPreview(previewImage);
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
      const media = await deviceLibrary.readLibraryMedia(entry.id);
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
    // Every selected-tooth edit needs reviewed boundaries before a paid request.
    // Alignment and full arch retain their separate protection paths.
    const toothPlan = (await import("@/lib/toothMap/protect")).protectionPlan(photoIn.toothMap, photoIn.dataUrl, settingsIn);
    if (!testMode && !toothPlan.ok && !["full-arch", "alignment"].includes(toothPlan.reason))
      throw new Error(toothPlan.reason === "unconfirmed"
        ? "Review the selected tooth’s outline and number, then confirm the tooth map on the Teeth step. No request was sent."
        : "All selected teeth need valid boundaries for this photo. Review the Tooth Map on the Teeth step; remove invisible or missing teeth from the selection. No request was sent.");
    const preferences: PreviewPreferences = { styleReferenceStatus: "off", styleReferenceCount: 0, settings: structuredClone(settingsIn), referenceUsed: Boolean(reference), testMode };
    if (testMode) {
      const demoImage = await loadDemoPreview(settingsIn, controller.signal);
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (controller.signal.aborted) throw controller.signal.reason;
      const { alignPreview } = await import("@/lib/photos");
      const locked = await lockFace(photoIn, await alignPreview(demoImage, photoIn), settingsIn, repository.scope);
      return {
        ...locked,
        mode: "live",
        variationId: crypto.randomUUID(),
        preferences,
      };
    }
    // Check existing protection before spending a generation. A reviewed
    // selected-tooth mask or clinician-painted area can also protect the face.
    if (settingsIn.shotType === "Full face" && !photoIn.editMask && !toothPlan.ok) {
      const { detectFace } = await import("@/lib/face/landmarks");
      repository.scope.assert();
      const points = await detectFace(photoIn.dataUrl, controller.signal);
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!points) throw new Error("Face protection could not find the mouth in this photo. Use a clearer full-face photo or Protect edit area. No generation request was sent.");
    }
    // Case Library style references are attached by the server, from the
    // signed-in account's own private library; the app never sends them. The
    // matching IDs only make the reuse fingerprint change when the library does.
    const styleReferences = settingsIn.libraryStyle
      ? findMatchingStyleReferences(caseLibrary.candidates, settingsIn, DEFAULT_STYLE_REFERENCE_LIMIT).map(m => m.id)
      : [];
    if (controller.signal.aborted) throw controller.signal.reason;
    const toothMapKey = toothPlan.ok && photoIn.toothMap ? { precisionVersion: 2, photoId: photoIn.toothMap.photoId, teeth: photoIn.toothMap.teeth.map(t => [t.fdi, t.visible, t.outline]) } : null;
    const protectionVersion = (await import("@/lib/face/lock")).MOUTH_LOCK_VERSION;
    const fingerprint = await previewFingerprint({ image: photoIn.dataUrl, editMask: photoIn.editMask, toothMap: toothMapKey, settings: settingsIn, resolution: effectiveResolution, provider: pricing?.model, reference: reference?.dataUrl, styleReferences, protectionVersion });
    const reusable = [result, ...variants.map(v => v.result)].find(r => r?.requestFingerprint === fingerprint);
    if (reusable) return reusable;
    if (exceedsRequestLimit(costs.requested, 1, requestLimit)) throw new Error("This case has reached its generation limit. Change the case limit under Allowance to create more.");
    const { prepareGenerationPhoto } = await import("@/lib/photos");
    const requestCanvas = await prepareGenerationPhoto(photoIn);
    if (controller.signal.aborted) throw controller.signal.reason;
    const editMask = photoIn.toothMap
      ? (await import("@/lib/toothMap/protect")).guidanceMask(photoIn.toothMap, photoIn.dataUrl, settingsIn, requestCanvas.photo, requestCanvas.sourceBounds)
      : undefined;
    let next = await generateSmileImage({
      caseId,
      originalImage: requestCanvas.photo.dataUrl,
      editMask,
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
    repository.scope.assert();
    if (costSession.current === session) {
      const receipt = next.mode === "mock"
        ? { usd: 0, basis: "usage" as const, model: "mock", resolution: effectiveResolution }
        : next.cost;
      setCosts((c) => completeCost(c, receipt));
    }
    const { alignPreview } = await import("@/lib/photos");
    const alignedImage = await alignPreview(next.image, photoIn, requestCanvas);
    repository.scope.assert();
    next = { ...next, image: alignedImage };
    if (next.mode === "live") {
      next = { ...next, ...(await lockFace(photoIn, alignedImage, settingsIn, repository.scope)) };
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
    repository.scope.assert();
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
        await repository.recordVisualisation(
          {
            id,
            caseId: caseId || undefined,
            patientName: patientName.trim(),
            createdAt: Date.now(),
            mode: entryResult.mode,
            testMode,
            label,
            summary: `${toothSummary(used)} · ${used.treatmentMode === "full_arch" && used.fullArch ? (used.fullArch.restorationType === "zirconia" ? "Zirconia" : "Provisional") : used.treatment} · ${used.targetShade} · ${used.shape}`,
            thumb,
          },
          { id, image: entryResult.image, originalImage: photo.dataUrl, photoMetadata: { sourceProvenance:photo.sourceProvenance,name:photo.name,width:photo.width,height:photo.height,framing:photo.framing,quality:photo.quality,toothMap:photo.toothMap,analysisSnapshot:photo.analysisSnapshot }, analysisSnapshot:photo.analysisSnapshot, preferences: entryResult.preferences ?? { settings: used, testMode }, review: entryResult.review, scaleFlag: entryResult.scaleFlag, aiConsent: testMode ? undefined : consent ?? aiConsent ?? undefined, generation: entryResult.generation },
        );
      } catch {
        setStorageError(true);
      }
    })();
    logWrites.current.set(id, writing);
    await writing;
    setCaseLogVersion(v => v + 1);
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
    if (!testMode && exceedsRequestLimit(costs.requested, wanted.length, requestLimit)) { setError("This batch could exceed the case’s generation limit. Check Allowance or create a single preview."); return; }
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

  const showAnother = () => {
    if (testMode) { compareShapes(); return; }
    void generateVariants([
      { label: "Subtle", note: "A natural enhancement.", patch: { intensity: 20 } },
      { label: "Refined", note: "A balanced, polished look.", patch: { intensity: 50 } },
      { label: "Bright", note: "A brighter, more defined smile.", patch: { intensity: 80 } },
    ]);
  };

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
    if (testMode) { compareShapes(); return; }
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

  const compareMaterials = () => {
    if (testMode && settings.alignment?.only && settings.treatmentMode !== "full_arch") { setError("The alignment-only demo preserves tooth shape and material. Turn off Alignment only to compare restorative materials."); return; }
    void generateVariants(caseMaterials.map(treatment => ({ label: treatment, note: testMode ? `Prepared ${settings.shape.toLowerCase()} material example on the same demo portrait.` : "Same selected goal, tooth plan and shade; material changes. Check contours across these independent illustrations.", patch: { treatment } })));
  };

  const compareShapes = () => {
    if (testMode && settings.alignment?.only && settings.treatmentMode !== "full_arch") { setError("The alignment-only demo preserves tooth shape. Turn off Alignment only to compare the three restorative shapes."); return; }
    void generateVariants([
      { label: "Square", note: "Defined, confident edges.", patch: { shape: "Square" } },
      { label: "Rounded", note: "Soft and natural.", patch: { shape: "Rounded" } },
      { label: "Triangular", note: "Tapered, delicate form.", patch: { shape: "Triangular" } },
    ]);
  };

  function selectOption(v: Variant) {
    setSettings(v.settings);
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
    setShareOpen(false);
    setVideoOpen(false);
    setReviewOpen(false);
    setCamera(false);
    setPreviewMode("slide");
    setEditAreaOpen(false);
    setSettings({ ...defaultSettings });
    clearSettingsHistory();
    setError("");
    setScreen("start");
    void persistCase(null).catch(() => setStorageError(true));
  }

  const reportPreferences = result ? getReportPreferences(result, variants) : undefined;

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
            <button className="nav-action" onClick={() => setShareOpen(true)}>
              <Share2 size={16} strokeWidth={1.7} />
              Share
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
                <AllowanceBanner className="on-photo" />
                <HomeHeadline headingRef={heading} />
                <div className="splash-actions">
                  <button
                    className="splash-primary"
                    onClick={startNewSmile}
                  >
                    New Smile Design <ArrowRight size={17} strokeWidth={1.8} />
                  </button>
                  {/* Your patients' cases, and your Case Library of finished work, side by side. */}
                  <div className="splash-pair">
                    <button className="splash-outline" onClick={() => setLogOpen(true)}>
                      <CasesSymbol size={18} />
                      Cases
                    </button>
                    <button className="splash-outline" onClick={() => caseLibrary.open()}>
                      <LibrarySymbol size={18} />
                      Case Library
                    </button>
                  </div>
                </div>
                <AllowancePill className="on-photo" />
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
                onCamera={() => void openCamera()}
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
                toothMap={toothMap}
                stage={(teethStep) => result && !(teethStep && settings.treatmentMode !== "full_arch" && (toothMap.picking || toothMap.editing || toothMap.adding || toothMap.mode !== "hidden")) ? (
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
                  <PatientPhoto photo={photo} focus={teethStep && toothMap.mode !== "hidden" ? toothFocus(photo.toothMap) : null} overlay={teethStep && settings.treatmentMode !== "full_arch" ? (zoom) => (
                    <ToothMapOverlay controller={toothMap} settings={settings} width={photo.width} height={photo.height} scale={zoom} />
                  ) : undefined} />
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
                  analysis={analysisOn}
                />
                <button
                  className="fullscreen-button"
                  onClick={() => setFullscreen(true)}
                >
                  <Maximize2 size={14} strokeWidth={1.8} />
                  Consultation view
                </button>
                {/* Always visible on the result, on every device: lines on or off. */}
                <button className="analysis-chip" aria-pressed={analysisOn} onClick={() => setAnalysisOn(v => !v)}>
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
              {costsOpen && <p className="control-hint">Each adjustment uses {allowanceLabel(1, testMode).toLowerCase()}.</p>}
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
              <button type="button" className="analysis-row" aria-pressed={analysisOn} onClick={() => setAnalysisOn(v => !v)}>
                <IconTile icon={AnalysisSymbol} size="sm" />
                <span className="analysis-toggle-text">
                  Smile analysis
                  <small>{analysisOn ? "Lines shown on the photo" : "Show the reference lines on the photo"}</small>
                </span>
                <span className="analysis-row-state" aria-hidden="true">{analysisOn ? "On" : "Off"}</span>
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
              {result.toothProtection && (
                <p className="scale-notice" role="status"><span>{result.toothProtection.verified ? (result.toothProtection.arch ? "Opposite arch protected" : "Tooth map protected") : "Check the protected areas"}</span>
                  {result.toothProtection.arch
                    ? `Only the ${result.toothProtection.arch} arch could change. The ${result.toothProtection.arch === "upper" ? "lower" : "upper"} arch, lips and face are the original photo.`
                    : `Only ${result.toothProtection.teeth.join(", ")} could change. Every other pixel — lips, skin, gums and unselected teeth — is the original photo.`}
                  {result.toothProtection.notFound.length > 0 && ` ${result.toothProtection.notFound.join(", ")} ${result.toothProtection.notFound.length === 1 ? "wasn’t" : "weren’t"} in the tooth map, so ${result.toothProtection.notFound.length === 1 ? "it stayed" : "they stayed"} unchanged.`}
                  {result.toothProtection.insideChange < 0.01 && (result.toothProtection.arch ? " The arch barely changed: check the photo shows the teeth." : " The selected teeth barely changed: try Stronger or check the selection.")}
                  {!result.toothProtection.verified && (result.toothProtection.arch ? " Some pixels outside the arch differ from the original: compare carefully before presenting." : " Some pixels outside the selected teeth differ from the original: compare carefully before presenting.")}
                </p>
              )}
              <ToothMapDebug map={photo.toothMap} width={photo.width} height={photo.height} image={result.image} protection={result.toothProtection} />
              {result.mode === "live" && !testMode && !result.toothProtection && (
                <p className="scale-notice" role="status"><span>{result.editAreaProtected ? "Edit area protected" : result.faceLocked ? "Face protected — check dental anatomy" : "Automatic protection unavailable"}</span>
                  {result.editAreaProtected ? "The original photo is restored outside your painted area. Check that the boundary excludes gums and untreated teeth, and review the design inside it." : result.faceLocked ? "Automatic protection covers the surrounding face, not individual teeth or gums. Compare gum margins, lower teeth and untreated teeth before presenting. Use Protect edit area for precise boundaries." : "The face could not be protected automatically. Inspect the whole result against the original, or use Protect edit area and generate again before presenting."}
                </p>
              )}
              {result.lipsMoved && (
                <p className="scale-notice" role="status">
                  <span>Check smile fit</span>The AI attempted to change the lip line.
                  {result.faceLocked ? " The original lips and face have been restored. Check that the teeth fit the original opening and that no hidden teeth have appeared." : " Compare with the original before presenting this version."}
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
                  {DEMO_PREVIEW_NOTICE}
                </p>
              )}
              <GenerationCosts pricing={pricing} resolution={effectiveResolution} onResolution={setResolution} costs={costs} testMode={testMode} busy={busy} open={costsOpen} onOpen={toggleCosts} requestLimit={requestLimit} onRequestLimit={setRequestLimit} />
              {!testMode && result.mode === "live" && <ClinicianReview key={result.variationId} result={result} onReview={reviewResult} />}
              {validationCaseId && <ValidationPanel key={`${validationCaseId}:${result.variationId}`} caseId={validationCaseId} result={result} before={photo.dataUrl} />}
              <Implications
                settings={reportPreferences?.settings ?? settings}
                result={result}
              />
              </div>
              <Disclaimer />
              </FloatingPanel>
              </div>
              <BottomActionBar
                anotherCost={costsOpen ? allowanceLabel(3, testMode) : undefined}
                onAnother={showAnother}
                onEdit={() => {
                  setScreen("design");
                  setError("");
                }}
                onShare={() => setShareOpen(true)}
                onNew={startNewSmile}
                busy={busy}
              />
              <PreviewCompactMenu
                mode={previewMode}
                onModeChange={setPreviewMode}
                onConsult={() => { setReviewOpen(false); setFullscreen(true); }}
                analysisOn={analysisOn}
                onAnalysis={() => { setReviewOpen(false); setAnalysisOn(v => !v); }}
                onReview={() => setReviewOpen(true)}
                onAnother={showAnother}
                onEdit={() => { setReviewOpen(false); setScreen("design"); setError(""); }}
                onShare={() => setShareOpen(true)}
                onNew={startNewSmile}
                anotherCost={costsOpen ? allowanceLabel(3, testMode) : undefined}
                busy={busy}
              />
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
                    {!testMode && <span className="option-pick">{o.note}</span>}
                  </span>
                </button>
              ))}
            </div>
            {testMode && <p className="variation-demo-note">{DEMO_PREVIEW_NOTICE}</p>}
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
      {batchPending && <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Confirm generation batch"><div className="sheet"><h2>Create {batchPending.length} options?</h2><p className="sheet-sub">{allowanceLabel(batchPending.length, testMode)}. {testMode ? "Test mode uses prepared examples." : "Taken from your allowance; any that fail are returned."} Existing identical results may be reused without using a design.</p><p className="control-hint">Options are generated independently. Compare tooth contours and protected anatomy; geometry is not guaranteed to be identical.</p><button className="primary-button" onClick={() => { const wanted = batchPending; setBatchPending(null); void generateVariants(wanted, true); }}>Create {batchPending.length} options</button><button className="secondary-button" onClick={() => setBatchPending(null)}>Cancel</button></div></div>}
      {shareOpen && result && photo && (
        <ShareSheet
          input={{
            before: photo.dataUrl,
            after: result.image,
            settings: reportPreferences?.settings,
            referenceUsed: reportPreferences?.referenceUsed,
            isDemo: result.mode === "mock" || testMode,
            patientLabel: patientName,
          }}
          entryId={result.variationId}
          onClose={() => setShareOpen(false)}
          onRevealVideo={() => { setShareOpen(false); setVideoOpen(true); }}
        />
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
          onShare={() => { setPresenting(false); setShareOpen(true); }}
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
      {logOpen && <CaseLog initialEntryId={logEntry} onReopen={async id=>{const draft=await repository.reopenCase(id);repository.scope.assert();caseSession.current++;request.current?.abort();restoreWorkingCase(draft);setLogOpen(false);setLogEntry(undefined);}} onClose={() => { setLogOpen(false); setLogEntry(undefined); }} />}
      {libraryOpen && (
        <CaseLibrary
          onClose={() => { setLibraryOpen(false); void caseLibrary.refresh(); }}
          pinned={pinnedCases}
          onPinnedChange={setPinnedCases}
          onCountChange={ignoreCount}
          onValidate={entry => void startValidation(entry)}
        />
      )}
      <Onboarding appReady={ready} onCreateFirst={startNewSmile} />
    </AppShell>
  );
}
