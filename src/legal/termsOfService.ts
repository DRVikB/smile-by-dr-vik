import { CLINICAL_DISCLAIMER, DOCUMENT_VERSIONS, LEGAL_ENTITY, LEGAL_REVIEW_COMPLETE, MINOR_PATIENTS_PERMITTED, PRIVACY_CONTACT_EMAIL } from "@/config/legal";
import { escapeHtml, legalPage, required, valueOr } from "./layout";

/**
 * STRUCTURAL DRAFT ONLY — LEGAL REVIEW REQUIRED. Headings and factual product
 * descriptions only; warranties, liability, indemnities, governing law and
 * commercial terms are deliberately left as placeholders for a solicitor.
 */
export function termsOfServiceHtml(): string {
  const legal = (label: string) => required(`${label} — LEGAL REVIEW REQUIRED`);
  return legalPage("Terms of Service", "SmileCompose Terms of Service (draft).", `
<h1>Terms of Service</h1>
<p class="meta">Version ${escapeHtml(DOCUMENT_VERSIONS.terms)}</p>
${LEGAL_REVIEW_COMPLETE.terms ? "" : `<div class="draft" data-required>LEGAL REVIEW REQUIRED. This is a structural draft, not final terms. It must be completed and approved by a solicitor before commercial launch.</div>`}

<h2>1. About these terms</h2>
<p>These terms apply to your use of SmileCompose, provided by ${valueOr(LEGAL_ENTITY.name, "LEGAL ENTITY NAME")}, ${valueOr(LEGAL_ENTITY.address, "REGISTERED ADDRESS")}. ${legal("Contract formation and acceptance wording")}</p>

<h2>2. Who may use SmileCompose</h2>
<p>SmileCompose is intended for dental professionals and their practice teams. ${legal("Eligibility, professional registration and account-sharing rules")}</p>

<h2>3. What SmileCompose does — and does not do</h2>
<p>SmileCompose creates illustrative, AI-assisted smile visualisations to support communication of aesthetic treatment concepts. It does not diagnose, prescribe treatment, plan surgery, determine clinical suitability or replace professional clinical judgement. Outputs are concept visualisations, not predicted or guaranteed results.</p>
<p>${escapeHtml(CLINICAL_DISCLAIMER)}</p>
<p>You remain responsible for diagnosis, treatment planning, patient communication and consent. ${legal("Clinical responsibility and reliance wording")}</p>

<h2>4. Patient information</h2>
<ul>
  <li>Upload only patient information you are authorised to process, with the appropriate privacy information and lawful basis in place.</li>
  <li>${MINOR_PATIENTS_PERMITTED ? "You may use photographs of patients under 18 only where your practice has an appropriate basis." : "SmileCompose version 1 may be used only with photographs of adult patients (18 or over)."} ${required("Minor-patient policy — LEGAL / DPIA DECISION REQUIRED")}</li>
  <li>Use case references (such as initials) rather than full names or other unnecessary identifiers.</li>
  <li>Where you are the controller and we process patient information for you, our data processing terms apply. ${legal("Customer Data Processing Agreement (Article 28) reference")}</li>
</ul>

<h2>5. Acceptable use</h2>
<p>Do not use SmileCompose unlawfully, to process information you are not entitled to process, to create misleading clinical claims, or to attempt to access other users’ information or bypass usage limits. ${legal("Full acceptable-use terms and suspension rights")}</p>

<h2>6. Subscriptions and payment</h2>
<p>SmileCompose Pro is sold as an auto-renewing subscription through the Apple App Store. Payment, renewal, cancellation and refunds are handled by Apple under Apple’s <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noreferrer">Licensed Application End User License Agreement</a> and App Store terms. Each plan includes a number of smile generations per billing period, shown before purchase. ${legal("Plan terms, allowance changes and fair-use wording")}</p>

<h2>7. Availability and changes</h2>
<p>The service depends on third-party providers and may be unavailable at times. A failed generation is not counted against your allowance. ${legal("Service levels, changes and withdrawal of features")}</p>

<h2>8. Intellectual property</h2>
<p>${legal("Ownership of the software, customer content and generated images; licence terms")}</p>

<h2>9. Warranties and liability</h2>
<p>${legal("Warranty disclaimers, limitation of liability and consumer/professional law carve-outs")}</p>

<h2>10. Suspension, termination and account deletion</h2>
<p>You can delete your account at any time in the app. Deleting your account does not cancel an App Store subscription. ${legal("Termination rights and effect of termination")}</p>

<h2>11. Governing law and disputes</h2>
<p>${legal("Governing law, jurisdiction and dispute resolution")}</p>

<h2>12. Contact</h2>
<p>${PRIVACY_CONTACT_EMAIL ? `<a href="mailto:${escapeHtml(PRIVACY_CONTACT_EMAIL)}">${escapeHtml(PRIVACY_CONTACT_EMAIL)}</a>` : required("CONTACT EMAIL — OWNER DECISION REQUIRED")}</p>
`);
}
