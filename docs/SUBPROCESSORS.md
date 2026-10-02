# Processors and sub-processors

> **2026-10-02 implementation update (not deployed):** Macro Stage 1 adds signed-in patient-case state in Supabase and binary patient media in the separate PRIVATE `patient-cases` bucket, with an account-isolated local cache/outbox. This supersedes earlier device-only descriptions for patient cases in this document. AI generation and the clinician reference library remain separate. See [the Stage 1 implementation report](CLOUD_PATIENT_SYNC_STAGE1_2026-10-02.md). Provider contracts, region, backup retention and professional approvals are not verified by this implementation.


> Contract and transfer status here is **NOT VERIFIED** unless evidence is attached. The repository cannot show that an agreement has been accepted. The owner must complete the due-diligence checklist for each provider and file the evidence (DPA PDF or acceptance screenshot, date, account).

| Provider | Service | Data | Patient data? | Location (to confirm) | Contract / DPA | Transfer mechanism | Status |
|---|---|---|---|---|---|---|---|
| **Google** (Gemini Developer API, paid, **or** Vertex AI) | Image generation | Patient photo(s), prompt with design settings and notes | **Yes** (transient, plus provider abuse logging) | Gemini API: any country with Google facilities. Vertex: selected region, if the model is offered there | Google Cloud Data Processing Addendum (via the Cloud Billing account) plus the Gemini API Additional Terms / Google Cloud terms | UK Extension to the EU–US DPF (Google LLC certified?) or IDTA/Addendum | NOT VERIFIED |
| **Cloudflare** | Worker hosting, TLS, Durable Objects | All generation requests in transit (patient images in memory), IP addresses, random request IDs | **Yes** (in transit) | Global edge | Cloudflare DPA (self-serve, part of the terms) | DPF / SCCs with UK Addendum per the Cloudflare DPA | NOT VERIFIED |
| **Supabase** | Authentication, Postgres and private Storage | Clinician account, subscription status, usage ledger, consent and audit records; **from 2026-09-28: Case Library photographs (patient images the clinician adds) and profile photos** | **Yes (Case Library images)** | Project region: [OWNER DECISION, e.g. London eu-west-2] | Supabase DPA (request or sign via dashboard) | DPF / IDTA if US access | NOT VERIFIED |
| **RevenueCat** | Subscription management | Supabase user UUID, App Store purchase history | No | USA | RevenueCat DPA | DPF / SCCs plus UK Addendum | NOT VERIFIED |
| **Email provider** for auth emails (Supabase default SMTP or custom) | Verification and reset emails | Email address | No | [OWNER DECISION] | [OWNER DECISION] | | NOT VERIFIED |
| **jsDelivr / Google Cloud Storage** | Download of the on-device face model and WASM files | IP address and user agent only (no images) | No | Global CDN | Public CDN terms | — | Consider self-hosting the model files to remove this recipient |
| **Apple** | App Store, IAP, Sign in with Apple, TestFlight | Apple's own data | No | — | Apple Developer Program License Agreement. Apple is an independent controller | — | N/A (independent controller) |

Not V1 processors (the code includes adapters, but they are **blocked** unless explicitly confirmed): OpenAI (`SMILE_OPENAI_DATA_TERMS=api`) and a custom HTTP backend (`SMILE_PROVIDER_DATA_TERMS=confirmed`). Enabling either requires updating this list, the DPIA and the privacy policy first.

## Required Gemini production configuration

The code enforces `SMILE_GEMINI_DATA_TERMS` only as the owner's *assertion*. The configuration itself must be verified by the owner:

- [ ] A Cloud Billing account is linked to the project that issues the API key (paid tier). Unpaid tier: **never** with patient data.
- [ ] Google Cloud DPA accepted, with the evidence filed.
- [ ] AI Studio "Logs and datasets" **disabled** for the project; no datasets shared with Google.
- [ ] The API key is restricted to the Generative Language API and stored only as a Worker secret.
- [ ] Or Vertex AI: region chosen, the model confirmed as available there, a least-privilege service account, an abuse-monitoring exemption requested (invoiced billing needed), and caching disabled if zero data retention is required.
- [ ] Re-check Google's terms at each review; they change.

## Processor due-diligence checklist (complete per provider)

| Check | Google | Cloudflare | Supabase | RevenueCat | Email |
|---|---|---|---|---|---|
| DPA with Art. 28(3) terms (instructions, confidentiality, security, sub-processors, assistance, deletion/return, audit) | ☐ | ☐ | ☐ | ☐ | ☐ |
| Sub-processor list reviewed; change-notification mechanism | ☐ | ☐ | ☐ | ☐ | ☐ |
| Security certifications (ISO 27001 / SOC 2) reviewed | ☐ | ☐ | ☐ | ☐ | ☐ |
| Data location confirmed and recorded | ☐ | ☐ | ☐ | ☐ | ☐ |
| Transfer mechanism confirmed (DPF UK Extension certification checked on dataprivacyframework.gov, or IDTA/Addendum) and TRA if needed | ☐ | ☐ | ☐ | ☐ | ☐ |
| Breach notification commitment (timescale) | ☐ | ☐ | ☐ | ☐ | ☐ |
| Retention and deletion terms recorded in [DATA_RETENTION.md](DATA_RETENTION.md) | ☐ | ☐ | ☐ | ☐ | ☐ |
| No use of customer data for training or product improvement | ☐ | ☐ | ☐ | ☐ | ☐ |
| Account security: MFA on the admin console, least-privilege access | ☐ | ☐ | ☐ | ☐ | ☐ |
| Evidence filed (link / date / reviewer) | | | | | |

Customers must be told about these sub-processors and given notice of changes (see [CUSTOMER_DPA_REQUIREMENTS.md](CUSTOMER_DPA_REQUIREMENTS.md)).
