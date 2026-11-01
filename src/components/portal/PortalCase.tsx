"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, CalendarClock, Camera, FileCheck2, Heart, Maximize2, MonitorPlay, MoreHorizontal, PenLine, Phone, Plus, ReceiptText, ScanFace, Send, Sparkles, Trash2, Waypoints, X } from "lucide-react";
import { SavedCaseViewer } from "@/components/SavedCaseViewer";
import { caseIdOf } from "@/models/case";
import { savedCaseExport } from "@/lib/savedCaseExport";
import { AI_CONCEPT_SUMMARY } from "@/lib/brand";
import { SHOWN_CASE_STATUSES, CASE_TAGS, MAX_TAGS, PHOTO_SLOTS, caseTitle, cleanTag, initialsOf, stageOf, type CaseStatus, type CaseConsent, type CaseEvent, type PhotoSlot, type PortalDetails, type PortalPatch } from "@/lib/portal";
import { gbp, nextInvoiceNumber } from "@/lib/billing";
import { EXPORT_NAMES } from "@/lib/consultation";
import { CaseBilling } from "./Billing";
import { caseActions } from "./caseSignals";
import type { CaseTab } from "./WebPortal";
import type { CaseLogEntry } from "@/lib/types";
import type { CaseRepository } from "@/services/cases/caseRepository";
import { PhotoSet, PhotoViewer } from "./PhotoSet";
import { ConsentStatus } from "@/components/consent/ConsentSheet";
import { LabReplies, SendToLab, ShareState, useLabs, type LabPackOption } from "./labs";
import { dataUrlToBlob, designRows, relativeDate, type CaseVersion } from "./portalData";
import { features } from "@/config/features";

type Tab = CaseTab;
const TAB_NAMES: Record<Tab, string> = { details: "Details", activity: "Activity", billing: "Billing", design: "Design", notes: "Notes", lab: "Lab" };
const APPOINTMENT_TYPES = ["Consultation", "Review", "Treatment", "Fit", "Follow-up"];

function Compare({ before, after, afterLabel, onFullScreen, onAnalysis }: { before: string; after: string; afterLabel: string; onFullScreen?: () => void; onAnalysis?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const drag = useRef(false);
  const move = (x: number) => { const r = box.current!.getBoundingClientRect(); setPos(Math.min(100, Math.max(0, ((x - r.left) / r.width) * 100))); };
  return <div ref={box} className="pt-compare" style={{ "--pos": `${pos}%` } as React.CSSProperties}
    onPointerDown={e => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); }}
    onPointerMove={e => drag.current && move(e.clientX)} onPointerUp={() => { drag.current = false; }} onDoubleClick={onFullScreen}>
    <img src={before} alt="Before" />
    <img className="pt-after" src={after} alt={afterLabel} />
    <div className="pt-bar" aria-hidden="true"><span>‹ ›</span></div>
    <span className="pt-tag pt-tag-l">Before</span><span className="pt-tag pt-tag-r">{afterLabel}</span>
    <input className="pt-range" type="range" min={0} max={100} value={Math.round(pos)} aria-label="Compare before and concept" onChange={e => setPos(Number(e.target.value))} />
    {(onFullScreen || onAnalysis) && <div className="pt-compare-tools" onPointerDown={e => e.stopPropagation()}>
      {onAnalysis && <button type="button" onClick={onAnalysis}><ScanFace size={15} />Smile analysis</button>}
      {onFullScreen && <button type="button" onClick={onFullScreen}><Maximize2 size={15} />Full screen</button>}
    </div>}
  </div>;
}

export function PortalCase({ caseId, repository, onBack, onOpenStudio, initialTab = "details" }: {
  caseId: string;
  repository: CaseRepository;
  onBack: () => void;
  initialTab?: Tab;
  onOpenStudio: (caseId: string, start: { hasDraft: boolean; name: string; front?: string }) => void;
}) {
  const { shares } = useLabs();
  const [details, setDetails] = useState<PortalDetails>({});
  const [designThumb, setDesignThumb] = useState("");
  const [hasDesignPhoto, setHasDesignPhoto] = useState(false);
  const [viewing, setViewing] = useState<PhotoSlot | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [versions, setVersions] = useState<CaseVersion[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [createdAt, setCreatedAt] = useState(() => Date.now());
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [presenting, setPresenting] = useState<false | "view" | "analysis">(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState("");
  const [name, setName] = useState(""), [reference, setReference] = useState(""), [notes, setNotes] = useState("");
  const [missing, setMissing] = useState(false);
  const [entries, setEntries] = useState<CaseLogEntry[]>([]);
  const [callNote, setCallNote] = useState("");

  const load = useCallback(async () => {
    const d = await repository.portalDetails(caseId);
    const entries = (await repository.listLog()).filter(e => caseIdOf(e) === caseId && !e.draftOnly && !e.testMode && e.mode !== "mock").sort((a, b) => b.createdAt - a.createdAt);
    if (!d && !entries.length) { setMissing(true); return; }
    const loaded: CaseVersion[] = [];
    for (const entry of entries.slice(0, 6)) { const media = await repository.readPresentationMedia(entry.id).catch(() => null); if (media) loaded.push({ entry, media }); }
    const portal = d?.portal ?? {};
    setEntries(entries);
    setDetails(portal); setDesignThumb(d?.designThumb ?? ""); setHasDesignPhoto(Boolean(d?.hasDesignPhoto)); setHasDraft(Boolean(d?.hasDraft)); setVersions(loaded);
    setCreatedAt(d?.createdAt ? Date.parse(d.createdAt) : entries.at(-1)?.createdAt ?? Date.now());
    setTags(portal.tags ?? []);
    setName(portal.name || entries.find(e => e.patientName)?.patientName || ""); setReference(portal.reference ?? ""); setNotes(portal.notes ?? "");
  }, [caseId, repository]);
  useEffect(() => { void load().catch(() => setMissing(true)); }, [load]);

  async function save(patch: PortalPatch, label = "Saved") {
    setSaving("Saving…");
    try {
      await repository.updatePortal(caseId, patch);
      const { photos, thumbs, swap, consent, fee, appointment, event, ...text } = patch;
      setDetails(d => { const next: PortalDetails = { ...d, ...text }; if (consent === null) delete next.consent; else if (consent) next.consent = consent; return next; });
      setSaving(label);
      // Billing, appointments and the timeline are cleaned and stamped on save: read them back.
      if (photos || thumbs || swap || fee !== undefined || appointment !== undefined || event || text.tags || text.invoices) void load();
    }
    catch { setSaving("Couldn’t save. Check your connection."); }
  }

  /** Saved straight away (not through save) so the consent screen can tell the patient if it failed. */
  async function saveConsent(consent: CaseConsent | null) {
    const withName = consent && !name.trim() ? { name: consent.patientName } : {};
    await repository.updatePortal(caseId, { consent, ...withName });
    setDetails(d => { const next: PortalDetails = { ...d, ...withName }; if (consent) next.consent = consent; else delete next.consent; return next; });
    if (withName.name) setName(withName.name);
    setSaving(consent ? "Consent saved" : "Consent removed");
  }
  function setTagList(next: string[]) { setTags(next); void save({ tags: next }, "Tags saved"); }
  async function wholeCase(action: "archive" | "delete") {
    try {
      const ids = (await repository.listLog()).filter(e => caseIdOf(e) === caseId).map(e => e.id);
      for (const id of ids) { if (action === "archive") await repository.setCaseArchived(id, true); else await repository.moveToRecentlyDeleted(id); }
      onBack();
    } catch { setSaving("That case couldn’t be updated. Please try again."); setMenu(false); }
  }

  if (missing) return <section className="pt-view"><button className="pt-back" onClick={onBack}><ArrowLeft size={15} />Back to cases</button><p className="pt-sub">This case is no longer available.</p></section>;
  const version = versions?.[selected];
  const latest = versions?.[0];
  const favourite = Boolean(versions?.some(v => v.entry.favourite));
  const thumbs = details.thumbs ?? {};
  // The design photo stands in for the front of the set when the set has none of its own.
  const designFront = !thumbs.front && hasDesignPhoto;
  const frontThumb = thumbs.front || (designFront ? designThumb : "");
  const loadFull = (slot: PhotoSlot) => slot === "front" && designFront ? repository.portalDesignPhoto(caseId) : repository.portalPhoto(caseId, slot);
  const filled = PHOTO_SLOTS.map(s => s.id).filter(id => thumbs[id] || (id === "front" && frontThumb));
  const caseShares = shares.filter(s => s.caseId === caseId);
  const status = (details.status ?? "progress") as CaseStatus;
  const settings = version?.media.preferences?.settings;
  const stage = stageOf(tags);
  const sent = entries.flatMap(e => (e.exports ?? []).map(x => ({ kind: x.kind, at: x.createdAt }))).sort((a, b) => b.at - a.at);
  const facts = { labels: tags, stageAt: details.stageAt, createdAt, updatedAt: latest?.entry.createdAt ?? createdAt, concepts: entries.length, sent,
    hasConsent: Boolean(details.consent), photoCount: Object.keys(details.thumbs ?? {}).length + (hasDesignPhoto ? 1 : 0), fee: details.fee,
    invoices: details.invoices ?? [], appointment: details.appointment, history: details.history };
  const next = versions === null ? null : caseActions(facts)[0] ?? null;
  const timeline: (CaseEvent & { icon: typeof Phone; tone?: string })[] = [
    ...(details.history ?? []).map(e => ({ ...e, icon: e.kind === "call" ? Phone : e.kind === "stage" ? Waypoints : e.kind === "appointment" ? CalendarClock : ReceiptText, tone: e.kind === "payment" ? "green" : e.kind === "call" ? "blue" : undefined })),
    ...entries.map((e, i) => ({ at: e.createdAt, kind: "stage" as const, text: `${e.label || `Concept ${entries.length - i}`} designed${e.summary ? ` · ${e.summary}` : ""}`, icon: Sparkles })),
    ...sent.map(x => ({ at: x.at, kind: "stage" as const, text: `${EXPORT_NAMES[x.kind as keyof typeof EXPORT_NAMES] ?? "Export"} sent to the patient`, icon: Send, tone: "blue" })),
    ...(details.consent ? [{ at: details.consent.signedAt, kind: "stage" as const, text: `Consent signed by ${details.consent.patientName}`, icon: FileCheck2 }] : []),
    { at: createdAt, kind: "stage" as const, text: "Case started", icon: Camera },
  ].sort((a, b) => b.at - a.at);
  const nextNumber = async () => nextInvoiceNumber(Object.values(await repository.portalIndex()).flatMap(i => i.invoices ?? []));
  // A new appointment takes its type from where the case is.
  const apptType = details.appointment?.type ?? (stage === "Treatment booked" || stage === "In treatment" ? "Treatment" : stage === "Going ahead" ? "Review" : "Consultation");
  const toLocalInput = (t: number) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  const spec = designRows(settings);

  const packOptions: LabPackOption[] = [
    ...PHOTO_SLOTS.flatMap(({ id, label: slotLabel }) => {
      if (!filled.includes(id)) return [];
      return [{ key: id, label: slotLabel, defaultOn: true, make: async () => { const full = await loadFull(id); if (!full) throw new Error(`${slotLabel} couldn’t be downloaded. Check your connection and try again.`); return { label: slotLabel, blob: await dataUrlToBlob(full) }; } }];
    }),
    ...(version ? [{ key: "concept", label: `Agreed concept`, detail: version.entry.label || "AI concept", defaultOn: true,
      make: async () => ({ label: `Concept · ${version.entry.label || "AI concept"}`, blob: await dataUrlToBlob(version.media.image) }) }] : []),
    ...(details.consent ? [{ key: "consent", label: "Patient consent (PDF)", detail: details.consent.agreed.lab ? undefined : "Patient didn’t agree to lab sharing", defaultOn: false, make: async () => {
      const { consentPdf } = await import("@/lib/consentRecord");
      return { label: "Patient consent", blob: await consentPdf(details.consent!, reference || caseTitle(name, reference, createdAt)) };
    } }] : []),
    ...(version ? [{ key: "report", label: "Consultation Report (PDF)", defaultOn: false, make: async () => {
      const record = await repository.caseRecord(caseId);
      const input = { ...savedCaseExport(version.entry, version.media, record), patientLabel: reference || undefined };
      const [{ composeConsultationReport, consultationReportPdf }, { initialReportDraft, reportContent }] = await Promise.all([import("@/lib/consultationReport"), import("@/lib/consultation")]);
      const draft = initialReportDraft({ settings: input.settings, analysis: null, patientLabel: input.patientLabel });
      const content = reportContent(draft, { settings: input.settings, referenceUsed: input.referenceUsed, styleUsed: input.styleUsed, analysis: null, isDemo: input.isDemo, consultation: input.consultation, preferred: input.preferred });
      const { pages } = await composeConsultationReport(input, content, null);
      return { label: "Consultation Report", blob: await consultationReportPdf(pages) };
    } }] : []),
  ];

  return <section className="pt-view">
    <button className="pt-back" onClick={onBack}><ArrowLeft size={15} />Back to cases</button>
    <div className="pt-case-head">
      <div>
        <h1 className="pt-h1">{caseTitle(name, reference, createdAt)}</h1>
        {tags.length > 0 && <div className="pt-labels pt-head-labels">{tags.map(t => <span key={t} className="pt-label">{t}</span>)}</div>}
        <div className="pt-meta">{reference && <span>Case {reference}</span>}<span>{versions?.length ? `${versions.length} concept${versions.length === 1 ? "" : "s"}` : "No concept yet"}</span>{latest && <span>Updated {relativeDate(latest.entry.createdAt)}</span>}{details.consent && <span>Consent signed</span>}{details.fee ? <span>Estimate {gbp(details.fee)}</span> : null}{saving && <span className="pt-saving" role="status">{saving}</span>}</div>
      </div>
      <div className="pt-row">
        {latest && <button className={`pt-btn pt-btn-line pt-btn-icon${favourite ? " fav" : ""}`} aria-pressed={favourite} aria-label="Favourite"
          onClick={async () => { await repository.setFavourite(latest.entry.id, !favourite); void load(); }}><Heart size={17} fill={favourite ? "currentColor" : "none"} /></button>}
        <button className="pt-btn pt-btn-line" disabled={!frontThumb && !hasDraft} title={!frontThumb && !hasDraft ? "Add a smile front photo first" : undefined}
          onClick={async () => onOpenStudio(caseId, { hasDraft, name, front: hasDraft ? undefined : (await loadFull("front")) ?? undefined })}><PenLine size={16} />{versions?.length || hasDraft ? "Open in Design Studio" : "Design this smile"}</button>
        {features.labExport && <button className="pt-btn pt-btn-line" disabled={!reference} title={!reference ? "Add a case reference first" : undefined} onClick={() => setSending(true)}><Send size={16} />Send to lab</button>}
        <button className="pt-btn pt-btn-dark" disabled={!version} onClick={() => setPresenting("view")}><MonitorPlay size={16} />Present to patient</button>
        <span className="pt-menu-wrap">
          <button className="pt-btn pt-btn-line pt-btn-icon" aria-label="More actions" aria-expanded={menu} onClick={() => { setMenu(m => !m); setConfirm(null); }}><MoreHorizontal size={18} /></button>
          {menu && <div className="pt-menu" role="menu">
            {confirm ? <div className="pt-menu-confirm">
              <p>{confirm === "archive" ? "Archive this case? It leaves your case list; find it again in Settings › Cases › Archived Cases." : "Move this case to Recently Deleted? You can restore it from Settings › Cases for 30 days."}</p>
              <div className="pt-row pt-end"><button className="pt-btn pt-btn-line pt-btn-small" onClick={() => setConfirm(null)}>Cancel</button>
                <button className={`pt-btn pt-btn-small ${confirm === "delete" ? "pt-btn-danger" : "pt-btn-dark"}`} onClick={() => void wholeCase(confirm)}>{confirm === "archive" ? "Archive" : "Move to Recently Deleted"}</button></div>
            </div> : <>
              <button role="menuitem" onClick={() => setConfirm("archive")}><Archive size={15} />Archive case</button>
              <button role="menuitem" className="danger" onClick={() => setConfirm("delete")}><Trash2 size={15} />Delete case</button>
            </>}
          </div>}
        </span>
      </div>
    </div>
    {!name && !reference && versions !== null && <div className="pt-callout" role="note">
      <div><b>Give this case a name or reference</b><span>{features.labExport ? "So you can find it again, and so labs see your practice reference rather than a date." : "So you can find it again, by your practice reference rather than a date."}</span></div>
      <button className="pt-btn pt-btn-gold pt-btn-small" onClick={() => { setTab("details"); setTimeout(() => nameInput.current?.focus(), 50); }}>Add details</button>
    </div>}

    <div className="pt-case">
      <div className="pt-card pt-case-main">
        {version ? <><Compare before={version.media.originalImage} after={version.media.image} afterLabel={version.entry.label || "AI concept"} onFullScreen={() => setPresenting("view")} onAnalysis={() => setPresenting("analysis")} />
          {versions && versions.length > 1 && <div className="pt-variants" role="tablist" aria-label="Concepts">
            {versions.map((v, i) => <button key={v.entry.id} type="button" role="tab" aria-selected={i === selected} className={i === selected ? "on" : ""} onClick={() => setSelected(i)}>
              <span className="pt-variant-img"><img src={v.media.image} alt="" /></span><span>{v.entry.label || `Concept ${versions.length - i}`}</span></button>)}
          </div>}
          <p className="pt-disclaimer">{AI_CONCEPT_SUMMARY}</p></>
          : versions === null ? <div className="pt-compare pt-skeleton" />
          : <div className="pt-nodesign">{frontThumb ? <img src={frontThumb} alt="Smile front" /> : null}
            <div><b>{frontThumb ? "Ready to design" : "Add a smile front photo"}</b><p>{frontThumb ? "Open the Design Studio to create the first concept for this case." : "Drop the patient’s smile front photo into the first slot below, then design the smile."}</p></div></div>}
        <div className="pt-set-head"><h3>Photo set</h3><span className="pt-hint">Drop photos onto a slot, or drag one slot onto another to swap</span></div>
        <PhotoSet thumbs={thumbs} designThumb={designFront ? designThumb : undefined}
          onAdd={photos => void save({ photos }, "Photo set saved")}
          onSwap={(a, b) => void save({ swap: [a, b] }, "Photo set saved")} onOpen={setViewing} />
        {viewing && <PhotoViewer slot={viewing} filled={filled} load={loadFull} onClose={() => setViewing(null)} onMove={setViewing}
          onReplace={(slot, photo) => void save({ photos: { [slot]: photo } }, "Photo replaced")}
          onRemove={viewing === "front" && designFront ? undefined : slot => void save({ photos: { [slot]: null } }, "Photo removed")} />}
      </div>

      <div className="pt-case-side">
      {next && <div className={`pt-card pt-next tone-${next.tone}`}>
        <span className="pt-kicker">Next step</span>
        <h3>{next.title}</h3>
        <p>{next.detail}</p>
        <div className="pt-row pt-wrap">
          {(next.kind === "follow-up" || next.kind === "preview-waiting") && <>
            <button className="pt-btn pt-btn-gold pt-btn-small" onClick={() => setTagList([...tags.filter(t => !["Consultation", "Thinking it over"].includes(t)), "Going ahead"])}>Mark as going ahead</button>
            <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => void save({ event: { kind: "call", text: "Called the patient" } }, "Call logged")}><Phone size={14} />Log a call</button></>}
          {(next.kind === "raise-invoice" || next.kind === "invoice-overdue" || next.kind === "awaiting-payment") && <button className="pt-btn pt-btn-gold pt-btn-small" onClick={() => setTab("billing")}><ReceiptText size={14} />Open billing</button>}
          {next.kind === "consent" && <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => setTab("details")}>Record consent</button>}
          {(next.kind === "design" || next.kind === "prepare") && (frontThumb || hasDraft) && <button className="pt-btn pt-btn-gold pt-btn-small"
            onClick={async () => onOpenStudio(caseId, { hasDraft, name, front: hasDraft ? undefined : (await loadFull("front")) ?? undefined })}><PenLine size={14} />Design the smile</button>}
          {next.kind === "present" && version && <button className="pt-btn pt-btn-dark pt-btn-small" onClick={() => setPresenting("view")}><MonitorPlay size={14} />Present</button>}
        </div>
      </div>}
      <aside className="pt-card pt-panel">
        <div className="pt-tabs" role="tablist">
          {(["details", "activity", "billing", "design", "notes", ...(features.labExport ? ["lab"] : [])] as Tab[]).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "lab" ? `Lab${caseShares.length ? ` (${caseShares.length})` : ""}` : TAB_NAMES[t]}</button>)}
        </div>
        {tab === "details" && <div>
          <div className="pt-who"><span className="pt-ini">{initialsOf(name || reference)}</span><div><b>{caseTitle(name, reference, createdAt)}</b><small>{reference ? `Case ${reference}` : "No reference yet"}</small></div></div>
          <ConsentStatus consent={details.consent} patientName={name} caseLabel={reference || caseTitle(name, reference, createdAt)} onSave={saveConsent} />
          <label className="pt-field">Patient name or initials<input ref={nameInput} value={name} maxLength={60} onChange={e => setName(e.target.value)} onBlur={() => name !== (details.name ?? "") && void save({ name })} /></label>
          <label className="pt-field">Case reference<input value={reference} maxLength={40} placeholder="e.g. SR-1024" onChange={e => setReference(e.target.value)} onBlur={() => reference !== (details.reference ?? "") && void save({ reference })} />
            <span className="pt-hint">Your practice reference{features.labExport ? ". Labs see this, not the name" : ""}. Avoid dates of birth or NHS numbers.</span></label>
          <p className="pt-sec">Next appointment</p>
          <div className="pt-appt">
            <input type="datetime-local" aria-label="Appointment date and time" value={details.appointment ? toLocalInput(details.appointment.at) : ""}
              onChange={e => { const at = Date.parse(e.target.value); if (Number.isFinite(at)) void save({ appointment: { at, type: apptType }, event: { kind: "appointment", text: `${apptType} booked for ${new Date(at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` } }, "Appointment saved"); }} />
            <select aria-label="Appointment type" value={apptType} disabled={!details.appointment}
              onChange={e => details.appointment && void save({ appointment: { ...details.appointment, type: e.target.value } }, "Appointment saved")}>
              {APPOINTMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            {details.appointment && <button type="button" className="pt-icon-btn" aria-label="Clear appointment" onClick={() => void save({ appointment: null }, "Appointment cleared")}><X size={15} /></button>}
          </div>
          <p className="pt-sec">Status</p>
          <div className="pt-seg">{SHOWN_CASE_STATUSES.map(s => <button key={s.id} className={status === s.id ? "on" : ""} onClick={() => void save({ status: s.id })}>{s.label}</button>)}</div>
          <p className="pt-sec">Tags</p>
          <div className="pt-tag-picker">
            {[...CASE_TAGS, ...tags.filter(t => !(CASE_TAGS as readonly string[]).includes(t))].map(t => {
              const on = tags.includes(t);
              return <button key={t} type="button" className={`pt-label pt-label-btn${on ? " on" : ""}`} aria-pressed={on} disabled={!on && tags.length >= MAX_TAGS}
                onClick={() => setTagList(on ? tags.filter(x => x !== t) : [...tags, t])}>{t}</button>;
            })}
          </div>
          <form className="pt-tag-add" onSubmit={e => { e.preventDefault(); const t = cleanTag(newTag); if (t && !tags.some(x => x.toLowerCase() === t.toLowerCase())) setTagList([...tags, t]); setNewTag(""); }}>
            <input value={newTag} maxLength={24} placeholder="Your own tag" aria-label="New tag" disabled={tags.length >= MAX_TAGS} onChange={e => setNewTag(e.target.value)} />
            <button className="pt-btn pt-btn-line pt-btn-small" disabled={!newTag.trim() || tags.length >= MAX_TAGS}><Plus size={14} />Add</button>
          </form>
        </div>}
        {tab === "activity" && <div>
          <form className="pt-call" onSubmit={e => { e.preventDefault(); void save({ event: { kind: "call", text: callNote.trim() ? `Call · ${callNote.trim()}` : "Called the patient" } }, "Call logged"); setCallNote(""); }}>
            <input value={callNote} maxLength={160} placeholder="Log a call, e.g. Wants to think about cost" aria-label="Call note" onChange={e => setCallNote(e.target.value)} />
            <button className="pt-btn pt-btn-line pt-btn-small"><Phone size={14} />Log</button>
          </form>
          <ul className="pt-timeline">{timeline.map((e, i) => { const Icon = e.icon; return <li key={`${e.at}-${i}`} className={e.tone ? `tone-${e.tone}` : ""}>
            <span className="pt-tl-dot"><Icon size={13} /></span>
            <div><b>{e.text}</b><small>{relativeDate(e.at)}</small></div></li>; })}</ul>
        </div>}
        {tab === "billing" && <CaseBilling key={versions === null ? "loading" : "ready"} invoices={details.invoices ?? []} fee={details.fee} feeNote={details.feeNote} patient={caseTitle(name, reference, createdAt)} reference={reference}
          stage={stage} nextNumber={nextNumber} onSave={(patch, label) => void save(patch, label)} />}
        {tab === "design" && <div>
          {spec.length ? <dl className="pt-kv">{spec.map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
            : <p className="pt-hint">The design appears here once a concept has been created.</p>}
        </div>}
        {tab === "notes" && <div>
          <textarea className="pt-notes" value={notes} maxLength={2000} placeholder="What the patient wants, concerns, next steps…" onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (details.notes ?? "") && void save({ notes })} />
          <p className="pt-hint">Notes stay with the case.{features.labExport ? " They go to a lab only if you include them." : ""}</p>
        </div>}
        {tab === "lab" && features.labExport && <div>
          {caseShares.length ? caseShares.map(s => <div key={s.id}><div className="pt-labrow"><span className="pt-lab-mark small">{initialsOf(s.labName)}</span><div><b>{s.labName}</b><small>Sent {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · expires {new Date(s.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></div><ShareState share={s} /></div><LabReplies share={s} /></div>)
            : <p className="pt-hint">Not sent to a lab yet.</p>}
          {details.consent && !details.consent.agreed.lab && <p className="pt-warn">The patient didn’t agree to their photos being shared with a lab. Record a new consent first if they’ve changed their mind.</p>}
          {!details.consent && <p className="pt-hint">No patient consent recorded yet. You can record it in Details.</p>}
          <button className="pt-btn pt-btn-gold pt-btn-block" disabled={!reference} onClick={() => setSending(true)}><Send size={15} />Send to lab</button>
          {!reference && <p className="pt-hint">Add a case reference in Details first.</p>}
        </div>}
      </aside>
      </div>
    </div>

    {presenting && version && <SavedCaseViewer entry={version.entry} media={version.media} analysis={presenting === "analysis"} onClose={() => setPresenting(false)} />}
    {sending && <SendToLab caseId={caseId} caseLabel={reference} options={packOptions} spec={spec} note={notes}
      onClose={() => setSending(false)} onSent={() => { if (status === "progress") void save({ status: "lab" }); }} />}
  </section>;
}
