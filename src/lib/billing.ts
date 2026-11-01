import { invoiceTotal, type CaseInvoice } from "./portal";
import { jpegPagesToPdf } from "./pdf";
import { toBuffer } from "./smilePreview";

/** £1,234 or £1,234.50: pennies only when there are some. */
export function gbp(amount: number | undefined | null, opts: { compact?: boolean } = {}): string {
  const value = amount ?? 0;
  if (opts.compact && Math.abs(value) >= 10_000) return `£${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k`;
  return value.toLocaleString("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 });
}

export type InvoiceState = CaseInvoice["status"] | "overdue";
export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = { draft: "Draft", sent: "Unpaid", overdue: "Overdue", paid: "Paid", void: "Void" };

/** A sent invoice past its due date reads as overdue. */
export function invoiceState(invoice: CaseInvoice, now = Date.now()): InvoiceState {
  if (invoice.status === "sent" && invoice.dueAt < startOfDay(now)) return "overdue";
  return invoice.status;
}

export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const DAY = 86_400_000;
export const daysBetween = (from: number, to = Date.now()) => Math.max(0, Math.floor((startOfDay(to) - startOfDay(from)) / DAY));

/** The next number across every case on the account: INV-0001, INV-0002… */
export function nextInvoiceNumber(all: CaseInvoice[]): string {
  const highest = all.reduce((max, i) => Math.max(max, Number(/(\d+)\s*$/.exec(i.number)?.[1] ?? 0)), 0);
  return `INV-${String(highest + 1).padStart(4, "0")}`;
}

export { invoiceTotal };

export const shortDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
export const longDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/* ---- The practice's billing details: what goes at the top and bottom of an invoice. ---- */
export interface BillingDetails {
  practiceName: string;
  address: string;
  contact: string;
  /** Days from issue to due date. */
  termsDays: number;
  /** How to pay: bank details, card terminal, finance. */
  paymentNote: string;
}
export const DEFAULT_BILLING: BillingDetails = { practiceName: "", address: "", contact: "", termsDays: 14, paymentNote: "" };
const key = (userId: string | null | undefined) => `smilecompose.billing.${userId ?? "local"}`;
/** Kept on this device for now (they're the practice's details, not a patient's). */
export function readBillingDetails(userId: string | null | undefined): BillingDetails {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? "null") as Partial<BillingDetails> | null;
    if (!raw) return DEFAULT_BILLING;
    const text = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";
    const terms = Number(raw.termsDays);
    return { practiceName: text(raw.practiceName, 80), address: text(raw.address, 300), contact: text(raw.contact, 160),
      termsDays: Number.isFinite(terms) ? Math.min(120, Math.max(0, Math.round(terms))) : 14, paymentNote: text(raw.paymentNote, 300) };
  } catch { return DEFAULT_BILLING; }
}
export function saveBillingDetails(userId: string | null | undefined, details: BillingDetails) {
  try { localStorage.setItem(key(userId), JSON.stringify(details)); } catch { /* private mode: kept for this visit */ }
}

/* ---- Exports ---- */
export interface InvoiceRow { invoice: CaseInvoice; patient: string; reference: string; caseId: string }

const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
export function invoicesCsv(rows: InvoiceRow[]): Blob {
  const iso = (t?: number) => t ? new Date(t).toISOString().slice(0, 10) : "";
  const lines = [["Invoice", "Patient", "Case ref", "Issued", "Due", "Status", "Amount (GBP)", "Paid on", "Method"].join(",")];
  for (const { invoice, patient, reference } of rows) lines.push([invoice.number, patient, reference, iso(invoice.issuedAt), iso(invoice.dueAt),
    INVOICE_STATE_LABEL[invoiceState(invoice)], invoiceTotal(invoice).toFixed(2), iso(invoice.paidAt), invoice.method ?? ""].map(csvCell).join(","));
  return new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
}

const W = 1654, H = 2339, M = 150;
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** A one-page A4 invoice. No VAT line: the practice adds its own wording to the payment note if it needs one. */
export async function invoicePdf(invoice: CaseInvoice, patient: string, reference: string, practice: BillingDetails): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const sans = (weight: number, size: number) => `${weight} ${size}px -apple-system, Helvetica, Arial, sans-serif`;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";
  let y = M;
  ctx.font = sans(600, 46); ctx.fillStyle = "#1d1d1f";
  ctx.fillText(practice.practiceName || "Your practice", M, y);
  ctx.font = sans(400, 30); ctx.fillStyle = "#6e6e73";
  const left = [...wrap(ctx, practice.address, 700), ...wrap(ctx, practice.contact, 700)].filter(Boolean);
  left.forEach((l, i) => ctx.fillText(l, M, y + 70 + i * 42));
  ctx.textAlign = "right";
  ctx.font = "400 96px Georgia, serif"; ctx.fillStyle = "#1d1d1f";
  ctx.fillText("Invoice", W - M, y - 8);
  ctx.font = sans(400, 32); ctx.fillStyle = "#6e6e73";
  ctx.fillText(invoice.number, W - M, y + 104);
  ctx.textAlign = "left";
  y += Math.max(200, 90 + left.length * 42) + 60;

  ctx.strokeStyle = "#e5e5ea"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); y += 50;
  const label = (text: string, x: number) => { ctx.font = sans(600, 24); ctx.fillStyle = "#8a8a8e"; ctx.fillText(text.toUpperCase(), x, y); };
  const value = (text: string, x: number) => { ctx.font = sans(400, 34); ctx.fillStyle = "#1d1d1f"; ctx.fillText(text, x, y + 40); };
  label("Billed to", M); value(patient || "Patient", M);
  if (reference) { label("Case", M + 560); value(reference, M + 560); }
  label("Issued", M + 900); value(longDate(invoice.issuedAt), M + 900);
  y += 130;
  const paid = invoice.status === "paid" && invoice.paidAt;
  label(paid ? "Paid" : "Due", M + 900); value(paid ? `${longDate(invoice.paidAt!)}${invoice.method ? ` · ${invoice.method}` : ""}` : longDate(invoice.dueAt), M + 900);
  y += 150;

  ctx.font = sans(600, 24); ctx.fillStyle = "#8a8a8e";
  ctx.fillText("DESCRIPTION", M, y); ctx.textAlign = "right"; ctx.fillText("AMOUNT", W - M, y); ctx.textAlign = "left";
  y += 46; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); y += 30;
  for (const item of invoice.items) {
    ctx.font = sans(400, 34); ctx.fillStyle = "#1d1d1f";
    const lines = wrap(ctx, item.description || "Treatment", 1000);
    lines.forEach((l, i) => ctx.fillText(l, M, y + i * 46));
    ctx.textAlign = "right"; ctx.fillText(gbp(item.amount), W - M, y); ctx.textAlign = "left";
    y += lines.length * 46 + 34;
    ctx.beginPath(); ctx.moveTo(M, y - 14); ctx.lineTo(W - M, y - 14); ctx.stroke();
  }
  y += 30;
  ctx.font = sans(600, 30); ctx.fillStyle = "#6e6e73"; ctx.fillText("Total", W - M - 520, y + 12);
  ctx.textAlign = "right"; ctx.font = "400 72px Georgia, serif"; ctx.fillStyle = "#1d1d1f"; ctx.fillText(gbp(invoiceTotal(invoice)), W - M, y);
  ctx.textAlign = "left";
  y += 140;
  if (invoice.status === "paid") {
    ctx.save(); ctx.translate(M + 160, y + 40); ctx.rotate(-0.08);
    ctx.strokeStyle = "#2f7d4f"; ctx.lineWidth = 6; ctx.strokeRect(-150, -50, 300, 100);
    ctx.font = sans(700, 54); ctx.fillStyle = "#2f7d4f"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("PAID", 0, 2);
    ctx.restore(); ctx.textBaseline = "top"; y += 160;
  }
  if (invoice.note) { ctx.font = sans(400, 30); ctx.fillStyle = "#3a3a3c"; wrap(ctx, invoice.note, W - M * 2).forEach((l, i) => ctx.fillText(l, M, y + i * 42)); }

  // VAT wording is the practice's to add (in "How to pay"): not every treatment is exempt.
  const foot = practice.paymentNote;
  ctx.font = sans(400, 28); ctx.fillStyle = "#6e6e73";
  const footLines = wrap(ctx, foot, W - M * 2);
  footLines.forEach((l, i) => ctx.fillText(l, M, H - M - (footLines.length - i) * 40));
  const jpeg = await new Promise<Blob>((ok, fail) => canvas.toBlob(b => (b ? ok(b) : fail(new Error("The invoice PDF couldn’t be made."))), "image/jpeg", 0.92));
  const pdf = jpegPagesToPdf([{ jpeg: new Uint8Array(await jpeg.arrayBuffer()), widthPx: W, heightPx: H }], { title: `Invoice ${invoice.number}` });
  return new Blob([toBuffer(pdf)], { type: "application/pdf" });
}
