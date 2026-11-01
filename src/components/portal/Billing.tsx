"use client";
import { useMemo, useState } from "react";
import { Ban, Check, Download, FileText, Pencil, Plus, ReceiptText, Send, Settings2, Trash2, X } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { AGREED_STAGES, caseTitle, stageOf, type CaseEvent, type CaseInvoice, type InvoiceItem, type PortalPatch } from "@/lib/portal";
import {
  DAY, INVOICE_STATE_LABEL, gbp, invoicePdf, invoiceState, invoiceTotal, invoicesCsv, readBillingDetails, saveBillingDetails,
  shortDate, startOfDay, type BillingDetails, type InvoiceRow, type InvoiceState,
} from "@/lib/billing";
import { saveFile } from "@/lib/share";
import type { PortalCaseCard } from "./portalData";

const METHODS = ["Card", "Bank transfer", "Cash", "Finance", "Other"];
const fileName = (s: string) => s.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export function InvoicePill({ invoice }: { invoice: CaseInvoice }) {
  const state = invoiceState(invoice);
  return <span className={`pt-inv-pill ${state}`}>{INVOICE_STATE_LABEL[state]}</span>;
}

/** Download one invoice as a PDF, with the practice's billing details. */
export async function downloadInvoice(invoice: CaseInvoice, patient: string, reference: string, userId: string | null | undefined) {
  const blob = await invoicePdf(invoice, patient, reference, readBillingDetails(userId));
  await saveFile(blob, `${fileName(`${invoice.number} ${patient || reference}`)}.pdf`, `Invoice ${invoice.number}`);
}

/** The changes for one invoice action: the new list plus the line for the case's timeline. */
function withInvoice(invoices: CaseInvoice[], next: CaseInvoice, event?: Omit<CaseEvent, "at">): PortalPatch {
  const list = invoices.some(i => i.id === next.id) ? invoices.map(i => i.id === next.id ? next : i) : [...invoices, next];
  return { invoices: list, ...(event ? { event } : {}) };
}

/* ------------------------------------------------------------------ Invoice editor */

function InvoiceForm({ initial, number, termsDays, onCancel, onSave, prefill }: {
  initial?: CaseInvoice; number: string; termsDays: number; prefill?: InvoiceItem[];
  onCancel: () => void; onSave: (invoice: CaseInvoice, issue: boolean) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [items, setItems] = useState<{ description: string; amount: string }[]>(
    (initial?.items ?? prefill ?? [{ description: "", amount: 0 }]).map(i => ({ description: i.description, amount: i.amount ? String(i.amount) : "" })));
  const [issued, setIssued] = useState(initial ? new Date(initial.issuedAt).toISOString().slice(0, 10) : today);
  const [due, setDue] = useState(initial ? new Date(initial.dueAt).toISOString().slice(0, 10) : new Date(Date.now() + termsDays * DAY).toISOString().slice(0, 10));
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState("");
  const parsed = items.map(i => ({ description: i.description.trim(), amount: Math.round(Number(i.amount.replace(/[£,\s]/g, "")) * 100) / 100 }));
  const total = parsed.reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0);
  const submit = (issue: boolean) => {
    const lines = parsed.filter(i => i.description || i.amount);
    if (!lines.length) { setError("Add at least one line."); return; }
    if (lines.some(i => !Number.isFinite(i.amount) || i.amount < 0)) { setError("Check the amounts: numbers only, like 450 or 1200.50."); return; }
    const issuedAt = Date.parse(`${issued}T12:00:00`), dueAt = Date.parse(`${due}T12:00:00`);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(dueAt)) { setError("Choose the issue and due dates."); return; }
    onSave({ ...(initial ?? { id: crypto.randomUUID(), number, status: "draft" as const }), items: lines, issuedAt, dueAt: Math.max(dueAt, issuedAt), note: note.trim() || undefined,
      status: issue ? "sent" : initial?.status ?? "draft" }, issue);
  };
  return <div className="pt-inv-editor">
    <div className="pt-row pt-between"><b>{initial ? `Edit ${initial.number}` : `New invoice · ${number}`}</b><button type="button" className="pt-icon-btn" aria-label="Close" onClick={onCancel}><X size={16} /></button></div>
    <div className="pt-inv-lines">
      {items.map((item, i) => <div key={i} className="pt-inv-line">
        <input value={item.description} maxLength={120} placeholder="e.g. Porcelain veneers, 8 upper teeth" aria-label="Description"
          onChange={e => setItems(list => list.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
        <label className="pt-money"><span>£</span><input inputMode="decimal" value={item.amount} placeholder="0" aria-label="Amount"
          onChange={e => setItems(list => list.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} /></label>
        {items.length > 1 && <button type="button" className="pt-icon-btn" aria-label="Remove line" onClick={() => setItems(list => list.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
      </div>)}
      {items.length < 12 && <button type="button" className="pt-link-btn" onClick={() => setItems(list => [...list, { description: "", amount: "" }])}><Plus size={14} />Add a line</button>}
    </div>
    <div className="pt-inv-dates">
      <label className="pt-field">Issued<input type="date" value={issued} onChange={e => setIssued(e.target.value)} /></label>
      <label className="pt-field">Due<input type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
    </div>
    <label className="pt-field">Note on the invoice<input value={note} maxLength={400} placeholder="Optional, e.g. Deposit to book your treatment" onChange={e => setNote(e.target.value)} /></label>
    <div className="pt-inv-total"><span>Total</span><b>{gbp(total)}</b></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="pt-row pt-end">
      {(!initial || initial.status === "draft") && <button type="button" className="pt-btn pt-btn-line pt-btn-small" onClick={() => submit(false)}>Save draft</button>}
      <button type="button" className="pt-btn pt-btn-dark pt-btn-small" onClick={() => submit(!initial || initial.status === "draft")}><Send size={14} />{!initial || initial.status === "draft" ? "Issue invoice" : "Save"}</button>
    </div>
  </div>;
}

function MarkPaid({ onPaid, onCancel }: { onPaid: (method: string, at: number) => void; onCancel: () => void }) {
  const [method, setMethod] = useState("Card");
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  return <div className="pt-paid-form">
    <select value={method} aria-label="Paid by" onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m}>{m}</option>)}</select>
    <input type="date" value={on} aria-label="Paid on" onChange={e => setOn(e.target.value)} />
    <button type="button" className="pt-btn pt-btn-gold pt-btn-small" onClick={() => onPaid(method, Date.parse(`${on}T12:00:00`) || Date.now())}><Check size={14} />Paid</button>
    <button type="button" className="pt-icon-btn" aria-label="Cancel" onClick={onCancel}><X size={15} /></button>
  </div>;
}

/* ------------------------------------------------------------------ One case's billing (case page tab) */

export function CaseBilling({ invoices, fee, feeNote, patient, reference, stage, nextNumber, onSave }: {
  invoices: CaseInvoice[]; fee?: number; feeNote?: string; patient: string; reference: string; stage: string | null;
  /** The next invoice number across the account (looked up when a new invoice starts). */
  nextNumber: () => Promise<string>;
  onSave: (patch: PortalPatch, label: string) => void;
}) {
  const account = useAccount();
  const [editing, setEditing] = useState<{ invoice?: CaseInvoice; number: string; prefill?: InvoiceItem[] } | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [feeText, setFeeText] = useState(fee !== undefined ? String(fee) : "");
  const [noteText, setNoteText] = useState(feeNote ?? "");
  const [busy, setBusy] = useState("");
  const terms = readBillingDetails(account.user?.id).termsDays;
  const live = invoices.filter(i => i.status !== "void");
  const invoiced = live.filter(i => i.status !== "draft").reduce((s, i) => s + invoiceTotal(i), 0);
  const paid = live.filter(i => i.status === "paid").reduce((s, i) => s + invoiceTotal(i), 0);
  const balance = Math.max(0, invoiced - paid);
  const toInvoice = fee !== undefined ? Math.max(0, fee - invoiced) : 0;

  const saveFee = () => {
    const amount = feeText.trim() ? Number(feeText.replace(/[£,\s]/g, "")) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return;
    if (amount === (fee ?? null) && noteText.trim() === (feeNote ?? "")) return;
    onSave({ fee: amount, feeNote: noteText }, "Estimate saved");
  };
  const start = async (prefill?: InvoiceItem[]) => setEditing({ number: await nextNumber(), prefill });
  const sorted = [...invoices].sort((a, b) => b.issuedAt - a.issuedAt);

  return <div className="pt-billing">
    <p className="pt-sec">Estimate</p>
    <div className="pt-fee-row">
      <label className="pt-money big"><span>£</span><input inputMode="decimal" value={feeText} placeholder="0" aria-label="Estimated fee" onChange={e => setFeeText(e.target.value)} onBlur={saveFee} /></label>
      <input className="pt-fee-note" value={noteText} maxLength={120} placeholder="What it covers, e.g. 8 porcelain veneers" aria-label="What the estimate covers" onChange={e => setNoteText(e.target.value)} onBlur={saveFee} />
    </div>
    <p className="pt-hint">Used for the pipeline and Insights totals. {stage && (AGREED_STAGES as readonly string[]).includes(stage) ? "This case is counted as agreed." : "It counts as agreed once the case moves to Going ahead."}</p>

    <div className="pt-bill-sum">
      <div><small>Invoiced</small><b>{gbp(invoiced)}</b></div>
      <div><small>Paid</small><b className="ok">{gbp(paid)}</b></div>
      <div><small>Balance</small><b className={balance ? "due" : ""}>{gbp(balance)}</b></div>
    </div>

    <div className="pt-row pt-between pt-gap-t"><p className="pt-sec flush">Invoices</p>
      {!editing && <div className="pt-row">
        {toInvoice > 0 && fee !== undefined && <button type="button" className="pt-btn pt-btn-line pt-btn-small" onClick={() => void start([{ description: `Deposit${noteText ? ` · ${noteText}` : ""}`, amount: Math.round(toInvoice * 0.25) }])}>Deposit</button>}
        <button type="button" className="pt-btn pt-btn-dark pt-btn-small" onClick={() => void start(toInvoice > 0 ? [{ description: noteText || "Treatment", amount: toInvoice }] : undefined)}><Plus size={14} />New invoice</button>
      </div>}
    </div>
    {editing && <InvoiceForm initial={editing.invoice} number={editing.number} prefill={editing.prefill} termsDays={terms} onCancel={() => setEditing(null)}
      onSave={(invoice, issue) => {
        const isNew = !invoices.some(i => i.id === invoice.id);
        onSave(withInvoice(invoices, invoice, issue ? { kind: "invoice", text: `Invoice ${invoice.number} issued · ${gbp(invoiceTotal(invoice))}` } : undefined), isNew ? (issue ? "Invoice issued" : "Draft saved") : "Invoice saved");
        setEditing(null);
      }} />}
    {sorted.length ? <ul className="pt-inv-list">{sorted.map(inv => <li key={inv.id}>
      <div className="pt-inv-main">
        <span className="pt-inv-icon"><ReceiptText size={16} /></span>
        <div><b>{inv.number}</b><small>{inv.items.map(i => i.description).filter(Boolean).join(" · ") || "Invoice"}</small>
          <small>{inv.status === "paid" && inv.paidAt ? `Paid ${shortDate(inv.paidAt)}${inv.method ? ` · ${inv.method}` : ""}` : inv.status === "draft" ? "Not issued yet" : `Issued ${shortDate(inv.issuedAt)} · due ${shortDate(inv.dueAt)}`}</small></div>
        <div className="pt-inv-amt"><b>{gbp(invoiceTotal(inv))}</b><InvoicePill invoice={inv} /></div>
      </div>
      {paying === inv.id ? <MarkPaid onCancel={() => setPaying(null)} onPaid={(method, at) => {
        onSave(withInvoice(invoices, { ...inv, status: "paid", paidAt: at, method }, { kind: "payment", text: `${inv.number} paid · ${gbp(invoiceTotal(inv))} by ${method.toLowerCase()}` }), "Marked as paid");
        setPaying(null);
      }} /> : <div className="pt-inv-actions">
        {inv.status === "draft" && <button type="button" onClick={() => onSave(withInvoice(invoices, { ...inv, status: "sent" }, { kind: "invoice", text: `Invoice ${inv.number} issued · ${gbp(invoiceTotal(inv))}` }), "Invoice issued")}><Send size={13} />Issue</button>}
        {inv.status === "sent" && <button type="button" onClick={() => setPaying(inv.id)}><Check size={13} />Mark paid</button>}
        {inv.status !== "void" && <button type="button" onClick={() => setEditing({ invoice: inv, number: inv.number })}><Pencil size={13} />Edit</button>}
        {inv.status !== "draft" && <button type="button" disabled={busy === inv.id} onClick={async () => { setBusy(inv.id); try { await downloadInvoice(inv, patient, reference, account.user?.id); } finally { setBusy(""); } }}><Download size={13} />PDF</button>}
        {inv.status === "paid" && <button type="button" onClick={() => onSave(withInvoice(invoices, { ...inv, status: "sent", paidAt: undefined, method: undefined }), "Marked as unpaid")}>Undo paid</button>}
        {(inv.status === "sent") && <button type="button" onClick={() => onSave(withInvoice(invoices, { ...inv, status: "void" }, { kind: "invoice", text: `Invoice ${inv.number} voided` }), "Invoice voided")}><Ban size={13} />Void</button>}
        {inv.status === "draft" && <button type="button" className="danger" onClick={() => onSave({ invoices: invoices.filter(i => i.id !== inv.id) }, "Draft deleted")}><Trash2 size={13} />Delete</button>}
      </div>}
    </li>)}</ul> : !editing && <p className="pt-hint">No invoices yet. Add an estimate above, then raise a deposit or a full invoice from it.</p>}
  </div>;
}

/* ------------------------------------------------------------------ Billing details */

function BillingDetailsForm({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  const [d, setD] = useState<BillingDetails>(() => readBillingDetails(account.user?.id));
  const set = (patch: Partial<BillingDetails>) => setD(x => ({ ...x, ...patch }));
  return <div className="pt-card pt-pad pt-billing-details">
    <div className="pt-row pt-between"><h2 className="pt-h2 flush">Invoice details</h2><button type="button" className="pt-icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
    <p className="pt-hint">Printed on every invoice. Saved on this device.</p>
    <div className="pt-two-fields">
      <label className="pt-field">Practice name<input value={d.practiceName} maxLength={80} onChange={e => set({ practiceName: e.target.value })} placeholder="e.g. Harley Street Smile Studio" /></label>
      <label className="pt-field">Payment due after (days)<input type="number" min={0} max={120} value={d.termsDays} onChange={e => set({ termsDays: Math.min(120, Math.max(0, Number(e.target.value) || 0)) })} /></label>
    </div>
    <label className="pt-field">Address<textarea rows={3} value={d.address} maxLength={300} onChange={e => set({ address: e.target.value })} /></label>
    <label className="pt-field">Phone and email<input value={d.contact} maxLength={160} onChange={e => set({ contact: e.target.value })} /></label>
    <label className="pt-field">How to pay<textarea rows={2} value={d.paymentNote} maxLength={300} placeholder="e.g. Bank transfer to Smile Studio Ltd, sort code 00-00-00, account 00000000. Card payments at reception." onChange={e => set({ paymentNote: e.target.value })} /></label>
    <div className="pt-row pt-end"><button type="button" className="pt-btn pt-btn-dark" onClick={() => { saveBillingDetails(account.user?.id, d); onClose(); }}>Save details</button></div>
  </div>;
}

/* ------------------------------------------------------------------ All cases */

type BillFilter = "all" | "unpaid" | "overdue" | "paid" | "draft";

export function BillingView({ cases, onOpenCase, update }: {
  cases: PortalCaseCard[] | null;
  onOpenCase: (id: string) => void;
  update: (caseId: string, patch: PortalPatch) => Promise<void>;
}) {
  const account = useAccount();
  const [filter, setFilter] = useState<BillFilter>("all");
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [error, setError] = useState("");
  const now = Date.now();
  const rows: (InvoiceRow & { card: PortalCaseCard })[] = useMemo(() => (cases ?? []).flatMap(card => card.invoices.map(invoice => ({
    invoice, card, caseId: card.id, patient: caseTitle(card.name, card.reference, card.createdAt), reference: card.reference,
  }))).sort((a, b) => b.invoice.issuedAt - a.invoice.issuedAt), [cases]);
  const sumOf = (list: typeof rows) => list.reduce((s, r) => s + invoiceTotal(r.invoice), 0);
  const unpaid = rows.filter(r => ["sent", "overdue"].includes(invoiceState(r.invoice, now)));
  const overdue = rows.filter(r => invoiceState(r.invoice, now) === "overdue");
  const monthStart = startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime());
  const paidMonth = rows.filter(r => r.invoice.status === "paid" && (r.invoice.paidAt ?? 0) >= monthStart);
  const notInvoiced = (cases ?? []).filter(c => !c.archived && (AGREED_STAGES as readonly string[]).includes(stageOf(c.labels) ?? "") && c.fee)
    .reduce((s, c) => s + Math.max(0, (c.fee ?? 0) - c.invoices.filter(i => i.status === "sent" || i.status === "paid").reduce((t, i) => t + invoiceTotal(i), 0)), 0);
  const match = (state: InvoiceState) => filter === "all" ? true : filter === "unpaid" ? state === "sent" || state === "overdue" : state === filter;
  const q = query.trim().toLowerCase();
  const shown = rows.filter(r => match(invoiceState(r.invoice, now)) && (!q || `${r.patient} ${r.reference} ${r.invoice.number}`.toLowerCase().includes(q)));
  const filters: [BillFilter, string, number][] = [["all", "All", rows.length], ["unpaid", "Unpaid", unpaid.length], ["overdue", "Overdue", overdue.length], ["paid", "Paid", rows.filter(r => r.invoice.status === "paid").length], ["draft", "Drafts", rows.filter(r => r.invoice.status === "draft").length]];

  const markPaid = async (r: typeof rows[number], method: string, at: number) => {
    setError("");
    try { await update(r.caseId, withInvoice(r.card.invoices, { ...r.invoice, status: "paid", paidAt: at, method }, { kind: "payment", text: `${r.invoice.number} paid · ${gbp(invoiceTotal(r.invoice))} by ${method.toLowerCase()}` })); }
    catch { setError("That invoice couldn’t be updated. Check your connection and try again."); }
    setPaying(null);
  };

  return <section className="pt-view">
    <div className="pt-row pt-between">
      <div><h1 className="pt-h1">Billing</h1><p className="pt-sub">Invoices across every case. Open a case to raise a new one from its estimate.</p></div>
      <div className="pt-row">
        <button type="button" className="pt-btn pt-btn-line" onClick={() => setDetails(d => !d)}><Settings2 size={16} />Invoice details</button>
        <button type="button" className="pt-btn pt-btn-line" disabled={!shown.length} onClick={() => void saveFile(invoicesCsv(shown), `invoices-${new Date().toISOString().slice(0, 10)}.csv`, "Invoices")}><FileText size={16} />Export CSV</button>
      </div>
    </div>
    {details && <BillingDetailsForm onClose={() => setDetails(false)} />}
    <div className="pt-stats pt-stats-money" role="group" aria-label="Billing summary">
      <button type="button" className={`pt-stat${filter === "unpaid" ? " on" : ""}`} onClick={() => setFilter(filter === "unpaid" ? "all" : "unpaid")}><small>Outstanding</small><b>{gbp(sumOf(unpaid))}</b><span>{unpaid.length} unpaid invoice{unpaid.length === 1 ? "" : "s"}</span></button>
      <button type="button" className={`pt-stat${filter === "overdue" ? " on" : ""}${overdue.length ? " warn" : ""}`} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}><small>Overdue</small><b>{gbp(sumOf(overdue))}</b><span>{overdue.length ? `${overdue.length} past the due date` : "Nothing overdue"}</span></button>
      <button type="button" className={`pt-stat${filter === "paid" ? " on" : ""}`} onClick={() => setFilter(filter === "paid" ? "all" : "paid")}><small>Paid this month</small><b>{gbp(sumOf(paidMonth))}</b><span>{paidMonth.length} payment{paidMonth.length === 1 ? "" : "s"}</span></button>
      <div className="pt-stat"><small>Agreed, not invoiced</small><b>{gbp(notInvoiced)}</b><span>Estimates on cases going ahead</span></div>
    </div>
    <div className="pt-row pt-between pt-gap-b pt-wrap">
      <div className="pt-filters">{filters.map(([key, label, n]) => <button key={key} className={`pt-chip${filter === key ? " on" : ""}`} onClick={() => setFilter(key)}>{label}{n ? <span className="pt-chip-n">{n}</span> : null}</button>)}</div>
      <input className="pt-mini-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a patient or invoice" aria-label="Find an invoice" />
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="pt-card pt-table-wrap">
      {cases === null ? <p className="pt-hint pt-pad">Loading invoices…</p> : shown.length ? <table className="pt-table pt-bill-table">
        <thead><tr><th>Invoice</th><th>Patient</th><th>Issued</th><th>Due</th><th className="r">Amount</th><th>Status</th><th aria-label="Actions" /></tr></thead>
        <tbody>{shown.map(r => <tr key={r.invoice.id}>
          <td><b>{r.invoice.number}</b>{r.card.archived && <small className="pt-hint"> · archived case</small>}</td>
          <td><button type="button" className="pt-link" onClick={() => onOpenCase(r.caseId)}>{r.patient}</button>{r.reference && r.reference !== r.patient && <small className="pt-ref"> {r.reference}</small>}</td>
          <td className="pt-ref">{shortDate(r.invoice.issuedAt)}</td>
          <td className="pt-ref">{r.invoice.status === "paid" && r.invoice.paidAt ? `Paid ${shortDate(r.invoice.paidAt)}` : shortDate(r.invoice.dueAt)}</td>
          <td className="r"><b>{gbp(invoiceTotal(r.invoice))}</b></td>
          <td><InvoicePill invoice={r.invoice} /></td>
          <td className="r">{paying === r.invoice.id ? <MarkPaid onCancel={() => setPaying(null)} onPaid={(m, at) => void markPaid(r, m, at)} />
            : <div className="pt-inv-actions end">
              {r.invoice.status === "sent" && <button type="button" onClick={() => setPaying(r.invoice.id)}><Check size={13} />Mark paid</button>}
              {r.invoice.status !== "draft" && <button type="button" onClick={() => void downloadInvoice(r.invoice, r.patient, r.reference, account.user?.id)}><Download size={13} />PDF</button>}
            </div>}</td>
        </tr>)}</tbody></table>
        : <div className="pt-pad pt-empty-bill"><ReceiptText size={26} strokeWidth={1.5} /><p>{rows.length ? "No invoices match this filter." : "No invoices yet. Open a case and use its Billing tab to add an estimate and raise an invoice."}</p></div>}
    </div>
  </section>;
}
