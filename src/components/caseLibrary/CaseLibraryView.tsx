"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Plus, X } from "lucide-react";
import { IconTile, LibrarySymbol } from "@/components/icons/SmileIcons";
import { CaseFeatures } from "@/components/CaseFeatures";
import { CASE_LIBRARY_AUTHORITY_TEXT } from "@/config/legal";
import { pickImage } from "@/lib/pickImage";
import { caseMaterials, upperTeeth as UPPER_TEETH, type CaseFeature, type CaseMaterial, type TeethCount } from "@/lib/types";
import type { ReferenceTags } from "@/services/caseLibrary/caseLibraryApi";
import { useCaseLibrary, type AddResult, type ReferenceCase } from "./caseLibraryContext";

/**
 * Case Library: the clinician's own finished work, used as style references.
 * iPhone: a native list. iPad: filters in a sidebar beside a grid.
 * Separate from patient Cases in data, navigation and wording.
 */

type Filter = "all" | "composite" | "porcelain";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "composite", label: "Composite" },
  { key: "porcelain", label: "Porcelain" },
];
const inFilter = (c: ReferenceCase, filter: Filter) =>
  filter === "all" || (filter === "porcelain" ? c.material === "Porcelain" : c.material !== "Porcelain");

export const materialShort = (m: CaseMaterial) =>
  m === "Single-shade composite" ? "Single shade" : m === "Layered composite" ? "Layered" : "Porcelain";

export const QUALITY_GUIDANCE = "The best references are well-lit, straight-on close-ups.";

const TEETH_PRESETS: TeethCount[] = [4, 6, 8, 10];
/** The central upper teeth, e.g. 6 → 13 to 23 (the same sets Compose uses). */
const upperTeeth = (n: TeethCount) => UPPER_TEETH[n];
const sameTeeth = (a: number[], b: number[]) => a.length === b.length && a.every(id => b.includes(id));

const formatDate = (ms: number) => ms ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(ms) : "";
export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(0, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

function summary(c: ReferenceCase): string {
  return [c.label ? c.material : null, c.teethTreated.length ? `${c.teethTreated.length} teeth` : null, formatDate(c.createdAt)]
    .filter(Boolean).join(" · ");
}

type Page = { kind: "list" } | { kind: "add" } | { kind: "detail"; id: string };

export function CaseLibraryView({ startWithAdd, onClose }: { startWithAdd: boolean; onClose: () => void }) {
  const lib = useCaseLibrary();
  const [page, setPage] = useState<Page>(startWithAdd ? { kind: "add" } : { kind: "list" });
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState<{ title: string; body?: string } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    sheet.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cases = lib.cases;
  const shown = (cases ?? []).filter(c => inFilter(c, filter));
  const selected = page.kind === "detail" ? cases?.find(c => c.id === page.id) : undefined;
  const title = page.kind === "add" ? "Add Finished Case" : page.kind === "detail" ? (selected?.label || (selected ? materialShort(selected.material) : "Reference case")) : "Case Library";

  function added(result: AddResult, wasEmpty: boolean) {
    setPage({ kind: "list" });
    if (result.added === 0) return;
    const failed = result.failed ? ` ${result.failed} ${result.failed === 1 ? "photo" : "photos"} couldn’t be added${result.firstError ? `: ${result.firstError}` : "."}` : "";
    setNotice(wasEmpty
      ? { title: "Added to your Case Library", body: `SmileCompose can now use ${result.added === 1 ? "this case" : "these cases"} as a reference for relevant designs.${failed}` }
      : { title: `${result.added} ${result.added === 1 ? "case" : "cases"} added to your Case Library`, body: failed.trim() || undefined });
  }

  const count = (f: Filter) => (cases ?? []).filter(c => inFilter(c, f)).length;

  return (
    <div className="cl-backdrop" role="dialog" aria-modal="true" aria-labelledby="cl-title" onClick={onClose}>
      <div className="cl-sheet" ref={sheet} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <header className="cl-head">
          {page.kind === "list"
            ? <span className="cl-head-side" />
            : <button type="button" className="cl-nav-button" onClick={() => setPage({ kind: "list" })}><ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />Case Library</button>}
          <div className="cl-head-title">
            <h2 id="cl-title">{title}</h2>
            {page.kind === "list" && <p>Your style references</p>}
          </div>
          <button type="button" className="cl-nav-button cl-done" onClick={onClose}>Done</button>
        </header>

        <div className={`cl-body${page.kind === "list" ? " with-sidebar" : ""}`}>
          {page.kind === "list" && (
            <nav className="cl-sidebar" aria-label="Case Library filters">
              <ul>
                {FILTERS.map(f => (
                  <li key={f.key}>
                    <button type="button" aria-current={filter === f.key ? "true" : undefined} onClick={() => setFilter(f.key)}>
                      <span>{f.label}</span><span className="cl-count">{cases ? count(f.key) : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="cl-sidebar-add" onClick={() => setPage({ kind: "add" })}><Plus size={16} strokeWidth={2} aria-hidden="true" />Add Case</button>
              <p className="cl-sidebar-note">{QUALITY_GUIDANCE}</p>
            </nav>
          )}

          <section className="cl-main">
            {page.kind === "list" && (
              <>
                {notice && (
                  <div className="cl-notice" role="status">
                    <LibrarySymbol size={20} />
                    <span><strong>{notice.title}</strong>{notice.body && <span>{notice.body}</span>}</span>
                    <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={14} /></button>
                  </div>
                )}
                {lib.error && (
                  <p className="error-message" role="alert">{lib.error} <button type="button" className="text-button" onClick={() => void lib.refresh()}>Try again</button></p>
                )}
                {cases === null ? (
                  <p className="cl-loading">Opening your Case Library…</p>
                ) : cases.length === 0 ? (
                  <LibraryEmptyState onAdd={() => setPage({ kind: "add" })} />
                ) : (
                  <>
                    <div className="settings-segment cl-phone-filter" role="tablist" aria-label="Filter by material">
                      {FILTERS.map(f => <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>)}
                    </div>
                    <button type="button" className="cl-add-row" onClick={() => setPage({ kind: "add" })}>
                      <span className="cl-add-icon" aria-hidden="true"><Plus size={18} strokeWidth={2.2} /></span>Add Finished Case
                    </button>
                    <h3 className="cl-section-title">Style references</h3>
                    {shown.length === 0
                      ? <p className="cl-loading">No {filter === "porcelain" ? "porcelain" : "composite"} cases yet.</p>
                      : (
                        <ul className="cl-items">
                          {shown.map(c => (
                            <li key={c.id}>
                              <button type="button" className="cl-item" onClick={() => setPage({ kind: "detail", id: c.id })}>
                                <CaseImage className="cl-thumb" src={c.thumbnailUrl} alt="" />
                                <span className="cl-item-text">
                                  <strong>{c.label || c.material}</strong>
                                  <span>{summary(c)}</span>
                                </span>
                                <ChevronRight className="cl-chevron" size={18} strokeWidth={2} aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                  </>
                )}
                <LibraryPrivacyNote />
                {lib.legacyTools && <button type="button" className="text-button cl-legacy" onClick={() => { onClose(); lib.legacyTools?.(); }}>Pinning, validation and import tools (this device)</button>}
              </>
            )}

            {page.kind === "add" && (
              <AddReferenceCases onDone={added} onCancel={() => setPage({ kind: "list" })} />
            )}

            {page.kind === "detail" && (selected
              ? <CaseDetail key={selected.id} entry={selected} onDeleted={() => { setPage({ kind: "list" }); setNotice({ title: "Removed from your Case Library" }); }} />
              : <p className="cl-loading">This case is no longer in your Case Library.</p>)}
          </section>
        </div>
      </div>
    </div>
  );
}

export function LibraryEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="cl-empty">
      <IconTile icon={LibrarySymbol} size="lg" />
      <h3>Build your style library</h3>
      <p>Add examples of your finished bonding and porcelain cases. SmileCompose can use them as private visual references when creating new designs, helping results reflect your preferred contour, texture and finish.</p>
      <button type="button" className="primary-button" onClick={onAdd}><Plus size={17} strokeWidth={2} aria-hidden="true" />Add Finished Case</button>
      <p className="cl-guidance">{QUALITY_GUIDANCE}</p>
    </div>
  );
}

function LibraryPrivacyNote() {
  const { mode } = useCaseLibrary();
  return (
    <p className="cl-privacy">
      {mode === "device"
        ? "Case Library photos are stored only on this device."
        : "Stored privately in your SmileCompose account. When “Use my Case Library” is on, a few matching references are sent with that design for AI processing. SmileCompose doesn’t use them to train AI models."}
    </p>
  );
}

/** A private image that falls back to a neutral tile rather than a broken image. */
function CaseImage({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={`${className} cl-image-missing`} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} />;
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} draggable={false} />;
}

interface TagState { material: CaseMaterial; label: string; teeth: number[]; conditions: CaseFeature[] }

const toTags = (t: TagState): ReferenceTags => ({ material: t.material, label: t.label.trim().slice(0, 80), teethTreated: t.teeth, startingConditions: t.conditions });

/** onChange takes an updater so quick successive taps never overwrite each other. */
function TagFields({ value, onChange, idPrefix }: { value: TagState; onChange: (update: (v: TagState) => TagState) => void; idPrefix: string }) {
  const custom = value.teeth.length > 0 && !TEETH_PRESETS.some(n => sameTeeth(upperTeeth(n), value.teeth));
  return (
    <div className="cl-fields">
      <div className="control-group">
        <span className="control-label" id={`${idPrefix}-material`}>Material</span>
        <div className="segmented" role="group" aria-labelledby={`${idPrefix}-material`}>
          {caseMaterials.map(m => (
            <button key={m} type="button" aria-pressed={value.material === m} className={value.material === m ? "selected" : ""} onClick={() => onChange(v => ({ ...v, material: m }))}>{materialShort(m)}</button>
          ))}
        </div>
      </div>
      <div className="control-group">
        <div className="control-label"><label htmlFor={`${idPrefix}-label`}>Label</label><span className="muted">Optional</span></div>
        <input id={`${idPrefix}-label`} className="name-field" maxLength={80} autoComplete="off" placeholder="e.g. Upper 6, layered, 2025" value={value.label} onChange={e => { const label = e.target.value; onChange(v => ({ ...v, label })); }} />
        <p className="control-hint">Don’t include patient names or other identifying details.</p>
      </div>
      <div className="control-group">
        <div className="control-label"><span id={`${idPrefix}-teeth`}>Teeth treated</span><span className="muted">Optional</span></div>
        <div className="feature-tags" role="group" aria-labelledby={`${idPrefix}-teeth`}>
          <button type="button" aria-pressed={value.teeth.length === 0} className={value.teeth.length === 0 ? "selected" : ""} onClick={() => onChange(v => ({ ...v, teeth: [] }))}>Not set</button>
          {TEETH_PRESETS.map(n => {
            const on = sameTeeth(upperTeeth(n), value.teeth);
            return <button key={n} type="button" aria-pressed={on} className={on ? "selected" : ""} onClick={() => onChange(v => ({ ...v, teeth: upperTeeth(n) }))}>Upper {n}</button>;
          })}
          {custom && <button type="button" aria-pressed="true" className="selected">{value.teeth.length} teeth</button>}
        </div>
      </div>
      <div className="control-group">
        <div className="control-label"><span>Starting conditions</span><span className="muted">Optional</span></div>
        <CaseFeatures value={value.conditions} onChange={conditions => onChange(v => ({ ...v, conditions }))} />
      </div>
    </div>
  );
}

/** Tag, choose photos, confirm authority (first upload only), upload. Also used in onboarding. */
export function AddReferenceCases({ onDone, onCancel, cancelLabel = "Cancel" }: {
  onDone: (result: AddResult, wasEmpty: boolean) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const lib = useCaseLibrary();
  const [tags, setTags] = useState<TagState>({ material: "Layered composite", label: "", teeth: [], conditions: [] });
  const [pending, setPending] = useState<File[] | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const busy = progress !== null;

  async function upload(files: File[]) {
    const wasEmpty = (lib.cases?.length ?? 0) === 0;
    setProgress({ done: 0, total: files.length });
    try {
      const result = await lib.addCases(files, toTags(tags), (done, total) => setProgress({ done, total }));
      if (result.added === 0) setError(result.firstError ?? "Those photos couldn’t be added. Please try again.");
      else onDone(result, wasEmpty);
    } finally {
      setProgress(null);
    }
  }

  async function choose() {
    setError("");
    const files = await pickImage("library", { multiple: true });
    if (!files.length) return;
    if (!lib.authorityConfirmed) { setPending(files); return; }
    await upload(files);
  }

  async function confirmAndUpload() {
    if (!pending) return;
    setError("");
    try {
      await lib.confirmAuthority();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your confirmation couldn’t be saved. Please try again.");
      return;
    }
    const files = pending;
    setPending(null);
    await upload(files);
  }

  if (pending) {
    return (
      <div className="cl-authority">
        <h3>Before you add your first cases</h3>
        <p>Case Library photos show real patients, so SmileCompose asks once for your confirmation.</p>
        <label className="cl-authority-check">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
          <span>{CASE_LIBRARY_AUTHORITY_TEXT}</span>
        </label>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="cl-actions">
          <button type="button" className="primary-button" disabled={!agreed} onClick={() => void confirmAndUpload()}>Confirm and add {pending.length === 1 ? "photo" : `${pending.length} photos`}</button>
          <button type="button" className="text-button" onClick={() => { setPending(null); setAgreed(false); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cl-add">
      <p className="cl-add-intro">Tag the photos you’re about to add, so SmileCompose can match them to relevant designs. Photos added together share these tags.</p>
      <fieldset disabled={busy}>
        <TagFields value={tags} onChange={setTags} idPrefix="cl-add" />
      </fieldset>
      <p className="cl-guidance">{QUALITY_GUIDANCE} Similar framing and lighting across cases works better than a single striking photo.</p>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="cl-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void choose()}>
          <ImagePlus size={17} strokeWidth={1.8} aria-hidden="true" />
          {progress ? `Adding ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Choose Photos"}
        </button>
        {onCancel && <button type="button" className="text-button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>}
      </div>
      {progress && <progress className="cl-progress" max={progress.total} value={progress.done} aria-label="Upload progress" />}
    </div>
  );
}

function CaseDetail({ entry, onDeleted }: { entry: ReferenceCase; onDeleted: () => void }) {
  const lib = useCaseLibrary();
  const initial: TagState = { material: entry.material, label: entry.label, teeth: entry.teethTreated, conditions: entry.startingConditions };
  const [tags, setTags] = useState<TagState>(initial);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const dirty = JSON.stringify(toTags(tags)) !== JSON.stringify(toTags(initial));

  async function save() {
    setBusy(true); setError(""); setStatus("");
    try { await lib.updateCase(entry.id, toTags(tags)); setStatus("Tags saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Those changes couldn’t be saved."); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError("");
    try { await lib.removeCase(entry.id); onDeleted(); }
    catch (e) { setError(e instanceof Error ? e.message : "That case couldn’t be removed."); setBusy(false); }
  }

  return (
    <div className="cl-detail">
      <figure className="cl-detail-figure">
        <CaseImage className="cl-detail-image" src={entry.imageUrl ?? entry.thumbnailUrl} alt={entry.label ? `Finished case: ${entry.label}` : "Finished case"} />
        <figcaption>{[entry.material, formatDate(entry.createdAt), entry.bytes ? formatBytes(entry.bytes) : null].filter(Boolean).join(" · ")}{entry.validationOnly ? " · Held out from designs" : ""}</figcaption>
      </figure>
      <div className="cl-detail-form">
        <fieldset disabled={busy}>
          <TagFields value={tags} onChange={update => { setTags(update); setStatus(""); }} idPrefix={`cl-${entry.id}`} />
        </fieldset>
        {error && <p className="error-message" role="alert">{error}</p>}
        {status && <p className="library-status" role="status">{status}</p>}
        <div className="cl-actions">
          <button type="button" className="primary-button" disabled={!dirty || busy} onClick={() => void save()}>Save Changes</button>
        </div>
        <div className="cl-danger">
          {confirmDelete ? (
            <>
              <p>Remove this case? Its photo and reference image are permanently deleted from your Case Library.</p>
              <div className="cl-actions">
                <button type="button" className="primary-button danger-button" disabled={busy} onClick={() => void remove()}>Remove Case</button>
                <button type="button" className="text-button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <button type="button" className="text-button danger-text" onClick={() => setConfirmDelete(true)}>Remove from Case Library</button>
          )}
        </div>
      </div>
    </div>
  );
}
