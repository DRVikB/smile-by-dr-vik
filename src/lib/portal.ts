import { features } from "@/config/features";
/**
 * The web portal's case details: a name or initials, the practice reference, status, notes and the
 * clinical photo set. They sync with the case (state.portal); photos become CLINICAL_PHOTO assets.
 */
export const PHOTO_SLOTS = [
  { id: "front", label: "Smile front", short: "Front" },
  { id: "right", label: "Smile right", short: "Right" },
  { id: "left", label: "Smile left", short: "Left" },
  // "retracted" is the original id, kept so earlier photo sets still load.
  { id: "retracted", label: "Retracted front", short: "Retr. front" },
  { id: "retractedRight", label: "Retracted right", short: "Retr. right" },
  { id: "retractedLeft", label: "Retracted left", short: "Retr. left" },
  { id: "upper", label: "Upper arch", short: "Upper" },
  { id: "lower", label: "Lower arch", short: "Lower" },
] as const;
export const MAX_PHOTOS = PHOTO_SLOTS.length;
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
  updatedAt?: number;
}

/** A patch: a photo set to null is removed; `swap` exchanges two slots (photos and previews). */
export type PortalPatch = Omit<PortalDetails, "photos" | "thumbs" | "consent"> & {
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
  if (patch.tags !== undefined) next.tags = cleanTags(patch.tags);
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
