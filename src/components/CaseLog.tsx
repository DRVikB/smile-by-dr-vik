"use client";
import { ComposingMark } from "@/components/ComposingMark";
import { RailButton, RailItems, SheetClose, SideRailLayer, useSideRail } from "@/components/sideRail/SideRail";
import { PatientSyncStatus } from "./PatientSyncStatus";
import { CaseMediaStatus } from "./CaseMediaStatus";
import { type CaseMediaPreload, useCaseMedia } from "./useCaseMedia";
import { openContextMenu, Pressable, SwipeRow, useSwipeBack, type MenuItem } from "./appGestures";
import { haptic } from "@/native/haptics";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, ChevronLeft, ChevronRight, CircleCheck, Maximize2, PenLine, Pencil, ScanEye, Search, Share2, Star, Trash2, X } from "lucide-react";
import { AnalysisSymbol, SmileSymbol } from "@/components/icons/SmileIcons";
import { AI_CONCEPT_DISCLAIMER } from "@/lib/brand";
import { savedCaseExport } from "@/lib/savedCaseExport";
import { SavedCaseViewer } from "./SavedCaseViewer";
import { ShareSheet } from "./share/ShareSheet";
import { EXPORT_NAMES, type ExportKind, type ReportDraft } from "@/lib/consultation";
import type { CaseLogEntry, CaseLogMedia } from "@/lib/types";
import {
  CASE_REFERENCE_MAX,
  formatLogDate,
  matchesQuery,
} from "@/lib/caseLog";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { caseIdOf } from "@/models/case";
import { useCaseRecord } from "./useCaseRecord";
import { CasePhotoSet } from "./CasePhotoSet";
import { PhotoSetPage } from "./photoSet/PhotoSetPage";
import { RECENTLY_DELETED_DAYS } from "@/config/cases";
import { caseDisplayName, recentCaseTreatment } from "@/lib/recentCases";

/** When the list of cases was last looked at: anything made since arrives with a small welcome. */
let casesSeenAt = Date.now();

/** One patient case: every version made for it, newest first. */
interface CaseGroup {
  key: string;
  name: string;
  versions: CaseLogEntry[];
  updatedAt: number;
  favourites: number;
  test: boolean;
}

function groupCases(entries: CaseLogEntry[]): CaseGroup[] {
  const byCase = new Map<string, CaseLogEntry[]>();
  for (const entry of entries) byCase.set(caseIdOf(entry), [...(byCase.get(caseIdOf(entry)) ?? []), entry]);
  return [...byCase.entries()].map(([key, group]) => {
    const versions = [...group].sort((a, b) => b.createdAt - a.createdAt);
    return {
      key,
      name: versions.find(v => v.patientName)?.patientName ?? "",
      versions,
      updatedAt: versions[0].createdAt,
      favourites: versions.filter(v => v.favourite).length,
      test: versions.every(v => v.testMode || v.mode === "mock"),
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Favourites lead the case's thumbnails. */
const coverThumbs = (group: CaseGroup) =>
  [...group.versions].sort((a, b) => Number(Boolean(b.favourite)) - Number(Boolean(a.favourite))).slice(0, 3);

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const versionTitle = (entry: CaseLogEntry, index: number, total: number) => entry.label || `Version ${total - index}`;

export function CaseLog({ onClose, initialEntryId, continueFrom, onReopen, onSignIn }: {
  onClose: () => void; initialEntryId?: string;
  /** Opened from Recent cases: that sheet's top edge. This sheet grows up from there instead of rising from the foot. */
  continueFrom?: number;
  onReopen?: (caseId:string)=>Promise<void>; onSignIn?: () => void;
}) {
  // iPhone Duo: Back and Close sit in the side bar.
  const rail = useSideRail();
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el || continueFrom === undefined) return;
    // Where the sheet rests, from layout (offsetTop ignores the entrance transform already applied to it).
    const restingTop = (el.offsetParent?.getBoundingClientRect().top ?? 0) + el.offsetTop;
    el.style.setProperty("--continue-from", `${Math.max(0, continueFrom - restingTop)}px`);
  }, [continueFrom]);
  // Which way the last move between the list and a case went, so each slides in from its side.
  const [nav, setNav] = useState<"push" | "pop" | null>(null);
  const [repository] = useState(getCaseRepository);
  // Cases made since the list was last open settle in at the top.
  const [seenAt] = useState(() => casesSeenAt);
  useEffect(() => () => { casesSeenAt = Date.now(); }, []);
  const { listActiveLog, moveAllToRecentlyDeleted, moveToRecentlyDeleted, purgeRecentlyDeleted, renameCase, setCaseArchived, setFavourite } = repository;
  const [entries, setEntries] = useState<CaseLogEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [openCase, setOpenCaseNow] = useState<string | null>(null);
  const setOpenCase = useCallback((key: string | null) => { setNav(key ? "push" : "pop"); setOpenCaseNow(key); }, []);
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [detail, setOpen] = useState<{ entry: CaseLogEntry; media: CaseLogMedia | null } | null>(null);
  // Full images already read (most recent few), so a version slides in with its photographs in place
  // and the lead design on a case page is the full image, not the list thumbnail.
  const fullMedia = useRef(new Map<string, CaseMediaPreload>());
  const readFull = useCallback(async (id: string): Promise<CaseMediaPreload | null> => {
    const known = fullMedia.current.get(id);
    if (known?.media) return known;
    const [media, status] = await Promise.all([repository.readPresentationMedia(id).catch(() => null), repository.mediaStatus(id).catch(() => null)]);
    if (!media) return null;
    await Promise.all([media.image, media.originalImage].filter(Boolean).map((src) => { const img = new Image(); img.src = src; return img.decode().catch(() => {}); }));
    const read = { id, media, status };
    fullMedia.current.delete(id);
    fullMedia.current.set(id, read);
    if (fullMedia.current.size > 6) fullMedia.current.delete(fullMedia.current.keys().next().value!);
    return read;
  }, [repository]);
  const [preload, setPreload] = useState<CaseMediaPreload | null>(null);
  // A version takes the case card's exact place: the frame copies where the Cases panel rests (offsets ignore
  // its entrance or drag transforms), its size and corners, and follows it if the screen changes (the Duo opening).
  const frame = useRef<HTMLDivElement>(null);
  // The photo set opens the same way, as the next page in the case card.
  const [photoSet, setPhotoSet] = useState<{ caseId: string; before?: string; concept?: string } | null>(null);
  const detailOpen = !!detail || !!photoSet;
  useLayoutEffect(() => {
    if (!detailOpen) return;
    const place = () => {
      const p = panel.current, f = frame.current;
      if (!p || !f) return;
      let x = 0, y = 0;
      for (let n: HTMLElement | null = p; n; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop; }
      Object.assign(f.style, { left: `${x}px`, top: `${y}px`, width: `${p.offsetWidth}px`, height: `${p.offsetHeight}px`, borderRadius: getComputedStyle(p).borderTopLeftRadius });
    };
    place();
    const watch = new ResizeObserver(place);
    if (panel.current) watch.observe(panel.current);
    window.addEventListener("resize", place);
    // A partly folded iPhone Duo moves the case card without resizing it.
    const posture = new MutationObserver(place);
    posture.observe(document.documentElement, { attributes: true, attributeFilter: ["data-fold", "data-side-bar"] });
    return () => { watch.disconnect(); posture.disconnect(); window.removeEventListener("resize", place); };
  }, [detailOpen]);
  const { media, status: mediaStatus, retry: retryMedia } = useCaseMedia(repository, detail?.entry.id, preload);
  const open = detail ? { ...detail, media } : null;
  const openRecord = useCaseRecord(detail ? caseIdOf(detail.entry) : undefined);
  const pageRecord = useCaseRecord(openCase ?? undefined);
  const [preferredError, setPreferredError] = useState("");
  async function togglePreferred(entry: CaseLogEntry) {
    haptic("select");
    setPreferredError("");
    try { await repository.setPreferredDesign(caseIdOf(entry), openRecord.preferredDesignId === entry.id ? null : entry.id); }
    catch { setPreferredError("The preferred version couldn’t be saved. Please try again."); }
  }
  const [syncIndicators, setSyncIndicators] = useState<Record<string, string>>({});
  const [reopening, setReopening] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmCase, setConfirmCase] = useState(false);
  const [error, setError] = useState("");
  // The saved comparison, opened plain or with the smile analysis lines on.
  const [viewing, setViewing] = useState<false | "compare" | "analysis">(false);
  // Share with patient from this saved version; `kind` reopens an earlier export.
  const [sharing, setSharing] = useState<null | { kind?: ExportKind; draft?: ReportDraft }>(null);
  const [notice, setNotice] = useState("");
  const [openedInitial, setOpenedInitial] = useState(false);

  const refresh = useCallback(() => {
    purgeRecentlyDeleted()
      .catch(() => 0)
      .then(() => listActiveLog())
      .then(setEntries)
      .catch(() => {
        setEntries([]);
        setError("Cases couldn’t be opened on this device.");
      });
  }, []);
  useEffect(() => { refresh(); return repository.subscribe(refresh); }, [refresh, repository]);
  useEffect(() => {
    let live = true;
    const load = () => { void repository.caseSyncIndicators().then(next => { if (live) setSyncIndicators(next); }).catch(() => {}); };
    load(); const off = repository.subscribe(load);
    window.addEventListener("online", load); window.addEventListener("offline", load);
    return () => { live = false; off(); window.removeEventListener("online", load); window.removeEventListener("offline", load); };
  }, [repository]);

  const all = useMemo(() => groupCases(entries ?? []), [entries]);
  const shown = all.filter(group => !query.trim() || group.versions.some(v => matchesQuery(v, query)));
  const current = openCase ? all.find(g => g.key === openCase) ?? null : null;
  const versions = current ? current.versions.filter(v => !onlyFavourites || v.favourite) : [];
  // The patient's preferred version leads the case page, otherwise the newest; the rest scroll beneath it.
  const hero = current ? current.versions.find(v => v.id === pageRecord.preferredDesignId) ?? current.versions[0] : null;
  const others = hero ? versions.filter(v => v.id !== hero.id) : [];
  const [heroFull, setHeroFull] = useState<{ id: string; src: string } | null>(null);
  const heroId = hero?.id;
  useEffect(() => {
    if (!heroId) return;
    let live = true;
    void readFull(heroId).then((read) => { if (live && read?.media?.image) setHeroFull({ id: heroId, src: read.media.image }); });
    return () => { live = false; };
  }, [heroId, readFull]);
  const heroImage = hero ? (heroFull?.id === hero.id ? heroFull.src : hero.thumb) : undefined;

  // Swipe in from the left edge: a version back to its case, a case back to the list. On the list itself
  // the swipe does nothing (Cases is a sheet; it closes with a pull down or Close).
  useSwipeBack(true, photoSet ? () => setPhotoSet(null) : open ? () => setOpen(null) : current ? () => setOpenCase(null) : undefined,
    () => (open || photoSet ? frame.current : document.querySelector<HTMLElement>(".sheet-backdrop > .log-panel .case-page")));

  // Long-press menus, the way Photos and Files offer actions on an item.
  const caseMenu = (group: CaseGroup): MenuItem[] => [
    { label: "Open", onSelect: () => setOpenCase(group.key) },
    { label: "Rename", onSelect: () => { renameOnOpen.current = group.name ?? ""; setOpenCase(group.key); } },
    { label: "Archive", onSelect: () => void forWholeCase(group, "archive") },
    { label: "Delete", destructive: true, onSelect: () => void forWholeCase(group, "delete") },
  ];
  const versionMenu = (entry: CaseLogEntry): MenuItem[] => {
    const preferred = pageRecord.preferredDesignId === entry.id;
    return [
      { label: "Open", onSelect: () => void openEntry(entry) },
      { label: entry.favourite ? "Remove from Favourites" : "Add to Favourites", onSelect: () => void toggleFavourite(entry) },
      ...(!entry.testMode && entry.mode !== "mock" ? [{ label: preferred ? "Not the Patient’s Preferred" : "Mark as Patient’s Preferred", onSelect: () => {
        haptic("select");
        void repository.setPreferredDesign(caseIdOf(entry), preferred ? null : entry.id).catch(() => setPreferredError("The preferred version couldn’t be saved. Please try again."));
      } }] : []),
      { label: "Delete Version", destructive: true, onSelect: () => void removeVersion(entry.id) },
    ];
  };

  // Leaving a case (or it emptying) resets its per-case state.
  useEffect(() => {
    if (openCase && entries && !current) setOpenCaseNow(null);
  }, [openCase, entries, current]);
  // "Rename" from a case's long-press menu opens the case with its name ready to edit.
  const renameOnOpen = useRef<string | null>(null);
  useEffect(() => {
    setOnlyFavourites(false); setConfirmCase(false);
    setRenaming(renameOnOpen.current); renameOnOpen.current = null;
  }, [openCase]);

  async function openEntry(entry: CaseLogEntry) {
    if(entry.draftOnly){await reopenDesign(caseIdOf(entry));return;}
    // Wait briefly for the photographs so the card doesn't arrive empty; a slow download opens it anyway.
    const read = await Promise.race([readFull(entry.id), new Promise<null>((done) => window.setTimeout(() => done(null), 450))]);
    setPreload(read);
    setOpen({ entry, media: null });
  }
  async function reopenDesign(id: string) {
    if (!onReopen || reopening) return;
    setReopening(true); setError("");
    try { await onReopen(id); }
    catch { setError("Couldn't reopen this design. Connect and try again. Older cases may only have a saved comparison, which you can open below."); }
    finally { setReopening(false); }
  }

  // Opened from Home › Recent Cases: go straight to that patient's case.
  useEffect(() => {
    if (openedInitial || !initialEntryId || !entries) return;
    setOpenedInitial(true);
    const entry = entries.find(e => e.id === initialEntryId);
    if (entry) setOpenCaseNow(caseIdOf(entry));
  }, [entries, initialEntryId, openedInitial]);
  // Until that case is found, the list stays out of sight rather than flashing up first.
  const awaitingInitial = Boolean(initialEntryId) && !openedInitial;

  async function toggleFavourite(entry: CaseLogEntry) {
    const next = !entry.favourite;
    haptic("select");
    // Optimistic: the star responds instantly; revert if the save fails.
    const apply = (value: boolean) => setEntries(list => list?.map(e => (e.id === entry.id ? { ...e, favourite: value || undefined } : e)) ?? list);
    apply(next);
    setOpen(cur => (cur && cur.entry.id === entry.id ? { ...cur, entry: { ...cur.entry, favourite: next || undefined } } : cur));
    try {
      await setFavourite(entry.id, next);
    } catch {
      apply(!next);
      setError("That favourite couldn’t be saved. Please try again.");
    }
  }

  async function saveName(key: string) {
    if (renaming === null) return;
    try {
      await renameCase(key, renaming);
      setRenaming(null);
      refresh();
    } catch {
      setError("That case couldn’t be renamed. Please try again.");
    }
  }

  async function removeVersion(id: string) {
    try {
      await moveToRecentlyDeleted(id);
      setOpen(null);
      haptic("success");
      setNotice(`Version moved to Recently Deleted. You can restore it from Settings › Cases for ${RECENTLY_DELETED_DAYS} days.`);
      refresh();
    } catch {
      setError("That version couldn’t be deleted. Please try again.");
    }
  }

  async function archiveVersion(id: string) {
    try {
      await setCaseArchived(id, true);
      setOpen(null);
      haptic("success");
      setNotice("Version archived. Find it in Settings › Cases › Archived Cases.");
      refresh();
    } catch {
      setError("That version couldn’t be archived. Please try again.");
    }
  }

  async function forWholeCase(group: CaseGroup, action: "archive" | "delete") {
    try {
      for (const v of group.versions) {
        if (action === "archive") await setCaseArchived(v.id, true);
        else await moveToRecentlyDeleted(v.id);
      }
      setOpenCase(null);
      haptic("success");
      setNotice(action === "archive"
        ? "Case archived. Find it in Settings › Cases › Archived Cases."
        : `Case moved to Recently Deleted. You can restore it from Settings › Cases for ${RECENTLY_DELETED_DAYS} days.`);
      refresh();
    } catch {
      setError("That case couldn’t be updated. Please try again.");
    }
  }

  /** After sharing, pick up the export just recorded against this version. */
  async function closeSharing() {
    setSharing(null);
    await refreshExports();
  }

  async function refreshExports() {
    const id = open?.entry.id;
    if (!id) return;
    const fresh = await listActiveLog().then(list => list.find(e => e.id === id)).catch(() => undefined);
    if (fresh) {
      setOpen(cur => (cur && cur.entry.id === id ? { ...cur, entry: fresh } : cur));
      setEntries(list => list?.map(e => (e.id === id ? fresh : e)) ?? list);
    }
  }

  const caseName = (group: CaseGroup) => { const first = group.versions[group.versions.length - 1]; return caseDisplayName(group.name, first?.summary, first?.createdAt ?? group.updatedAt); };
  const entryCaseName = (entry: CaseLogEntry) => { const group = all.find(g => g.key === caseIdOf(entry)); return group ? caseName(group) : caseDisplayName(entry.patientName, entry.summary, entry.createdAt); };
  const errorBanner = error && (
    <p className="error-message" role="alert">
      {error}
      <button onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button>
    </p>
  );

  return (
    <SideRailLayer>
    <div className={`sheet-backdrop${continueFrom !== undefined ? " is-continued" : ""}`} role="dialog" aria-modal="true" aria-label="Cases" onClick={onClose}>
      <div ref={panel} className={`log-panel${continueFrom !== undefined ? " continues" : ""}`} data-nav={nav ?? undefined} onClick={(e) => e.stopPropagation()}>
        <PatientSyncStatus showPending={false} />
        {awaitingInitial ? null : current ? (
          <div className={`case-page${nav === "push" ? " push" : ""}`} key={current.key}>
            <div className="case-page-head">
              {rail ? <RailItems order={0}>
                <RailButton label="Back to Cases" onClick={() => setOpenCase(null)}><ChevronLeft size={22} strokeWidth={1.8} /></RailButton>
                <RailButton label="Close" onClick={onClose}><X size={21} strokeWidth={1.9} /></RailButton>
              </RailItems> : <>
                <button type="button" className="case-back" onClick={() => setOpenCase(null)}>
                  <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />Cases
                </button>
                <button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
              </>}
            </div>

            {renaming !== null ? (
              <form className="case-rename" onSubmit={(e) => { e.preventDefault(); void saveName(current.key); }}>
                <label className="sr-only" htmlFor="case-rename">Case reference</label>
                <input
                  id="case-rename"
                  value={renaming}
                  onChange={(e) => setRenaming(e.target.value)}
                  maxLength={CASE_REFERENCE_MAX}
                  placeholder="Initials or reference, e.g. AB"
                  autoFocus
                  autoComplete="off"
                  enterKeyHint="done"
                />
                <button type="submit" className="primary-button" aria-label="Save name"><Check size={16} strokeWidth={2.2} /></button>
                <button type="button" className="text-button" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : (
              <div className="case-title">
                <h2>{caseName(current)}</h2>
                <button type="button" className="case-rename-button" onClick={() => setRenaming(current.name)} aria-label="Rename case">
                  <Pencil size={14} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>
            )}
            <p className="case-meta">
              {current.versions.length} {current.versions.length === 1 ? "version" : "versions"}
              {` · updated ${formatLogDate(current.updatedAt)}`}
            </p>
            {renaming !== null && <p className="control-hint case-hint">Use initials or a practice reference, not the patient’s full name.</p>}

            {errorBanner}
            {onReopen&&<button type="button" className="primary-button case-design-more" disabled={reopening} onClick={()=>void reopenDesign(current.key)}><PenLine size={17} strokeWidth={1.9} aria-hidden="true" />{reopening ? "Opening the studio…" : "Design more"}</button>}
            {syncIndicators[current.key] && <p className="control-hint" role="status">{syncIndicators[current.key]}</p>}

            {/* On a landscape iPad the lead design and the rest sit side by side; elsewhere these wrappers don't box anything. */}
            <div className="case-body">
            {hero && (
              <div className="case-hero">
                <Pressable onLong={(el) => openContextMenu(el, versionMenu(hero), { image: hero.thumb, title: versionTitle(hero, current.versions.indexOf(hero), current.versions.length), subtitle: [recentCaseTreatment(hero.summary), timeOf(hero.createdAt)].filter(Boolean).join(" · ") })}>{(press) => (
                <button type="button" className="case-hero-open" {...press} onClick={() => void openEntry(hero)} aria-label={`Open ${versionTitle(hero, current.versions.indexOf(hero), current.versions.length)}`}>
                  {heroImage ? <img src={heroImage} alt="" draggable={false} /> : <span className="version-thumb-empty" aria-hidden="true" />}
                  <span className="case-hero-caption">
                    <strong>{versionTitle(hero, current.versions.indexOf(hero), current.versions.length)}</strong>
                    <span>{[recentCaseTreatment(hero.summary), timeOf(hero.createdAt)].filter(Boolean).join(" · ")}{(hero.testMode || hero.mode === "mock") ? " · Test" : ""}</span>
                  </span>
                  {/* Says the photo opens: the version's before and after, analysis and sharing. */}
                  <span className="case-hero-expand" aria-hidden="true"><Maximize2 size={18} strokeWidth={2} /></span>
                </button>
                )}</Pressable>
                {pageRecord.preferredDesignId === hero.id && <span className="case-hero-badge"><CircleCheck size={13} strokeWidth={2} aria-hidden="true" />Patient’s preferred</span>}
                <button type="button" className={`version-star${hero.favourite ? " on" : ""}`} aria-pressed={Boolean(hero.favourite)}
                  aria-label={hero.favourite ? "Remove from favourites" : "Add to favourites"} onClick={() => void toggleFavourite(hero)}>
                  <Star size={17} strokeWidth={1.9} fill={hero.favourite ? "currentColor" : "none"} />
                </button>
              </div>
            )}

            <div className="case-side">
            {current.versions.length > 1 && (
              <section className="case-versions" aria-label="All versions">
                <div className="case-versions-head">
                  <h3>All versions</h3>
                  {current.favourites > 0 && (
                    <div className="settings-segment case-filter" role="tablist" aria-label="Show versions">
                      <button type="button" role="tab" aria-selected={!onlyFavourites} onClick={() => setOnlyFavourites(false)}>All</button>
                      <button type="button" role="tab" aria-selected={onlyFavourites} onClick={() => setOnlyFavourites(true)}>Favourites</button>
                    </div>
                  )}
                </div>
                {others.length ? (
                  <ul className="case-version-row">
                    {others.map(entry => {
                      const index = current.versions.indexOf(entry);
                      return (
                        <li key={entry.id}>
                          <Pressable onLong={(el) => openContextMenu(el, versionMenu(entry), { image: entry.thumb, title: versionTitle(entry, index, current.versions.length), subtitle: timeOf(entry.createdAt) })}>{(press) => (
                          <button type="button" className="case-version-tile" {...press} onClick={() => void openEntry(entry)}>
                            {entry.thumb ? <img src={entry.thumb} alt="" draggable={false} /> : <span className="version-thumb-empty" aria-hidden="true" />}
                            {entry.favourite && <Star className="case-version-fav" size={13} strokeWidth={1.9} fill="currentColor" aria-label="Favourite" />}
                            <span className="case-version-label">{versionTitle(entry, index, current.versions.length)} · {timeOf(entry.createdAt)}</span>
                          </button>
                          )}</Pressable>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="control-hint">No other favourites yet.</p>}
              </section>
            )}

            <CasePhotoSet caseId={current.key} onOpen={() => {
              const id = current.key, lead = hero;
              setPhotoSet({ caseId: id });
              if (lead) void readFull(lead.id).then(r => setPhotoSet(cur => (cur && cur.caseId === id ? { caseId: id, before: r?.media?.originalImage, concept: r?.media?.image } : cur)));
            }} />

            {confirmCase ? (
              <div className="case-confirm" role="alert">
                <p>Move this case to Recently Deleted?</p>
                <div className="case-actions">
                  <button type="button" className="secondary-button" onClick={() => setConfirmCase(false)}>Cancel</button>
                  <button type="button" className="secondary-button danger" onClick={() => void forWholeCase(current, "delete")}>Move</button>
                </div>
              </div>
            ) : (
              <div className="case-actions">
                <button type="button" className="secondary-button" onClick={() => void forWholeCase(current, "archive")}><Archive size={16} strokeWidth={1.7} aria-hidden="true" />Archive</button>
                <button type="button" className="secondary-button danger" onClick={() => setConfirmCase(true)}><Trash2 size={16} strokeWidth={1.7} aria-hidden="true" />Delete case</button>
              </div>
            )}
            </div>
            </div>
          </div>
        ) : (
          <>
            <div className="log-head">
              <h2>Cases</h2>
              {rail ? <RailItems order={0}><RailButton label="Close" onClick={onClose}><X size={21} strokeWidth={1.9} /></RailButton></RailItems>
                : <button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>}
            </div>

            <div className="log-search">
              <Search size={16} strokeWidth={1.7} aria-hidden="true" />
              <input
                id="log-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cases"
                aria-label="Search cases"
              />
              {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
            </div>

            {errorBanner}
            {notice && <p className="save-status" role="status">{notice}</p>}

            {entries === null ? (
              <p className="log-empty">Opening your cases…</p>
            ) : shown.length === 0 ? (
              all.length === 0 ? (
                <div className="empty-state">
                  <span className="icon-tile icon-tile-lg empty-state-tile" aria-hidden="true"><ComposingMark motion="draw" tone="auto" quick className="empty-state-mark" /></span>
                  <p className="empty-state-title">No smile designs yet</p>
                  <p className="empty-state-body">Upload a patient photograph to begin visualising treatment possibilities. Your saved designs will appear here.</p>
                </div>
              ) : (
                <p className="log-empty">No cases match that search.</p>
              )
            ) : (
              <ul className="log-list">
                {shown.map((group) => (
                  <li key={group.key} className={group.updatedAt > seenAt ? "is-new" : undefined}>
                    <SwipeRow actions={[
                      { label: "Archive", icon: <Archive size={18} strokeWidth={1.8} aria-hidden="true" />, onSelect: () => void forWholeCase(group, "archive") },
                      { label: "Delete", tone: "destructive", icon: <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />, onSelect: () => void forWholeCase(group, "delete") },
                    ]}>
                    <Pressable onLong={(el) => openContextMenu(el, caseMenu(group), { image: coverThumbs(group)[0]?.thumb, title: caseName(group), subtitle: `${group.versions.length} ${group.versions.length === 1 ? "version" : "versions"} · ${formatLogDate(group.updatedAt)}` })}>{(press) => (
                    <button className="log-row case-row" {...press} onClick={() => setOpenCase(group.key)}>
                      <span className={`case-cover count-${Math.min(3, group.versions.length)}`} aria-hidden="true">
                        {coverThumbs(group).map(v => v.thumb ? <img key={v.id} src={v.thumb} alt="" draggable={false} /> : <SmileSymbol key={v.id} size={26} />)}
                      </span>
                      {syncIndicators[group.key] && <small className="case-sync-indicator">{syncIndicators[group.key]}</small>}
                      <span className="log-row-text">
                        <strong>{caseName(group)}</strong>
                        <span className="log-date">{formatLogDate(group.updatedAt)}</span>
                        <span className="log-summary">
                          {group.versions.length} {group.versions.length === 1 ? "version" : "versions"}
                          {group.favourites > 0 && <> · <Star size={11} strokeWidth={2} fill="currentColor" className="case-fav-icon" aria-hidden="true" /> {group.favourites}</>}
                        </span>
                      </span>
                      {group.test && <span className="log-pill">Test</span>}
                      <ChevronRight className="case-chevron" size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                    )}</Pressable>
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            )}

            <div className="log-foot">
              <span>
                {shown.length === all.length
                  ? `${all.length} ${all.length === 1 ? "case" : "cases"}`
                  : `${shown.length} of ${all.length} cases`}
              </span>
              {all.length > 0 &&
                (confirmClear ? (
                  <span className="log-confirm">
                    Move all {all.length} to Recently Deleted?
                    <button
                      className="text-button danger"
                      onClick={async () => {
                        try {
                          await moveAllToRecentlyDeleted();
                          setConfirmClear(false);
                          setNotice(`Moved to Recently Deleted for ${RECENTLY_DELETED_DAYS} days.`);
                          refresh();
                        } catch {
                          setError("The cases couldn’t be deleted. Please try again.");
                        }
                      }}
                    >
                      Move
                    </button>
                    <button className="text-button" onClick={() => setConfirmClear(false)}>Cancel</button>
                  </span>
                ) : (
                  <button className="text-button" onClick={() => setConfirmClear(true)}>Clear cases</button>
                ))}
            </div>
          </>
        )}
      </div>

      {photoSet && !open && (
        <div className="log-detail-backdrop" onClick={() => setPhotoSet(null)} role="dialog" aria-modal="true" aria-label="Photo set">
          <div ref={frame} className="log-detail-frame">
            <div className="log-detail photo-set-page" onClick={(e) => e.stopPropagation()}>
              <PhotoSetPage caseId={photoSet.caseId} before={photoSet.before} concept={photoSet.concept} onBack={() => setPhotoSet(null)} onClose={() => { setPhotoSet(null); onClose(); }} />
            </div>
          </div>
        </div>
      )}
      {open && (
        <div
          className="log-detail-backdrop"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${entryCaseName(open.entry)} version`}
        >
          <div ref={frame} className="log-detail-frame">
          <div className="log-detail" onClick={(e) => e.stopPropagation()}>
            <div className="log-head">
              <div>
                <h2>{entryCaseName(open.entry)}</h2>
                <p className="log-date">{formatLogDate(open.entry.createdAt)} · {open.entry.summary}</p>
              </div>
              <span className="log-detail-head-actions">
                <button
                  type="button"
                  className={`version-star${open.entry.favourite ? " on" : ""}`}
                  aria-pressed={Boolean(open.entry.favourite)}
                  aria-label={open.entry.favourite ? "Remove from favourites" : "Add to favourites"}
                  onClick={() => void toggleFavourite(open.entry)}
                >
                  <Star size={17} strokeWidth={1.9} fill={open.entry.favourite ? "currentColor" : "none"} />
                </button>
                <SheetClose onClose={() => setOpen(null)} />
              </span>
            </div>
            <div className="log-detail-meta">
            {!open.entry.testMode && open.entry.mode !== "mock" && (
              <div className="log-detail-preferred">
                <button type="button" className={`preferred-toggle${openRecord.preferredDesignId === open.entry.id ? " on" : ""}`}
                  aria-pressed={openRecord.preferredDesignId === open.entry.id} onClick={() => void togglePreferred(open.entry)}>
                  <CircleCheck size={16} strokeWidth={1.9} aria-hidden="true" />
                  {openRecord.preferredDesignId === open.entry.id ? "Patient’s preferred version" : "Mark as patient’s preferred"}
                </button>
              </div>
            )}
            {errorBanner}
            {preferredError && <p className="error-message" role="alert">{preferredError}</p>}
            <CaseMediaStatus status={mediaStatus} onRetry={retryMedia} onSignIn={onSignIn} />
            </div>
            {/* Landscape iPad: the comparison on the left, the note and actions beside it; elsewhere these box nothing. */}
            <div className="log-detail-body">
            {open.media ? (
              <div className="log-pair">
                <figure>
                  <img src={open.media.originalImage} alt="Before" />
                  <figcaption>Before</figcaption>
                </figure>
                <figure>
                  <img src={open.media.image} alt="Saved AI smile concept" />
                  <figcaption>{open.entry.testMode || open.entry.mode === "mock" ? "Demo preview" : "AI concept"}</figcaption>
                </figure>
              </div>
            ) : (
              <p className="control-hint">{mediaStatus?.state === "MISSING" ? "If these images are still on another device, keep that copy. This saved version needs both images for comparison and export." : "Comparison, analysis and exports will be available when the images are downloaded."}</p>
            )}
            <div className="log-detail-side">
            <p className="share-concept-note">{AI_CONCEPT_DISCLAIMER}</p>
            <div className="log-detail-actions">
              <button className="primary-button" disabled={!open.media} onClick={() => setViewing("compare")}>
                <ScanEye size={18} /> Reopen comparison
              </button>
              <div className="action-list">
                <button type="button" className="action-row" disabled={!open.media} onClick={() => setViewing("analysis")}>
                  <span className="action-icon" aria-hidden="true"><AnalysisSymbol size={17} /></span><span className="action-label">Smile analysis</span><ChevronRight className="action-chevron" size={17} aria-hidden="true" />
                </button>
                <button type="button" className="action-row" disabled={!open.media} onClick={() => setSharing({})}>
                  <span className="action-icon" aria-hidden="true"><Share2 size={16} strokeWidth={1.7} /></span><span className="action-label">Share with patient</span><ChevronRight className="action-chevron" size={17} aria-hidden="true" />
                </button>
              </div>
              <div className="action-list">
                <button type="button" className="action-row" onClick={() => void archiveVersion(open.entry.id)}>
                  <span className="action-icon" aria-hidden="true"><Archive size={16} strokeWidth={1.7} /></span><span className="action-label">Archive version</span>
                </button>
                <button type="button" className="action-row danger" onClick={() => void removeVersion(open.entry.id)}>
                  <span className="action-icon" aria-hidden="true"><Trash2 size={16} strokeWidth={1.7} /></span><span className="action-label">Delete version</span>
                </button>
              </div>
            </div>
            {open.entry.exports && open.entry.exports.length > 0 && (
              <section className="log-exports" aria-label="Shared with patient">
                <h3>Shared with patient</h3>
                <p className="control-hint">Recreate an export from this saved version and its report settings.</p>
                <ul>
                  {open.entry.exports.map(record => (
                    <li key={record.createdAt}>
                      <span><strong>{EXPORT_NAMES[record.kind]}</strong><small>{formatLogDate(record.createdAt)}</small></span>
                      <button type="button" className="text-button" disabled={!open.media} onClick={() => setSharing({ kind: record.kind, draft: record.draft })}>Recreate</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            </div>
            </div>
          </div>
          </div>
        </div>
      )}
      {viewing && open?.media && <SavedCaseViewer entry={open.entry} media={open.media} analysis={viewing === "analysis"} onExported={() => void refreshExports()} onClose={() => setViewing(false)} />}
      {sharing && open?.media && (
        <ShareSheet
          input={savedCaseExport(open.entry, open.media, openRecord)}
          entryId={open.entry.id}
          initial={sharing.kind ? { kind: sharing.kind, draft: sharing.draft } : undefined}
          onClose={() => void closeSharing()}
        />
      )}
    </div>
    </SideRailLayer>
  );
}
