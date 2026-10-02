# Data Protection Impact Assessment: SmileCompose V1

> **2026-10-02 implementation update (not deployed):** Macro Stage 1 adds signed-in patient-case state in Supabase and binary patient media in the separate PRIVATE `patient-cases` bucket, with an account-isolated local cache/outbox. This supersedes earlier device-only descriptions for patient cases in this document. AI generation and the clinician reference library remain separate. See [the Stage 1 implementation report](CLOUD_PATIENT_SYNC_STAGE1_2026-10-02.md). Provider contracts, region, backup retention and professional approvals are not verified by this implementation.


**Status: FINAL LEGAL/PRIVACY SIGN-OFF REQUIRED**

This draft was prepared from the repository by the engineering team. It is not approved. Only the controller's accountable person, advised by a solicitor/DPO, can approve it. If residual high risk remains that cannot be mitigated, the ICO must be consulted before processing starts (UK GDPR Art. 36).

| | |
|---|---|
| Version | 0.2 draft, 2026-09-28 (Case Library cloud storage and profile photos added; **re-review required**, see §2a) |
| Controller (patient data) | Each customer dental practice. This DPIA is offered to customers as a processor-side template (see [CUSTOMER_DPA_REQUIREMENTS.md](CUSTOMER_DPA_REQUIREMENTS.md)) |
| Controller (account data) | [LEGAL ENTITY NAME: OWNER DECISION REQUIRED] |
| DPO / privacy lead | [OWNER DECISION REQUIRED] |

## 1. Why a DPIA is needed

The processing involves **special category (health) data** and **facial images** (possibly biometric-capable), using **innovative technology** (generative AI), with transfers to a large third-party AI provider. These match ICO criteria for likely high-risk processing, so a DPIA is treated as mandatory.

## 2. Description of the processing

**Purpose.** Create an illustrative, AI-generated visualisation of a possible aesthetic dental outcome so a clinician can discuss options with a patient. It does not diagnose, plan treatment or predict outcomes (see [MEDICAL_DEVICE_BOUNDARY.md](MEDICAL_DEVICE_BOUNDARY.md)).

**Nature.** Full data flow: [GENERATION_DATA_FLOW.md](GENERATION_DATA_FLOW.md). In summary:

1. The clinician captures or selects a patient photo. It is stored only on the device (IndexedDB, excluded from backups on iOS).
2. Before upload, the clinician confirms authority to process, a lawful basis, privacy information given, and that the patient is aged 18 or over (`UPLOAD_AUTHORITY_TEXT`).
3. Before the first generation for that photo, the clinician confirms AI processing by Google (`AiProcessingConsent`).
4. On **Generate**, the photo, the optional reference image, and the design settings and notes go over TLS to the SmileCompose Cloudflare Worker. When "Use my Case Library" is on, the Worker (not the app) selects up to `STYLE_REFERENCE_LIMIT` (default 3, hard cap 5) matching Case Library smile crops belonging to the authenticated clinician and adds them to the request (§2a).
5. The Worker authenticates the clinician (Supabase JWT, plus MFA if enrolled), checks entitlement and reserves one generation, then sends the images and prompt to Google Gemini. It removes the case ID and all account and billing data first.
6. The image comes back to the device. The server stores no image. It records a ledger entry with no content (random case ID, model, prompt version, treatment type, outcome).

**Scope.** Categories: facial and intra-oral photographs, dental condition implied by images and tooth plans, and clinician notes. Data subjects: adult dental patients, and clinicians (account data). Volume: [OWNER ESTIMATE REQUIRED: expected clinicians and generations per month]. Plan allowances are 50 per month or 600 per year per clinician. Geography: UK customers. Processing by Google may occur outside the UK.

**Context.** Patients reasonably expect their dentist to take photographs. They may not expect a US AI provider to process them, so transparency from the practice is essential. The clinician is a regulated professional (GDC) under a duty of confidentiality. The technology is novel and outputs can be unrealistic.

## 2a. Change 2026-09-28: Case Library in the cloud, and profile photos

Requested by the product owner on 2026-09-28. This changes the V1 position that no patient images are stored server-side. **The DPIA must be re-reviewed and re-approved before release.**

- **Case Library (clinician's finished work, used as style references).** Photographs of the clinician's own finished bonding/porcelain cases (other patients) are uploaded to a private Supabase Storage bucket (`case-library`, `{user_id}/{case_id}/original.jpg` ≤2048 px and `reference.jpg`, a smile-region crop made on the device ≤1280 px). Tags: material, optional label (guidance: no patient names), teeth treated, starting conditions. Row Level Security limits reads to the owner; writes happen only through the server with the service role. Before the first upload the clinician confirms authority (`CASE_LIBRARY_AUTHORITY_TEXT`, recorded as consent type `case_library_authority` with version and timestamp).
- **Use in generation.** Server-side matching (`findMatchingStyleReferences`: material → teeth region → tooth count → starting conditions → recency) picks 2–5 references (default 3). Only the smile-region crops are sent, only the authenticated user's own cases can be selected, and none are sent when the option is off or nothing matches. `reference_case_ids` are recorded on the generation ledger. Optional "Does this reflect your style?" feedback is stored against the clinician's account only. No training, fine-tuning or dataset is created.
- **Default.** "Use my Case Library" is **on by default** once the clinician has added cases (owner requirement). Previously library style was off by default. This is a DPIA decision point (R8).
- **Profile photo.** Optional 512 × 512 JPEG in a private bucket (`profile-avatars/{user_id}/{uuid}.jpg`), own-folder RLS, short-lived signed URLs. Never sent to AI providers or analytics. Replaced and removed files are deleted; account deletion deletes it.
- **Deletion and export.** Removing a case deletes its rows and both images; account deletion removes all Case Library and avatar objects first and fails closed if storage deletion fails. The account export includes Case Library metadata and style feedback.
- **Controller position.** Case Library images are patient data for which the clinician/practice is controller; SmileCompose stores them as processor. The customer DPA and privacy notice must cover storage of these images ([CUSTOMER_DPA_REQUIREMENTS.md](CUSTOMER_DPA_REQUIREMENTS.md)).

## 3. Consultation

☐ Clinician users (planned: TestFlight with synthetic data) ☐ DPO/solicitor ☐ Information security review ☐ Patient representatives (recommended). Record outcomes here.

## 4. Necessity and proportionality

- **Minimisation:** patient reference stays on the device; case ID replaced by a random UUID; provider receives no account data; Case Library references are chosen server-side from the clinician's own cases, limited in number and sent as smile-region crops (on by default once cases exist, see R8); the patient photo is re-encoded through a canvas (max 2048 px), which drops EXIF/GPS metadata (not verified for reference images); notes limited to 400 characters and flagged as not for identifiers. **Gap:** the whole photo is sent, not a mouth-region crop. Cropping would reduce facial data sent to Google but would need re-validation of output quality.
- **Storage limitation:** no server-side storage of patient photographs or results. Exceptions (from 2026-09-28): Case Library images the clinician chooses to add, kept until removed or the account is deleted, and the clinician's optional profile photo. Device retention is under clinician control, with delete case, delete all cases, delete all device data and delete account. The retention schedule is an owner decision ([DATA_RETENTION.md](DATA_RETENTION.md)).
- **Accuracy:** outputs are labelled concept visualisations with a disclaimer. Clinician review is required.
- **Transparency:** layered notices at upload and before AI processing, the privacy policy (draft) and the processing section for patients (`/privacy.html#patient-data`). **Gap:** the practice's own patient-facing notice is outside the app. A template is recommended.
- **Rights:** the practice handles patient requests using on-device export and delete. SmileCompose assists as processor ([DATA_SUBJECT_REQUESTS.md](DATA_SUBJECT_REQUESTS.md)).
- **Processors:** Google, Cloudflare, Supabase and RevenueCat. DPAs and transfer mechanisms still need confirmation ([SUBPROCESSORS.md](SUBPROCESSORS.md), [INTERNATIONAL_TRANSFERS.md](INTERNATIONAL_TRANSFERS.md)).
- **Alternatives considered:** on-device generation (not feasible with current models, see `APP_STORE_PRIVACY_READINESS.md`); Vertex AI with regional processing and an abuse-logging exemption (supported in code via `SMILE_PROVIDER=vertex`, and preferable if available for the chosen model).

## 5. Google processing: verified facts (as of 2026-09-27)

| Configuration | Training use | Provider retention | Location |
|---|---|---|---|
| Gemini Developer API, **unpaid** tier | Content may be used to improve products | Yes | Any. **Blocked in code** (`SMILE_GEMINI_DATA_TERMS` must be `paid`) |
| Gemini Developer API, **paid** tier (Cloud Billing) | Not used to improve products | Logged for a limited period for abuse monitoring and required legal disclosures. The AI Studio "logs and datasets" feature must stay **off** (off by default; if enabled, logs are kept 55 days by default). Dataset sharing with Google must never be enabled | "May be processed in any country where Google has facilities" |
| Vertex AI | Not used to train | Abuse-monitoring prompt logging applies unless an exemption is approved (customers with invoiced billing can request one). Logs kept up to 90 days in the selected region. Zero data retention also requires caching to be disabled | Regional endpoint (for example `europe-west2`), **if the chosen image model is offered there (NOT VERIFIED)** |

Sources: ai.google.dev/gemini-api/terms, ai.google.dev/gemini-api/docs/zdr, ai.google.dev/gemini-api/docs/logs-datasets, cloud.google.com/vertex-ai/generative-ai/docs/data-governance, docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency. These must be re-checked at sign-off; provider terms change.

## 6. Risks

Likelihood (Remote / Possible / Probable) × Severity (Minimal / Significant / Severe). Residual ratings assume the listed measures are in place **and** the open actions are done.

| # | Risk to individuals | Inherent | Measures in place (code) | Open actions | Residual |
|---|---|---|---|---|---|
| R1 | Patient images retained or used by the AI provider beyond the request | Probable × Severe | Unpaid tier blocked; server data-terms gate; no dataset sharing; minimised input | Confirm paid billing / Vertex and the DPA; keep AI Studio logging off; decide on a Vertex abuse-logging exemption | Possible × Significant |
| R2 | Transfer outside the UK without adequate safeguards | Probable × Significant | — | Confirm the UK–US data bridge / IDTA / Addendum per provider; consider Vertex regional processing | Remote × Significant (once confirmed) |
| R3 | Lost or stolen device exposes stored cases | Possible × Severe | iOS Data Protection; excluded from backups; App Switcher cover; session in Keychain; delete controls | Recommend passcode/MDM in customer guidance; consider an app lock (Face ID) and at-rest encryption for V1.1 | Possible × Significant |
| R4 | Account takeover leading to misuse of the allowance (no patient data server-side) | Possible × Minimal | Supabase auth, optional TOTP MFA enforced server-side, rate limits, audit log | Enable leaked-password protection in Supabase; consider requiring MFA | Remote × Minimal |
| R5 | Clinician uploads without authority or notice, or photos of children | Possible × Significant | Upload-authority confirmation (adults only); AI-processing confirmation; consent records | Customer DPA and Terms obligations; practice notice template | Possible × Significant |
| R6 | Identifying free text sent to Google | Possible × Significant | Guidance hints; 400-character limit; patient reference not sent | Training for clinicians | Remote × Significant |
| R7 | Misleading visualisation influences decisions (harm from reliance) | Possible × Significant | Disclaimer on results and exports; "concept visualisation" framing | Medical device boundary review | Possible × Minimal |
| R8 | Other patients' photos (Case Library) stored in the cloud and sent as style references | Probable × Significant | Authority confirmation before first upload; private bucket with owner-only RLS; server-side selection of the user's own cases only; limit 3 (cap 5); smile crops only; option can be switched off; notices in upload flow, Compose and the AI notice; deletion and export | DPIA decision on default-on; customer DPA/notice to cover storage; decide retention; confirm processor terms for Supabase Storage | Possible × Significant |
| R9 | Breach at a processor (Supabase, RevenueCat, Cloudflare) | Remote × Significant | Only Case Library images and profile photos are held (Supabase Storage, private, RLS); signed URLs expire (10 min / 1 h) and are never logged; service-role key server-only | Incident procedure, processor notification terms; review Supabase storage encryption and region | Remote × Significant |
| R10 | Patient images in logs or crash reports | Possible × Severe | Worker observability off; `safeLog` redaction; no crash SDK; `no-store` | Verify in production that the Cloudflare log settings stay off | Remote × Significant |
| R11 | Inability to fulfil patient rights (data only on a clinician's device) | Possible × Significant | Export and delete on the device | Document the practice's procedure | Remote × Minimal |

## 7. Measures summary

Technical controls implemented in V1 are listed in [SECURITY.md](SECURITY.md) and [UK_COMPLIANCE_MATRIX.md](UK_COMPLIANCE_MATRIX.md).

## 8. Sign-off

| Item | Name / date | Notes |
|---|---|---|
| Measures approved by | | |
| Residual risks approved by | | Any residual high risk requires ICO consultation |
| DPO / solicitor advice | | |
| DPO advice accepted or overruled (with reasons) | | |
| Consultation responses reviewed | | |
| Review date | | Review at every change of AI provider, model, region, storage design or intended purpose |

**FINAL LEGAL/PRIVACY SIGN-OFF REQUIRED.** Do not change this status in an automated or engineering change.
