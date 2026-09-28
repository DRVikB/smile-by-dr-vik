import { CLINICAL_DISCLAIMER, DOCUMENT_VERSIONS, LEGAL_ENTITY, LEGAL_REVIEW_COMPLETE, MINOR_PATIENTS_PERMITTED, PRIVACY_CONTACT_EMAIL } from "@/config/legal";
import { RECENTLY_DELETED_DAYS } from "@/config/cases";
import { escapeHtml, legalPage, required, valueOr } from "./layout";

/**
 * SmileCompose Privacy Policy, describing the system as implemented.
 * DRAFT: requires solicitor/DPO review. Placeholders are marked; release
 * builds refuse the page until they are resolved.
 */
export function privacyPolicyHtml(): string {
  const contact = PRIVACY_CONTACT_EMAIL
    ? `<a href="mailto:${escapeHtml(PRIVACY_CONTACT_EMAIL)}">${escapeHtml(PRIVACY_CONTACT_EMAIL)}</a>`
    : required("PRIVACY CONTACT EMAIL — OWNER DECISION REQUIRED");
  const lawful = (purpose: string) => required(`Lawful basis for ${purpose} — REQUIRES LEGAL REVIEW`);
  return legalPage("Privacy Policy", "How SmileCompose handles patient photographs, account and subscription information.", `
<h1>Privacy Policy</h1>
<p class="meta">Version ${escapeHtml(DOCUMENT_VERSIONS.privacy)} · Designed by Dr Vik</p>
${LEGAL_REVIEW_COMPLETE.privacy ? "" : `<div class="draft" data-required>REQUIRES SOLICITOR/DPO REVIEW. This privacy information describes how SmileCompose works today; items in highlighted brackets are awaiting owner or legal decisions.</div>`}

<div class="summary">
  <p><strong>In short.</strong> SmileCompose is a tool for dental professionals that creates illustrative smile visualisations. Patient cases and photographs are stored on the clinician’s own device, not on SmileCompose servers. A patient photograph leaves the device only when the clinician chooses <em>Generate Smile</em> and confirms, and is then processed by SmileCompose’s AI service to create the visualisation. If a clinician adds their own finished cases to their <em>Case Library</em>, those photographs are stored privately in their SmileCompose account and a few matching ones are sent with a design for AI processing as style references. SmileCompose accounts hold your email address, subscription status, a record of generations used and, if you add one, your profile photo. We do not use analytics, advertising or tracking, we do not sell data, and we do not use patient data to train AI models.</p>
</div>

<h2>1. Who we are and how to contact us</h2>
<p>SmileCompose is provided by ${valueOr(LEGAL_ENTITY.name, "LEGAL ENTITY NAME")}${LEGAL_ENTITY.companyNumber ? ` (company number ${escapeHtml(LEGAL_ENTITY.companyNumber)})` : ""}, ${valueOr(LEGAL_ENTITY.address, "REGISTERED ADDRESS")} (“we”, “us”).${LEGAL_ENTITY.icoRegistration ? ` ICO registration: ${escapeHtml(LEGAL_ENTITY.icoRegistration)}.` : ` ${required("ICO registration number, if applicable — OWNER DECISION REQUIRED")}`}</p>
<p>Privacy questions and requests: ${contact}.</p>

<h2>2. Our role</h2>
<p>For SmileCompose accounts, subscriptions, security and support, we act as a <strong>controller</strong>.</p>
<p id="patient-data">For patient photographs and clinical information that a dental practice or clinician chooses to process with SmileCompose, the practice or clinician is expected to be the <strong>controller</strong> and we expect to act as their <strong>processor</strong>, processing that information only on their instructions to provide the service. ${required("Controller/processor roles — REQUIRES LEGAL REVIEW")} Patients who want to exercise rights over their photographs should contact their dental practice; we will assist the practice.</p>

<h2>3. How patient information is processed</h2>
<ul>
  <li><strong>On the device.</strong> Patient photographs, optional reference photographs, generated visualisations, before-and-after reports, case references (we ask for initials or a practice reference, not names), design choices and clinical notes are stored in the app’s private storage on the clinician’s device (in the web version, the browser’s storage). In the iOS app they are excluded from iCloud and computer backups. They are not uploaded to SmileCompose servers.</li>
  <li><strong>Case Library (the clinician’s finished work).</strong> A clinician can add photographs of their own finished bonding and porcelain cases to their Case Library, to be used as style references. Before the first one is added, the clinician confirms they are authorised to use the images for this purpose; the confirmation is recorded with its date and version. Each case is stored privately in the clinician’s SmileCompose account (Supabase storage, access limited to that account) as a downscaled photograph and a smile-region crop, with the tags the clinician chooses (material, optional label, teeth treated, starting conditions). We ask clinicians not to include patient names in labels. The clinician can edit or remove cases at any time; removing a case deletes its images.</li>
  <li><strong>When generating.</strong> After the clinician confirms, the selected photograph, any reference photograph the clinician added and the design settings and notes are sent over an encrypted connection to the SmileCompose service, which checks the clinician’s account and has the image created by the AI image-generation provider SmileCompose uses at the time. When <em>Use my Case Library</em> is on (the default once the clinician has added cases), the service also selects up to five of the clinician’s own Case Library smile crops that match the design (by material, teeth and starting conditions; three by default) and sends them with it for AI processing as style references. Only the clinician’s own cases can be selected, and none are sent when the option is off or nothing matches. The case reference, Case Library labels, the clinician’s account details, profile photo and billing information are not sent for AI processing.</li>
  <li><strong>What the service keeps.</strong> The SmileCompose service does not store the patient photograph or the generated image. It records that a generation happened (time, a random case identifier, AI provider and model, prompt version, treatment type, which of the clinician’s Case Library cases were used as references, and whether it succeeded) against the clinician’s account, without any image, patient reference or notes. If the clinician answers “Does this reflect your style?”, the answer is kept with that record. A random request identifier is kept for up to 24 hours to prevent duplicate charges.</li>
  <li><strong>AI provider.</strong> SmileCompose uses a commercial AI image-generation provider under terms that do not allow it to use this content to train or improve its models. The provider may keep requests for a limited period to detect abuse and may process them outside the UK (see section 6). The provider may change as better models become available; the same conditions apply. ${required("Current AI provider, service tier, processing region and retention (kept in the internal subprocessor list) — OWNER DECISION REQUIRED")}</li>
  <li><strong>Face protection.</strong> The automatic face-protection step runs on the device. Its model files are downloaded from content delivery networks; no photograph is sent to them.</li>
  <li><strong>Patients.</strong> ${MINOR_PATIENTS_PERMITTED ? "SmileCompose may be used with photographs of patients under 18 where the practice has an appropriate basis." : "SmileCompose version 1 is intended for photographs of adult patients (18 or over) only."} ${required("Minor-patient policy — LEGAL / DPIA DECISION REQUIRED")}</li>
</ul>

<h2>4. Information about you (clinicians)</h2>
<table>
  <tr><th>Information</th><th>Purpose</th><th>Lawful basis</th></tr>
  <tr><td>Email address; password (held only as a secure hash by our authentication provider) or Sign in with Apple identifier; two-factor settings</td><td>Create and secure your account</td><td>${lawful("account administration")}</td></tr>
  <tr><td>Your account name (from Apple at first sign-in, or as you enter it) and, if you choose one, the name SmileCompose uses to greet you; whether you have completed the welcome steps</td><td>Personalise the app and show your account details</td><td>${lawful("personalisation")}</td></tr>
  <tr><td>Your profile photo, if you add one (a small 512 × 512 image stored privately in your account; shown only to you in the app; never sent to AI providers or used for analytics)</td><td>Personalise the app</td><td>${lawful("profile photo")}</td></tr>
  <tr><td>Subscription status, plan, renewal dates, App Store purchase history (via Apple and RevenueCat)</td><td>Provide SmileCompose Pro, restore purchases</td><td>${lawful("subscriptions")}</td></tr>
  <tr><td>Generation allowance and usage history</td><td>Provide the generations in your plan, prevent misuse, troubleshoot</td><td>${lawful("usage accounting")}</td></tr>
  <tr><td>Records of accepting these documents and of your confirmations before processing patient information</td><td>Accountability</td><td>${lawful("accountability records")}</td></tr>
  <tr><td>Security events (sign-in method changes, password changes, complimentary access, account deletion requests); authentication logs held by our authentication provider</td><td>Keep accounts secure, investigate incidents</td><td>${lawful("security monitoring")}</td></tr>
  <tr><td>Messages you send us</td><td>Support and privacy requests</td><td>${lawful("support")}</td></tr>
</table>
<p>Patient health information is special category data. The practice, as controller, must have a lawful basis and an Article 9 condition for processing it. ${required("Article 9 condition(s) relied on for any SmileCompose processing — REQUIRES LEGAL REVIEW")}</p>
<p>Payments are handled by Apple; we never receive card details. RevenueCat identifies you by a random account ID, not your email address.</p>

<h2>5. Who receives information</h2>
<table>
  <tr><th>Recipient</th><th>Role</th><th>Information</th></tr>
  <tr><td>AI image-generation provider</td><td>AI processing</td><td>Photographs, matching Case Library references and design settings, only when a clinician generates</td></tr>
  <tr><td>Hosting and network provider</td><td>Running the SmileCompose service</td><td>Requests in transit (including photographs being generated), IP addresses</td></tr>
  <tr><td>Supabase</td><td>Authentication, account database and private file storage</td><td>Account, subscription status, usage and security records; profile photo; Case Library photographs and tags</td></tr>
  <tr><td>RevenueCat</td><td>Subscription management</td><td>Random account ID, purchase history</td></tr>
  <tr><td>Apple</td><td>App distribution, payments, Sign in with Apple (independent controller for its own services)</td><td>Purchase and sign-in information</td></tr>
  <tr><td>${required("Email delivery provider — OWNER DECISION REQUIRED")}</td><td>Account emails</td><td>Email address</td></tr>
</table>
<p>We do not share information with advertisers or data brokers. A current list of the service providers we use is available on request, and to practices under their data processing agreement.</p>

<h2>6. International transfers</h2>
<p>Some providers process information outside the UK, including in the United States. ${required("Transfer mechanisms (UK adequacy regulations / UK–US data bridge, IDTA or Addendum) for each provider — REQUIRES LEGAL REVIEW")}</p>

<h2>7. How long we keep information</h2>
<ul>
  <li>Patient information on the device: until the clinician deletes the case, uses <em>Delete all data on this device</em>, or deletes the app. A deleted case stays in <em>Recently Deleted</em> on the device for ${RECENTLY_DELETED_DAYS} days so it can be restored, then it is removed automatically; it can also be deleted permanently at once.</li>
  <li>Case Library photographs and tags, and your profile photo: until you remove them or delete your account.</li>
  <li>Account, subscription, usage and consent records: while the account exists; deleted when the account is deleted. Security events are kept with the account link removed for ${required("security log retention period — OWNER DECISION REQUIRED")}.</li>
  <li>Duplicate-request identifiers: 24 hours.</li>
  <li>Provider backups and logs: according to each provider’s retention. ${required("Backup purge windows — OWNER DECISION REQUIRED")}</li>
</ul>

<h2>8. Your rights</h2>
<p>Under UK data protection law you can ask to access, correct or delete your personal data, to receive a copy in a portable format, to restrict or object to processing, and to withdraw consent where we rely on it. In the app you can export your data and delete cases or your account yourself (<em>Settings › Privacy &amp; data</em>). To make a request or a complaint, contact ${contact}. You can also complain to the Information Commissioner’s Office: <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">ico.org.uk</a>.</p>

<h2>9. Deleting your account</h2>
<p><em>Settings › Account › Delete account</em> deletes your SmileCompose account, your profile photo, your Case Library (every photograph and its tags), subscription records held by us and RevenueCat, your usage and consent records, and revokes Sign in with Apple access where used. Deleting your account does not cancel an App Store subscription; cancel it in your Apple ID subscription settings. You can choose to delete the cases on your device at the same time.</p>

<h2>10. AI processing and automated decisions</h2>
<p>SmileCompose uses AI to create illustrative images on a clinician’s request. It does not make decisions about patients, diagnose, recommend treatment or decide suitability; the clinician remains responsible for all clinical decisions. We do not use patient information to train AI models, and we do not share it with AI providers for model improvement. Case Library references guide the style of a single design; they are not used to train, fine-tune or build a dataset for any model.</p>
<p>${escapeHtml(CLINICAL_DISCLAIMER)}</p>

<h2>11. Security</h2>
<p>Information is encrypted in transit (HTTPS/TLS) and at rest by our providers. Account records and stored files (profile photos and Case Library photographs) are protected so that each user can access only their own; the app receives only short-lived private links to its own images. Two-factor authentication is available. Patient cases are not stored on SmileCompose servers; the only patient images stored are the finished cases a clinician chooses to add to their Case Library.</p>

<h2>12. Cookies and similar technologies</h2>
<p>SmileCompose does not use advertising or analytics cookies or trackers. The app stores what it needs to work on your device: your sign-in session, preferences and cases.</p>

<h2>13. Changes</h2>
<p>We will update this policy when our practices change and change the version above. You will be asked to review significant changes in the app.</p>
`);
}
