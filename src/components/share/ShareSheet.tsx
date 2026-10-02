"use client";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { AI_CONCEPT_DISCLAIMER } from "@/lib/brand";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Copy, Download, FileText, Film, Mail, Share2, X } from "lucide-react";
import {
  EXPORT_NAMES, NOTE_MAX, OBSERVATION_MAX, editObservation, initialReportDraft, reportContent, reportDate, smileObservations, confidenceBand,
  type ExportKind, type ReportDraft, type ReportSections,
} from "@/lib/consultation";
import type { ReportAnalysis } from "@/lib/face/analysisReport";
import type { PatientExportInput } from "@/lib/smilePreview";
import type { CurrentShade } from "@/lib/types";

/**
 * Share with patient: two different things to send. The Smile Preview (the
 * default) is the before and concept, made to share in a tap. The
 * Consultation Report adds the design, what the photograph shows and what
 * treatment may involve, after a short review. Nothing is made until the
 * clinician chooses.
 */

type Step = "choose" | "review" | "making" | "ready";

interface Made {
  kind: ExportKind;
  /** The image to share or save: the Smile Preview, or the report's pages one above the other. */
  image: Blob;
  /** For display: one URL per page. */
  urls: string[];
  /** Report pages, for the PDF. */
  pages?: Blob[];
  omitted: string[];
}

const SHADES: CurrentShade[] = ["A3", "A2", "A1", "B1"];

const SECTION_LABELS: { key: keyof ReportSections; label: string; hint?: string }[] = [
  { key: "observations", label: "Smile observations" },
  { key: "design", label: "Proposed smile design" },
  { key: "treatment", label: "Treatment overview" },
  { key: "comparison", label: "Today and proposed" },
  { key: "technical", label: "Detailed technical analysis", hint: "Degrees and reference lines, usually for colleagues rather than patients" },
];

function fileStem(label?: string) {
  const name = label?.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return name ? `-${name}` : "";
}

export function ShareSheet({
  input,
  entryId,
  initial,
  onClose,
  onRevealVideo,
}: {
  input: PatientExportInput;
  /** The saved version the export is recorded against. */
  entryId?: string;
  /** Reopen an earlier export with its settings. */
  initial?: { kind: ExportKind; draft?: ReportDraft };
  onClose: () => void;
  onRevealVideo?: () => void;
}) {
  const [repository] = useState(getCaseRepository);
  const [step, setStep] = useState<Step>("choose");
  const [making, setMaking] = useState<ExportKind>("preview");
  const [made, setMade] = useState<Made | null>(null);
  const [draft, setDraft] = useState<ReportDraft>(() => initial?.draft ?? initialReportDraft({ settings: input.settings, analysis: null, patientLabel: input.patientLabel }));
  const [analysis, setAnalysis] = useState<ReportAnalysis | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const started = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  // Object URLs go when the export changes or the sheet closes.
  useEffect(() => () => made?.urls.forEach(u => URL.revokeObjectURL(u)), [made]);

  // Reopening an earlier export goes straight to it.
  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    if (initial.kind === "preview") void makePreview();
    else openReview();
    // Runs once, for the export being reopened.
  }, []);

  function readFace() {
    if (analysis || reading) return;
    setReading(true);
    void import("@/lib/face/analysisReport")
      .then(({ prepareReportAnalysis }) => { repository.scope.assert(); return prepareReportAnalysis(input.before, input.after); })
      .then(result => {
        repository.scope.assert();
        setAnalysis(result);
        // Fill in observations unless the clinician is reopening reviewed ones.
        setDraft(d => d.observations.length || initial?.draft
          ? d
          : { ...d, observations: smileObservations(result.face).map(o => ({ ...o, band: confidenceBand(o.confidence) })).filter(o => o.band !== "low").map(o => ({ ...o, include: o.band === "high" })) });
      })
      .catch(() => setAnalysis({ face: null, figure: null }))
      .finally(() => setReading(false));
  }

  function openReview() {
    setError("");
    setStatus("");
    setStep("review");
    readFace();
  }

  async function record(kind: ExportKind, reviewed?: ReportDraft) {
    if (!entryId) return;
    try {
      const { recordExport } = repository;
      await recordExport(entryId, { kind, createdAt: Date.now(), ...(reviewed ? { draft: reviewed } : {}) });
    } catch { /* the export itself still stands */ }
  }

  async function makePreview() {
    setMaking("preview");
    setStep("making");
    setError("");
    setStatus("");
    try {
      const { composeSmilePreview } = await import("@/lib/smilePreview");
      const image = await composeSmilePreview(input);
      repository.scope.assert();
      setMade({ kind: "preview", image, urls: [URL.createObjectURL(image)], omitted: [] });
      setStep("ready");
      void record("preview");
    } catch {
      setError("The Smile Preview couldn’t be made on this device.");
      setStep("choose");
    }
  }

  async function makeReport() {
    setMaking("report");
    setStep("making");
    setError("");
    setStatus("");
    try {
      const [{ composeConsultationReport }, { stackPages }] = await Promise.all([import("@/lib/consultationReport"), import("@/lib/exportCanvas")]);
      const content = reportContent(draft, { settings: input.settings, referenceUsed: input.referenceUsed, analysis: analysis?.face ?? null, isDemo: input.isDemo });
      const { pages, omitted } = await composeConsultationReport(input, content, analysis);
      const image = pages.length > 1 ? await stackPages(pages, 36) : pages[0];
      repository.scope.assert();
      setMade({ kind: "report", image, pages, urls: pages.map(p => URL.createObjectURL(p)), omitted });
      setStep("ready");
      void record("report", draft);
    } catch {
      setError("The report couldn’t be made on this device.");
      setStep("review");
    }
  }

  const title = made?.kind === "report" ? "Your smile consultation" : "Your smile preview";
  const stem = `smilecompose-${made?.kind === "report" ? "consultation" : "smile-preview"}${fileStem(input.patientLabel)}`;

  async function pdf(): Promise<Blob> {
    if (!made) throw new Error("Nothing to save.");
    if (made.kind === "report") {
      const { consultationReportPdf } = await import("@/lib/consultationReport");
      return consultationReportPdf(made.pages ?? [made.image]);
    }
    const { smilePreviewPdf } = await import("@/lib/smilePreview");
    return smilePreviewPdf(made.image);
  }

  async function act(name: string, run: () => Promise<string | void>) {
    if (busy || !made) return;
    setBusy(name);
    setError("");
    setStatus("");
    try {
      const note = await run();
      if (note) setStatus(note);
    } catch {
      setError(name === "copy" ? "Copying isn’t available here. Use Share instead." : "That didn’t work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const outcomeNote = (outcome: string) => (outcome === "downloaded" ? "Saved to your downloads." : undefined);
  const actions = made && {
    share: () => act("share", async () => {
      const { shareExport } = await import("@/lib/exportActions");
      // The preview travels best as an image; the report as a PDF.
      const blob = made.kind === "report" ? await pdf() : made.image;
      repository.scope.assert();
      return outcomeNote(await shareExport(blob, `${stem}.${made.kind === "report" ? "pdf" : "jpg"}`, title));
    }),
    image: () => act("image", async () => {
      const { saveExport } = await import("@/lib/exportActions");
      repository.scope.assert();
      return outcomeNote(await saveExport(made.image, `${stem}.jpg`, title));
    }),
    pdf: () => act("pdf", async () => {
      const { saveExport } = await import("@/lib/exportActions");
      const blob = await pdf(); repository.scope.assert();
      return outcomeNote(await saveExport(blob, `${stem}.pdf`, title));
    }),
    copy: () => act("copy", async () => {
      const { copyExportImage } = await import("@/lib/exportActions");
      repository.scope.assert();
      if (!(await copyExportImage(made.image))) throw new Error("No clipboard");
      return "Copied. Paste it into a message or email.";
    }),
    email: () => act("email", async () => {
      const { emailExport } = await import("@/lib/exportActions");
      const blob = await pdf(); repository.scope.assert();
      return outcomeNote(await emailExport(blob, `${stem}.pdf`, title));
    }),
  };

  return (
    <div className="sheet-backdrop share-backdrop" role="dialog" aria-modal="true" aria-label="Share with patient" onClick={onClose}>
      <div className={`sheet share-sheet is-${step}`} onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
          if (e.key !== "Tab") return;
          const controls = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]")].filter(el => el.getClientRects().length);
          if (!controls.length) return;
          if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus(); }
          else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0]?.focus(); }
        }}>
        <div className="share-head">
          {(step === "review" || step === "ready") && (
            <button type="button" className="icon-button share-back" aria-label="Back" onClick={() => setStep(step === "ready" && made?.kind === "report" ? "review" : "choose")}>
              <ArrowLeft size={17} />
            </button>
          )}
          <div className="share-titles">
            <h2>{step === "review" ? "Review patient report" : step === "ready" ? `${made ? EXPORT_NAMES[made.kind] : ""} ready` : "Share with patient"}</h2>
            <p>{step === "review"
              ? "Check what the patient will read. Any wording can be changed."
              : step === "ready" ? (made?.kind === "report" ? "Send it now, or save it for the patient record." : "Ready to send: it looks good in Messages, WhatsApp, email and Photos.")
                : "Choose what you’d like to send."}</p>
          </div>
          <button ref={closeButton} type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <p className="share-concept-note">{AI_CONCEPT_DISCLAIMER}</p>
        {error && <p className="share-error" role="alert">{error}</p>}

        {step === "choose" && (
          <div className="share-options">
            <button type="button" className="share-option" onClick={() => void makePreview()}>
              <span className="share-thumb is-preview" aria-hidden="true">
                <span className="share-thumb-photos"><img src={input.before} alt="" /><img src={input.after} alt="" /></span>
                <i /><i className="short" />
              </span>
              <span className="share-option-text">
                <span className="share-option-title">Smile Preview <em>Recommended</em></span>
                <span className="share-option-desc">A simple before-and-concept comparison designed for easy sharing.</span>
                <span className="share-option-meta">Before + concept · Best for quick sharing</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="share-option" onClick={openReview}>
              <span className="share-thumb is-report" aria-hidden="true">
                <span className="share-thumb-page">
                  <b />
                  <span className="share-thumb-photos"><img src={input.before} alt="" /><img src={input.after} alt="" /></span>
                  <i /><i /><i className="short" /><i /><i className="short" />
                </span>
              </span>
              <span className="share-option-text">
                <span className="share-option-title">Consultation Report</span>
                <span className="share-option-desc">A more detailed summary of the smile concept and consultation.</span>
                <span className="share-option-meta">Design + explanation · Best for follow-up</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            {onRevealVideo && (
              <button type="button" className="share-video" onClick={onRevealVideo}>
                <Film size={16} strokeWidth={1.6} /> Or send the reveal video
              </button>
            )}
          </div>
        )}

        {step === "review" && (
          <Review draft={draft} onChange={setDraft} reading={reading} analysis={analysis} hasDesign={Boolean(input.settings)} onCreate={() => void makeReport()} />
        )}

        {step === "making" && (
          <div className="share-making" role="status">
            <span className="share-spinner" aria-hidden="true" />
            {making === "report" ? "Preparing the consultation report…" : "Preparing the Smile Preview…"}
          </div>
        )}

        {step === "ready" && made && actions && (
          <div className="share-ready">
            <div className={`share-result${made.urls.length > 1 ? " is-pages" : ""}`}>
              {made.urls.map((url, i) => (
                <img key={url} src={url} alt={made.kind === "report" ? `Consultation report, page ${i + 1}` : "Smile Preview: before and concept"} />
              ))}
            </div>
            {made.omitted.length > 0 && (
              <p className="share-note">{made.omitted.join(" and ")} didn’t fit within two pages, so it was left out.</p>
            )}
            <button type="button" className="primary-button share-primary" disabled={Boolean(busy)} onClick={actions.share}>
              <Share2 size={17} strokeWidth={1.7} /> {busy === "share" ? "Preparing…" : "Share"}
            </button>
            <div className="share-actions">
              <button type="button" disabled={Boolean(busy)} onClick={actions.image}><Download size={17} strokeWidth={1.6} /><span>Save Image</span></button>
              <button type="button" disabled={Boolean(busy)} onClick={actions.pdf}><FileText size={17} strokeWidth={1.6} /><span>Save PDF</span></button>
              <button type="button" disabled={Boolean(busy)} onClick={actions.copy}><Copy size={17} strokeWidth={1.6} /><span>Copy</span></button>
              <button type="button" disabled={Boolean(busy)} onClick={actions.email}><Mail size={17} strokeWidth={1.6} /><span>Email</span></button>
            </div>
            {status && <p className="share-status" role="status"><Check size={14} /> {status}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** The clinician's check before a report goes out: sections, wording, shade and a note. */
function Review({ draft, onChange, reading, analysis, hasDesign, onCreate }: {
  draft: ReportDraft;
  onChange: (d: ReportDraft) => void;
  reading: boolean;
  analysis: ReportAnalysis | null;
  hasDesign: boolean;
  onCreate: () => void;
}) {
  const set = (patch: Partial<ReportDraft>) => onChange({ ...draft, ...patch });
  const date = useMemo(() => reportDate(draft.date), [draft.date]);
  const noFace = !reading && analysis && !analysis.face;
  return (
    <div className="share-review">
      <div className="review-field">
        <label htmlFor="report-label">Prepared for <span>Optional · first name or case reference</span></label>
        <input id="report-label" type="text" value={draft.patientLabel} maxLength={32} autoComplete="off" spellCheck={false}
          onChange={e => set({ patientLabel: e.target.value })} placeholder="e.g. Sarah or AB" />
        <small>Consultation date: {date}</small>
      </div>

      <fieldset className="review-group">
        <legend>Include</legend>
        {SECTION_LABELS.map(({ key, label, hint }) => {
          const needsDesign = key === "design" || key === "treatment" || key === "comparison";
          return (
            <label key={key} className="review-check">
              <input type="checkbox" checked={draft.sections[key]} disabled={needsDesign && !hasDesign}
                onChange={e => set({ sections: { ...draft.sections, [key]: e.target.checked } })} />
              <span>{label}{hint && <small>{hint}</small>}{needsDesign && !hasDesign && <small>Not recorded for this older preview</small>}</span>
            </label>
          );
        })}
      </fieldset>

      {draft.sections.observations && (
        <fieldset className="review-group">
          <legend>Your smile at a glance</legend>
          {reading && <p className="review-quiet" role="status">Reading the photograph on this device…</p>}
          {noFace && <p className="review-quiet">No facial observations: this photograph doesn’t show the whole face, so only the design is described.</p>}
          {draft.observations.map((o, i) => (
            <div key={o.metric} className={`review-item${o.include ? "" : " is-off"}`}>
              <label className="review-check">
                <input type="checkbox" checked={o.include}
                  onChange={e => set({ observations: draft.observations.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })} />
                <span>{o.title}{o.band === "medium" && o.source !== "clinician" && <em className="review-flag">Check</em>}</span>
              </label>
              <textarea rows={2} value={o.text} maxLength={OBSERVATION_MAX} aria-label={`${o.title} wording`}
                onChange={e => set({ observations: draft.observations.map((x, j) => (j === i ? editObservation(x, e.target.value) : x)) })} />
              {o.band === "medium" && o.source !== "clinician" && <small className="review-hint">Less certain from this photo, so it’s only included if you tick it.</small>}
            </div>
          ))}
          {draft.shade.value !== null && (
            <div className={`review-item${draft.shade.include ? "" : " is-off"}`}>
              <label className="review-check">
                <input type="checkbox" checked={draft.shade.include} onChange={e => set({ shade: { ...draft.shade, include: e.target.checked } })} />
                <span>{draft.shade.confirmed ? "Current shade" : "Estimated visual shade"}{!draft.shade.confirmed && <em className="review-flag">Check</em>}</span>
              </label>
              <div className="review-shade">
                <div className="segmented" role="group" aria-label="Shade today">
                  {SHADES.map(s => (
                    <button key={s} type="button" aria-pressed={draft.shade.value === s} className={draft.shade.value === s ? "selected" : ""}
                      onClick={() => set({ shade: { ...draft.shade, value: s } })}>{s}</button>
                  ))}
                </div>
                <label className="review-check compact">
                  <input type="checkbox" checked={draft.shade.confirmed} onChange={e => set({ shade: { ...draft.shade, confirmed: e.target.checked } })} />
                  <span>Confirmed clinically</span>
                </label>
              </div>
              <small className="review-hint">Lighting, white balance and the camera change how shade looks in a photo. Unconfirmed, it reads as an estimate that needs clinical confirmation.</small>
            </div>
          )}
        </fieldset>
      )}

      {draft.priorities.length > 0 && (
        <fieldset className="review-group">
          <legend>What could make the biggest difference</legend>
          {draft.priorities.map((p, i) => (
            <div key={i} className={`review-item${p.include ? "" : " is-off"}`}>
              <label className="review-check">
                <input type="checkbox" checked={p.include}
                  onChange={e => set({ priorities: draft.priorities.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })} />
                <input className="review-title" type="text" value={p.title} maxLength={48} aria-label={`Priority ${i + 1} title`}
                  onChange={e => set({ priorities: draft.priorities.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              </label>
              <textarea rows={2} value={p.text} maxLength={OBSERVATION_MAX} aria-label={`Priority ${i + 1} wording`}
                onChange={e => set({ priorities: draft.priorities.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            </div>
          ))}
        </fieldset>
      )}

      <div className="review-field">
        <label htmlFor="report-note">Add note <span>Optional</span></label>
        <textarea id="report-note" rows={3} value={draft.note} maxLength={NOTE_MAX}
          placeholder="e.g. We discussed whitening followed by composite bonding to the upper six teeth."
          onChange={e => set({ note: e.target.value })} />
      </div>

      <button type="button" className="primary-button share-primary" onClick={onCreate} disabled={reading}>
        {reading ? "Reading the photograph…" : "Create report"}
      </button>
    </div>
  );
}
