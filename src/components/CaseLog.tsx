"use client";
import { PatientSyncStatus } from "./PatientSyncStatus";
import { CaseMediaStatus } from "./CaseMediaStatus";
import { useCaseMedia } from "./useCaseMedia";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Check, ChevronLeft, ChevronRight, CircleCheck, Pencil, ScanEye, Search, Share2, Star, Trash2, X } from "lucide-react";
import { AnalysisSymbol, IconTile, SmileSymbol } from "@/components/icons/SmileIcons";
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
import { RECENTLY_DELETED_DAYS } from "@/config/cases";

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

export function CaseLog({ onClose, initialEntryId, onReopen, onSignIn }: { onClose: () => void; initialEntryId?: string; onReopen?: (caseId:string)=>Promise<void>; onSignIn?: () => void }) {
  const [repository] = useState(getCaseRepository);
  const { listActiveLog, moveAllToRecentlyDeleted, moveToRecentlyDeleted, purgeRecentlyDeleted, renameCase, setCaseArchived, setFavourite } = repository;
  const [entries, setEntries] = useState<CaseLogEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [detail, setOpen] = useState<{ entry: CaseLogEntry; media: CaseLogMedia | null } | null>(null);
  const { media, status: mediaStatus, retry: retryMedia } = useCaseMedia(repository, detail?.entry.id);
  const open = detail ? { ...detail, media } : null;
  const openRecord = useCaseRecord(detail ? caseIdOf(detail.entry) : undefined);
  const pageRecord = useCaseRecord(openCase ?? undefined);
  const [preferredError, setPreferredError] = useState("");
  async function togglePreferred(entry: CaseLogEntry) {
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

  // Leaving a case (or it emptying) resets its per-case state.
  useEffect(() => {
    if (openCase && entries && !current) setOpenCase(null);
  }, [openCase, entries, current]);
  useEffect(() => { setOnlyFavourites(false); setRenaming(null); setConfirmCase(false); }, [openCase]);

  async function openEntry(entry: CaseLogEntry) {
    if(entry.draftOnly){await reopenDesign(caseIdOf(entry));return;}
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
    if (entry) setOpenCase(caseIdOf(entry));
  }, [entries, initialEntryId, openedInitial]);

  async function toggleFavourite(entry: CaseLogEntry) {
    const next = !entry.favourite;
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

  const caseName = (group: CaseGroup) => group.name || "Unnamed case";
  const errorBanner = error && (
    <p className="error-message" role="alert">
      {error}
      <button onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button>
    </p>
  );

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Cases" onClick={onClose}>
      <div className="log-panel" onClick={(e) => e.stopPropagation()}>
        <PatientSyncStatus showPending={false} />
        {current ? (
          <div className="case-page" key={current.key}>
            <div className="case-page-head">
              <button type="button" className="case-back" onClick={() => setOpenCase(null)}>
                <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />Cases
              </button>
              <button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
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
                  <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />Rename
                </button>
              </div>
            )}
            <p className="case-meta">
              {current.versions.length} {current.versions.length === 1 ? "version" : "versions"}
              {current.favourites > 0 && ` · ${current.favourites} ${current.favourites === 1 ? "favourite" : "favourites"}`}
              {` · updated ${formatLogDate(current.updatedAt)}`}
            </p>
            <p className="control-hint case-hint">Use initials or a practice reference, not the patient’s full name.</p>

            {errorBanner}
            {onReopen&&<button type="button" className="text-button" disabled={reopening} onClick={()=>void reopenDesign(current.key)}>{reopening ? "Opening design…" : "Reopen design"}</button>}
            {syncIndicators[current.key] && <p className="control-hint" role="status">{syncIndicators[current.key]}</p>}

            {current.favourites > 0 && (
              <div className="settings-segment case-filter" role="tablist" aria-label="Show versions">
                <button type="button" role="tab" aria-selected={!onlyFavourites} onClick={() => setOnlyFavourites(false)}>All</button>
                <button type="button" role="tab" aria-selected={onlyFavourites} onClick={() => setOnlyFavourites(true)}>Favourites</button>
              </div>
            )}

            <ul className="version-grid">
              {versions.map((entry) => {
                const index = current.versions.indexOf(entry);
                return (
                  <li key={entry.id} className="version-tile">
                    <button type="button" className="version-open" onClick={() => void openEntry(entry)}>
                      <img src={entry.thumb} alt="" draggable={false} />
                      <span className="version-text">
                        <strong>{versionTitle(entry, index, current.versions.length)}</strong>
                        <span>{timeOf(entry.createdAt)}{(entry.testMode || entry.mode === "mock") ? " · Test" : ""}</span>
                        {pageRecord.preferredDesignId === entry.id && <span className="version-preferred">Patient preferred</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`version-star${entry.favourite ? " on" : ""}`}
                      aria-pressed={Boolean(entry.favourite)}
                      aria-label={entry.favourite ? "Remove from favourites" : "Add to favourites"}
                      onClick={() => void toggleFavourite(entry)}
                    >
                      <Star size={17} strokeWidth={1.9} fill={entry.favourite ? "currentColor" : "none"} />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="log-foot case-foot">
              {confirmCase ? (
                <span className="log-confirm">
                  Move this case to Recently Deleted?
                  <button className="text-button danger" onClick={() => void forWholeCase(current, "delete")}>Move</button>
                  <button className="text-button" onClick={() => setConfirmCase(false)}>Cancel</button>
                </span>
              ) : (
                <>
                  <button className="text-button" onClick={() => void forWholeCase(current, "archive")}><Archive size={15} strokeWidth={1.6} />Archive case</button>
                  <button className="text-button danger" onClick={() => setConfirmCase(true)}><Trash2 size={15} strokeWidth={1.6} />Delete case</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="log-head">
              <h2>Cases</h2>
              <button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
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
                  <IconTile icon={SmileSymbol} size="lg" className="empty-state-tile" />
                  <p className="empty-state-title">No smile designs yet</p>
                  <p className="empty-state-body">Upload a patient photograph to begin visualising treatment possibilities. Your saved designs will appear here.</p>
                </div>
              ) : (
                <p className="log-empty">No cases match that search.</p>
              )
            ) : (
              <ul className="log-list">
                {shown.map((group) => (
                  <li key={group.key}>
                    <button className="log-row case-row" onClick={() => setOpenCase(group.key)}>
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

      {open && (
        <div
          className="log-detail-backdrop"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${open.entry.patientName || "Unnamed case"} version`}
        >
          <div className="log-detail" onClick={(e) => e.stopPropagation()}>
            <div className="log-head">
              <div>
                <h2>{open.entry.patientName || "Unnamed case"}</h2>
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
                <button className="icon-button" onClick={() => setOpen(null)} aria-label="Close"><X size={16} /></button>
              </span>
            </div>
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
            <p className="share-concept-note">{AI_CONCEPT_DISCLAIMER}</p>
            <div className="log-detail-actions">
              <button className="primary-button" disabled={!open.media} onClick={() => setViewing("compare")}>
                <ScanEye size={18} /> Reopen comparison
              </button>
              <button className="secondary-button" disabled={!open.media} onClick={() => setViewing("analysis")}>
                <AnalysisSymbol size={18} />
                Smile analysis
              </button>
              <button className="secondary-button" disabled={!open.media} onClick={() => setSharing({})}>
                <Share2 size={16} strokeWidth={1.6} />
                Share with patient
              </button>
              <button className="text-button" onClick={() => void archiveVersion(open.entry.id)}>
                <Archive size={15} strokeWidth={1.6} />
                Archive version
              </button>
              <button className="text-button danger" onClick={() => void removeVersion(open.entry.id)}>
                <Trash2 size={15} strokeWidth={1.6} />
                Delete version
              </button>
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
  );
}
