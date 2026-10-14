"use client";
import { SheetClose } from "@/components/sideRail/SideRail";
import { useEffect, useRef, useState } from "react";
import { Check, Download, FileSignature, RotateCcw } from "lucide-react";
import { CONSENT_ITEMS, CONSENT_VERSION, SHOWN_CONSENT_ITEMS, type CaseConsent, type ConsentItem } from "@/lib/portal";
import { signedOn } from "@/lib/consentRecord";
import { features } from "@/config/features";

/** A finger or pen signature on a canvas, exported as a small transparent PNG. */
function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false), inked = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const c = canvas.current!; const r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.6; ctx.strokeStyle = "#1d1d1f";
  }, []);
  const at = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const finish = () => {
    if (!drawing.current) return; drawing.current = false; last.current = null;
    if (!inked.current) return;
    const c = canvas.current!; const out = document.createElement("canvas"); const scale = Math.min(1, 700 / c.width);
    out.width = Math.round(c.width * scale); out.height = Math.round(c.height * scale);
    out.getContext("2d")!.drawImage(c, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  };
  function clear() { const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); inked.current = false; onChange(""); }
  return <div className="cs-pad">
    <canvas ref={canvas} aria-label="Sign here with your finger or a stylus" role="img"
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = at(e); }}
      onPointerMove={e => {
        if (!drawing.current || !last.current) return;
        const p = at(e), ctx = canvas.current!.getContext("2d")!;
        ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        last.current = p; inked.current = true;
      }}
      onPointerUp={finish} onPointerCancel={finish} />
    <span className="cs-pad-line" aria-hidden="true">Sign here</span>
    <button type="button" className="cs-clear" onClick={clear}><RotateCcw size={14} />Clear</button>
  </div>;
}

/**
 * The consent screen the patient reads and signs on the practice's iPad or computer.
 * Required statements must be ticked; the optional ones are the patient's free choice.
 */
export function ConsentSheet({ patientName, onCancel, onSigned }: {
  patientName: string;
  onCancel: () => void;
  onSigned: (consent: CaseConsent) => Promise<void>;
}) {
  const [name, setName] = useState(patientName);
  const [agreed, setAgreed] = useState<Record<ConsentItem, boolean>>(() => Object.fromEntries(CONSENT_ITEMS.map(i => [i.id, false])) as Record<ConsentItem, boolean>);
  const [signature, setSignature] = useState("");
  const [state, setState] = useState<"signing" | "saving" | "done">("signing");
  const [error, setError] = useState("");
  const ready = name.trim().length > 1 && Boolean(signature) && CONSENT_ITEMS.every(i => !i.required || agreed[i.id]);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  async function sign() {
    if (!ready) return;
    setState("saving"); setError("");
    try { await onSigned({ version: CONSENT_VERSION, signedAt: Date.now(), patientName: name.trim(), agreed, signature }); setState("done"); }
    catch { setState("signing"); setError("The consent couldn’t be saved. Please hand the device back to your dentist."); }
  }

  return <div className="cs-layer" role="dialog" aria-modal="true" aria-labelledby="cs-title">
    <div className="cs-sheet">
      {state === "done" ? <div className="cs-done">
        <span className="cs-done-mark"><Check size={30} /></span>
        <h2 id="cs-title">Thank you, {name.trim().split(/\s+/)[0]}</h2>
        <p>Your consent has been saved with your case. Please hand the device back to your dentist.</p>
        <button className="pt-btn pt-btn-dark" onClick={onCancel}>Done</button>
      </div> : <>
        <div className="cs-top">
          <span className="cs-kicker"><FileSignature size={15} />Before we design your smile</span>
          <SheetClose onClose={onCancel} label="Cancel" className="cs-close" size={18} />
        </div>
        <h2 id="cs-title">Your consent</h2>
        <p className="cs-lead">Please read each statement. The first two are needed for us to design your smile; the rest are your choice, and you can change your mind at any time.</p>
        <ul className="cs-items">
          {SHOWN_CONSENT_ITEMS.map(item => <li key={item.id}>
            <label className={agreed[item.id] ? "on" : ""}>
              <input type="checkbox" checked={agreed[item.id]} onChange={e => setAgreed(a => ({ ...a, [item.id]: e.target.checked }))} />
              <span className="cs-box" aria-hidden="true"><Check size={15} /></span>
              <span className="cs-text">{item.text}<small>{item.required ? "Needed" : "Optional"}</small></span>
            </label>
          </li>)}
        </ul>
        <label className="pt-field cs-name">Your name<input value={name} maxLength={60} autoComplete="off" onChange={e => setName(e.target.value)} /></label>
        <SignaturePad onChange={setSignature} />
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="cs-actions">
          <span className="cs-date">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
          <button className="pt-btn pt-btn-gold" disabled={!ready || state === "saving"} onClick={() => void sign()}>{state === "saving" ? "Saving…" : "I agree and sign"}</button>
        </div>
      </>}
    </div>
  </div>;
}

/** A signed consent, read-only, for the clinician. */
export function ConsentView({ consent, caseLabel, onClose, onRemove }: { consent: CaseConsent; caseLabel: string; onClose: () => void; onRemove?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const { consentPdf } = await import("@/lib/consentRecord");
      const url = URL.createObjectURL(await consentPdf(consent, caseLabel));
      const a = document.createElement("a"); a.href = url; a.download = `Consent ${caseLabel}.pdf`.replace(/[\\/:*?"<>|]/g, "-"); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally { setBusy(false); }
  }
  return <div className="cs-layer" role="dialog" aria-modal="true" aria-labelledby="cs-view-title" onClick={onClose}>
    <div className="cs-sheet" onClick={e => e.stopPropagation()}>
      <div className="cs-top">
        <span className="cs-kicker"><FileSignature size={15} />Signed {signedOn(consent.signedAt)}</span>
        <SheetClose onClose={onClose} className="cs-close" size={18} />
      </div>
      <h2 id="cs-view-title">Consent · {consent.patientName}</h2>
      <ul className="cs-items cs-readonly">
        {SHOWN_CONSENT_ITEMS.map(item => <li key={item.id}><label className={consent.agreed[item.id] ? "on" : "off"}>
          <span className="cs-box" aria-hidden="true">{consent.agreed[item.id] ? <Check size={15} /> : null}</span>
          <span className="cs-text">{item.text}<small>{consent.agreed[item.id] ? "Agreed" : "Not agreed"}</small></span>
        </label></li>)}
      </ul>
      <div className="cs-signed"><img src={consent.signature} alt={`Signature of ${consent.patientName}`} /><span>{consent.patientName}</span></div>
      <p className="pt-hint">Wording {consent.version}. If the patient changes their mind, record a new consent.</p>
      <div className="cs-actions">
        {onRemove && (confirm
          ? <span className="pt-row"><span className="pt-hint">Remove this consent record?</span><button className="pt-btn pt-btn-line pt-btn-small" onClick={() => setConfirm(false)}>Keep</button><button className="pt-btn pt-btn-danger pt-btn-small" onClick={onRemove}>Remove</button></span>
          : <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => setConfirm(true)}>Remove</button>)}
        <button className="pt-btn pt-btn-dark" disabled={busy} onClick={() => void download()}><Download size={15} />{busy ? "Preparing…" : "Download PDF"}</button>
      </div>
    </div>
  </div>;
}

/** The consent line on a case: who signed and when, or a button to hand the device to the patient. */
export function ConsentStatus({ consent, patientName, caseLabel, onSave }: {
  consent?: CaseConsent;
  patientName: string;
  caseLabel: string;
  onSave: (consent: CaseConsent | null) => Promise<void>;
}) {
  const [open, setOpen] = useState<"sign" | "view" | null>(null);
  return <div className="cs-status">
    {consent ? <button type="button" className="cs-status-row signed" onClick={() => setOpen("view")}>
      <span className="cs-status-mark"><Check size={14} /></span>
      <span><b>Consent signed</b><small>{consent.patientName} · {new Date(consent.signedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{features.labExport && !consent.agreed.lab ? " · not for labs" : ""}</small></span>
    </button> : <button type="button" className="cs-status-row" onClick={() => setOpen("sign")}>
      <span className="cs-status-mark"><FileSignature size={14} /></span>
      <span><b>Record patient consent</b><small>Hand the device to the patient to read and sign</small></span>
    </button>}
    {open === "sign" && <ConsentSheet patientName={patientName} onCancel={() => setOpen(null)} onSigned={c => onSave(c)} />}
    {open === "view" && consent && <ConsentView consent={consent} caseLabel={caseLabel} onClose={() => setOpen(null)}
      onRemove={async () => { await onSave(null); setOpen(null); }} />}
  </div>;
}
