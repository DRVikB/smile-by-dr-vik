import { features } from "@/config/features";
/**
 * The web portal's case details: a name or initials, the practice reference, status, notes and the
 * clinical photo set. They sync with the case (state.portal); photos become CLINICAL_PHOTO assets.
 */
export const PHOTO_SLOTS = [
  // The guided photo set, in the order it is taken. Ids are kept from the earlier set, so saved photos stay
  // where they were: "front" (the smile front, and the design photo) is Smiling; "retracted" is Front teeth.
  { id: "profile", label: "Profile", short: "Profile", group: "face" },
  { id: "rest", label: "At rest", short: "At rest", group: "face" },
  { id: "front", label: "Smiling", short: "Smiling", group: "face" },
  { id: "smile", label: "Smile close-up", short: "Close-up", group: "smile" },
  { id: "retractedRight", label: "Right side", short: "Right", group: "teeth" },
  { id: "retracted", label: "Front teeth", short: "Front", group: "teeth" },
  { id: "retractedLeft", label: "Left side", short: "Left", group: "teeth" },
  { id: "upper", label: "Upper arch", short: "Upper", group: "arches" },
  { id: "lower", label: "Lower arch", short: "Lower", group: "arches" },
  // From the earlier set (three-quarter smiles): kept, and shown under Other photos when present.
  { id: "right", label: "Smile right", short: "Smile R", group: "other" },
  { id: "left", label: "Smile left", short: "Smile L", group: "other" },
] as const;
/** The views of the guided set (Other photos are extra). */
export const PHOTO_SET_VIEWS = PHOTO_SLOTS.filter(s => s.group !== "other");
export const MAX_PHOTOS = PHOTO_SET_VIEWS.length;
export type PhotoSlot = typeof PHOTO_SLOTS[number]["id"];
export const CASE_STATUSES = [
  { id: "progress", label: "In progress" },
  { id: "lab", label: "With lab" },
  { id: "done", label: "Completed" },
] as const;
export type CaseStatus = typeof CASE_STATUSES[number]["id"];
/** The statuses offered to the clinician: "With lab" only once Labs ship. A saved "lab" status still reads correctly. */
export const SHOWN_CASE_STATUSES = CASE_STATUSES.filter(s => s.id !== "lab" || features.labExport);
/**
 * The patient's consent for this case, signed on the device. A template for the practice's own legal review;
 * the version changes whenever the wording does, so each record shows exactly what was agreed.
 */
/** v2: the lab-sharing statement is left out while Labs are hidden (v1 offered it). */
export const CONSENT_VERSION = features.labExport ? "2026-10-consent-v1" : "2026-10-consent-v2";
export const CONSENT_ITEMS = [
  { id: "photos", required: true, text: "My dentist may take photographs of my face and teeth and use them to plan and discuss my treatment." },
  { id: "concept", required: true, text: "I understand the smile design is a computer-generated visualisation to help us discuss options. It is not a guarantee of how my teeth will look after treatment." },
  { id: "lab", required: false, text: "My photographs and smile design may be shared securely with a dental laboratory making my treatment." },
  { id: "library", required: false, text: "If I go ahead, photos of my finished smile may be kept privately by my dentist as a reference for future designs." },
  { id: "marketing", required: false, text: "Photos of my smile may be used in the practice’s marketing, such as its website or social media." },
] as const;
export type ConsentItem = typeof CONSENT_ITEMS[number]["id"];
/** The statements the patient is asked to agree to (and that a signed record lists). */
export const SHOWN_CONSENT_ITEMS = CONSENT_ITEMS.filter(i => i.id !== "lab" || features.labExport);
export interface CaseConsent {
  version: string;
  signedAt: number;
  patientName: string;
  agreed: Record<ConsentItem, boolean>;
  /** The patient's signature, a small PNG (an asset reference once synced). */
  signature: string;
}
export function validConsent(value: unknown): value is CaseConsent {
  const c = value as CaseConsent | null;
  return Boolean(c && typeof c === "object" && typeof c.version === "string" && Number.isFinite(c.signedAt) && typeof c.patientName === "string"
    && c.agreed && CONSENT_ITEMS.every(i => typeof c.agreed[i.id] === "boolean" && (!i.required || c.agreed[i.id])) && typeof c.signature === "string" && c.signature.length > 0);
}

/** Ready-made case tags; clinicians can add their own too. */
export const CASE_TAGS = ["Consultation", "Thinking it over", "Going ahead", "Treatment booked", "In treatment", "Follow-up", "Not proceeding"] as const;
export const MAX_TAGS = 8;
const TAG_MAX = 24;
/** One tidy tag: trimmed, single spaces, at most 24 characters, first letter capitalised. */
export function cleanTag(value: string): string {
  const tag = value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, TAG_MAX);
  return tag ? tag[0]!.toUpperCase() + tag.slice(1) : "";
}
/** Unique (ignoring case), cleaned, at most MAX_TAGS. */
export function cleanTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const tag = cleanTag(value);
    if (tag && !out.some(t => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** A case's place in the pipeline: its furthest stage tag. "Not proceeding" wins, as it closes the case. */
export function stageOf(labels: readonly string[] | undefined): string | null {
  if (!labels?.length) return null;
  if (labels.includes("Not proceeding")) return "Not proceeding";
  const found = (CASE_TAGS as readonly string[]).filter(t => t !== "Follow-up" && t !== "Not proceeding" && labels.includes(t));
  return found.length ? found[found.length - 1]! : null;
}
/** Stages where the patient has said yes. */
export const AGREED_STAGES = ["Going ahead", "Treatment booked", "In treatment"] as const;

/* ---- Billing: an estimate and invoices per case (amounts in pounds, to the penny). ---- */
export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];
export interface InvoiceItem { description: string; amount: number }
export interface CaseInvoice {
  id: string;
  /** "INV-0007": numbered across the account. */
  number: string;
  issuedAt: number;
  dueAt: number;
  items: InvoiceItem[];
  status: InvoiceStatus;
  paidAt?: number;
  /** How it was paid: card, bank transfer, cash, finance… */
  method?: string;
  note?: string;
}
/** Something that happened on a case, for its timeline. Photos, consent, concepts and exports come from the case itself. */
export interface CaseEvent { at: number; kind: "stage" | "call" | "invoice" | "payment" | "appointment"; text: string }
export interface CaseAppointment { at: number; type: string }
export const MAX_INVOICES = 40;
export const MAX_HISTORY = 60;
export const MAX_FEE = 1_000_000;

export interface PortalDetails {
  name?: string;
  reference?: string;
  status?: CaseStatus;
  notes?: string;
  /** Where the case is with the patient: "Consultation", "Going ahead", or the clinician's own. */
  tags?: string[];
  /** The patient's signed consent, when recorded. */
  consent?: CaseConsent;
  /** Data URLs on the device; asset references once synced. The design photo stays with the draft. */
  photos?: Partial<Record<PhotoSlot, string>>;
  /** A small preview of each photo (about 360 px), so lists and the app show the set without downloading full photos. */
  thumbs?: Partial<Record<PhotoSlot, string>>;
  /** The estimated treatment fee, in pounds. */
  fee?: number;
  /** What the estimate covers, e.g. "8 porcelain veneers". */
  feeNote?: string;
  invoices?: CaseInvoice[];
  /** The next appointment with the patient. */
  appointment?: CaseAppointment;
  history?: CaseEvent[];
  /** When the case last moved stage (days in stage). */
  stageAt?: number;
  updatedAt?: number;
}

/** A patch: a photo set to null is removed; `swap` exchanges two slots (photos and previews). */
export type PortalPatch = Omit<PortalDetails, "photos" | "thumbs" | "consent" | "fee" | "appointment" | "history" | "stageAt"> & {
  fee?: number | null;
  appointment?: CaseAppointment | null;
  /** Added to the case's timeline. */
  event?: Omit<CaseEvent, "at"> & { at?: number };
  /** A new signed consent (or null to remove a mistaken one). */
  consent?: CaseConsent | null;
  photos?: Partial<Record<PhotoSlot, string | null>>;
  thumbs?: Partial<Record<PhotoSlot, string | null>>;
  swap?: [PhotoSlot, PhotoSlot];
};

const clean = (value: string, max: number) => value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const cleanName = (value: string) => clean(value, 60);
export const cleanReference = (value: string) => clean(value, 40);
export const cleanNotes = (value: string) => value.normalize("NFC").replace(/[\p{Cf}]/gu, "").slice(0, 2000);
/** Text the sync store accepts: no control characters, and never something that reads as a link or file (the store refuses those). */
const plain = (value: unknown, max: number) => typeof value === "string" ? clean(value, max).replace(/^(data|blob|https?):\/*/i, "") : "";
const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(MAX_FEE, Math.max(0, value)) * 100) / 100 : null;
const time = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
export function cleanInvoice(value: unknown): CaseInvoice | null {
  const v = value as Partial<CaseInvoice> | null;
  if (!v || typeof v !== "object") return null;
  const id = plain(v.id, 64), number = plain(v.number, 24), issuedAt = time(v.issuedAt), dueAt = time(v.dueAt);
  if (!id || !number || !issuedAt) return null;
  const items = (Array.isArray(v.items) ? v.items : []).slice(0, 12).map(i => ({ description: plain(i?.description, 120), amount: money(i?.amount) ?? 0 })).filter(i => i.description || i.amount);
  const status = (INVOICE_STATUSES as readonly string[]).includes(v.status as string) ? v.status as InvoiceStatus : "draft";
  const out: CaseInvoice = { id, number, issuedAt, dueAt: dueAt ?? issuedAt, items, status };
  if (status === "paid") out.paidAt = time(v.paidAt) ?? Date.now();
  const method = plain(v.method, 40); if (method) out.method = method;
  const note = plain(v.note, 400); if (note) out.note = note;
  return out;
}
export function cleanEvent(value: unknown): CaseEvent | null {
  const v = value as Partial<CaseEvent> | null;
  const kinds = ["stage", "call", "invoice", "payment", "appointment"];
  if (!v || !kinds.includes(v.kind as string)) return null;
  const text = plain(v.text, 200);
  return text ? { at: time(v.at) ?? Date.now(), kind: v.kind as CaseEvent["kind"], text } : null;
}
export function cleanAppointment(value: unknown): CaseAppointment | null {
  const v = value as Partial<CaseAppointment> | null;
  const at = time(v?.at);
  return at ? { at, type: plain(v?.type, 40) || "Appointment" } : null;
}
export const invoiceTotal = (invoice: Pick<CaseInvoice, "items">) => Math.round(invoice.items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
/** Read billing fields from stored case details (anything malformed is dropped). */
export function readBilling(raw: Record<string, unknown>): Pick<PortalDetails, "fee" | "feeNote" | "invoices" | "appointment" | "history" | "stageAt"> {
  const out: Pick<PortalDetails, "fee" | "feeNote" | "invoices" | "appointment" | "history" | "stageAt"> = {};
  const fee = money(raw.fee); if (fee !== null) out.fee = fee;
  const feeNote = plain(raw.feeNote, 120); if (feeNote) out.feeNote = feeNote;
  if (Array.isArray(raw.invoices)) out.invoices = raw.invoices.map(cleanInvoice).filter((i): i is CaseInvoice => Boolean(i));
  const appointment = cleanAppointment(raw.appointment); if (appointment) out.appointment = appointment;
  if (Array.isArray(raw.history)) out.history = raw.history.map(cleanEvent).filter((e): e is CaseEvent => Boolean(e));
  const stageAt = time(raw.stageAt); if (stageAt) out.stageAt = stageAt;
  return out;
}

export const isPhotoSlot = (value: unknown): value is PhotoSlot => PHOTO_SLOTS.some(s => s.id === value);
export const isCaseStatus = (value: unknown): value is CaseStatus => CASE_STATUSES.some(s => s.id === value);
export const statusLabel = (status: CaseStatus | undefined) => CASE_STATUSES.find(s => s.id === (status ?? "progress"))!.label;

/** Merge a patch into stored details. Photos keep whatever form they are in (data URL or asset ref). */
export function mergePortal<T>(current: Record<string, unknown> | null | undefined, patch: PortalPatch): Record<string, unknown> {
  const base = (current ?? {}) as Record<string, unknown>;
  const photos = { ...((base.photos as Record<string, T>) ?? {}) } as Record<string, unknown>;
  const thumbs = { ...((base.thumbs as Record<string, T>) ?? {}) } as Record<string, unknown>;
  const apply = (target: Record<string, unknown>, changes: Record<string, string | null | undefined> | undefined) => {
    for (const [slot, value] of Object.entries(changes ?? {})) {
      if (!isPhotoSlot(slot)) continue;
      if (value === null) delete target[slot]; else if (typeof value === "string" && value.startsWith("data:image/")) target[slot] = value;
    }
  };
  apply(photos, patch.photos);
  apply(thumbs, patch.thumbs);
  // A removed photo takes its preview with it.
  for (const slot of Object.keys(thumbs)) if (!(slot in photos)) delete thumbs[slot];
  if (patch.swap && isPhotoSlot(patch.swap[0]) && isPhotoSlot(patch.swap[1])) {
    const [a, b] = patch.swap;
    for (const target of [photos, thumbs]) {
      const x = target[a], y = target[b];
      if (y === undefined) delete target[a]; else target[a] = y;
      if (x === undefined) delete target[b]; else target[b] = x;
    }
  }
  const next: Record<string, unknown> = { ...base, photos, thumbs, updatedAt: Date.now() };
  if (patch.name !== undefined) next.name = cleanName(patch.name);
  if (patch.reference !== undefined) next.reference = cleanReference(patch.reference);
  if (patch.notes !== undefined) next.notes = cleanNotes(patch.notes);
  if (patch.status !== undefined && isCaseStatus(patch.status)) next.status = patch.status;
  const history = Array.isArray(base.history) ? (base.history as unknown[]).map(cleanEvent).filter((e): e is CaseEvent => Boolean(e)) : [];
  const log = (event: CaseEvent | null) => { if (event) history.push(event); };
  if (patch.tags !== undefined) {
    next.tags = cleanTags(patch.tags);
    // Moving stage is part of the case's story, and starts its "days in stage".
    const before = stageOf(cleanTags(base.tags)), after = stageOf(next.tags as string[]);
    if (before !== after) { next.stageAt = Date.now(); log(cleanEvent({ kind: "stage", text: after ? `Moved to ${after}` : "Stage cleared" })); }
  }
  if (patch.fee !== undefined) { const fee = money(patch.fee); if (fee === null || patch.fee === null) delete next.fee; else next.fee = fee; }
  if (patch.feeNote !== undefined) { const note = plain(patch.feeNote, 120); if (note) next.feeNote = note; else delete next.feeNote; }
  if (patch.appointment !== undefined) {
    const appointment = patch.appointment === null ? null : cleanAppointment(patch.appointment);
    if (appointment) next.appointment = appointment; else delete next.appointment;
  }
  if (patch.invoices !== undefined) next.invoices = patch.invoices.map(cleanInvoice).filter((i): i is CaseInvoice => Boolean(i)).slice(-MAX_INVOICES);
  if (patch.event) log(cleanEvent(patch.event));
  if (history.length) next.history = history.sort((a, b) => a.at - b.at).slice(-MAX_HISTORY);
  if (patch.consent === null) delete next.consent;
  else if (patch.consent && validConsent(patch.consent)) next.consent = { ...patch.consent, patientName: cleanName(patch.consent.patientName) };
  return next;
}

/** A case's display name: its name, else its reference, else when it was started ("Case from 7 Oct"). */
export function caseTitle(name: string | undefined, reference: string | undefined, createdAt: number): string {
  if (name?.trim()) return name.trim();
  if (reference?.trim()) return reference.trim();
  return `Case from ${new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/** Initials for a case card: "Sophie R." → "SR". */
export function initialsOf(name: string): string {
  return name.split(/[\s.]+/).filter(Boolean).map(part => part[0]!.toUpperCase()).join("").slice(0, 2) || "–";
}
