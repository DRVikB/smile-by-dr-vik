import { AI_CONSENT_VERSION } from "@/lib/aiConsent";

/**
 * Legal identity, contact and document versions — one place for the whole app,
 * the generated /privacy and /terms pages and the server.
 *
 * Business details are OWNER DECISIONS: set them via NEXT_PUBLIC_* at build
 * time. Until then the pages show clearly marked placeholders and
 * `npm run ios:release` / `npm run check:app-store` refuse to pass.
 * Nothing here is legal advice; the documents require professional review.
 */
const placeholder = (label: string) => `[${label} — OWNER DECISION REQUIRED]`;
const env = (value: string | undefined) => value?.trim() || "";

export const LEGAL_ENTITY = {
  name: env(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME),
  address: env(process.env.NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS),
  companyNumber: env(process.env.NEXT_PUBLIC_LEGAL_COMPANY_NUMBER),
  icoRegistration: env(process.env.NEXT_PUBLIC_ICO_REGISTRATION_NUMBER),
};

/** The one configurable privacy contact (PRIVACY_CONTACT_EMAIL). */
export const PRIVACY_CONTACT_EMAIL = env(process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL);

export function legalValue(value: string, label: string): string {
  return value || placeholder(label);
}

export function legalDetailsComplete(): boolean {
  return Boolean(LEGAL_ENTITY.name && LEGAL_ENTITY.address && PRIVACY_CONTACT_EMAIL);
}

/**
 * Document versions. Bump a version only when the document changes; users are
 * asked to accept Terms/Privacy again only when their accepted version differs.
 */
export const DOCUMENT_VERSIONS = {
  terms: "2026-09-27-draft",
  privacy: "2026-09-28b",
  upload_authority: "upload-authority-v1",
  ai_processing: AI_CONSENT_VERSION,
  case_library_authority: "case-library-authority-v1",
} as const;

/**
 * Shown once, before the first finished case is added to the Case Library.
 * A record of the clinician's confirmation, not patient consent and not AI training.
 */
export const CASE_LIBRARY_AUTHORITY_TEXT =
  "I confirm that I am authorised to use these images in SmileCompose for visualisation and style-reference purposes, and that they will be stored privately in my SmileCompose account and sent for AI processing as style references when I generate a design.";

/**
 * Set to true ONLY after a solicitor/DPO has reviewed and approved the
 * document text. Until then the pages carry a review banner and release
 * builds are blocked. Never set these as part of an automated change.
 */
export const LEGAL_REVIEW_COMPLETE = { privacy: false, terms: false } as const;

/**
 * Minor (under-18) patient media. LEGAL / DPIA DECISION REQUIRED.
 * Until decided, V1 is restricted to adult patients by default, stated in the
 * upload confirmation, the Terms and the privacy information.
 */
export const MINOR_PATIENTS_PERMITTED = false;

export const UPLOAD_AUTHORITY_TEXT = MINOR_PATIENTS_PERMITTED
  ? "I confirm that I am authorised to upload and process this patient’s information using SmileCompose and that the appropriate privacy information and lawful basis are in place."
  : "I confirm that I am authorised to upload and process this patient’s information using SmileCompose, that the appropriate privacy information and lawful basis are in place, and that the patient is aged 18 or over.";

export const CLINICAL_DISCLAIMER =
  "Concept visualisation only. Final clinical outcomes depend on diagnosis, treatment planning, biological factors and treatment performed.";
