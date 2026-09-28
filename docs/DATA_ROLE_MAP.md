# Data role map (controller / processor)

> **REQUIRES LEGAL REVIEW.** This is the engineering team's working assumption, recorded so the rest of the documentation is consistent. It is not a legal conclusion. A solicitor or DPO must confirm the roles, and the customer contract (Terms plus a data processing agreement) must match them.

Owner details still required: legal entity name, registered address, company number, ICO registration (see `src/config/legal.ts` and [PROFESSIONAL_REVIEW_REQUIRED.md](PROFESSIONAL_REVIEW_REQUIRED.md)).

## Working assumption

| Processing | Proposed role of SmileCompose operator | Controller | Notes |
|---|---|---|---|
| Clinician accounts (sign-up, sign-in, MFA, account deletion) | **Controller** | SmileCompose operator | Our own customers' account data. |
| Subscriptions, entitlements, generation allowance, usage ledger | **Controller** | SmileCompose operator | Needed to sell and meter the service. |
| Security audit log, abuse prevention, rate limits | **Controller** | SmileCompose operator | Security of our own service. |
| Consent / confirmation records (Terms, Privacy, upload authority, AI processing) | **Controller** (accountability record of the clinician's acts) | SmileCompose operator | Contains no patient data; the case ID is a random UUID. |
| Support and privacy correspondence | **Controller** | SmileCompose operator | |
| **Patient photographs and clinical inputs sent for generation** | **Processor** (proposed) | The dental practice / clinician | We process transiently on the practice's instruction: receive → forward to Google → return the image. Nothing stored server-side. |
| Patient data stored **on the clinician's device** | **Not processed by us** (proposed) | The dental practice / clinician | The software runs on the customer's device; the data never reaches our systems. The app provides the controls (deletion, export). |
| Google (Gemini API / Vertex AI) | Our **sub-processor** for patient images | — | Needs a written contract (Google's data processing terms) and must be listed to customers. |
| Cloudflare (Worker hosting) | Our **processor / sub-processor** | — | Patient images pass through in memory. |
| Supabase (auth + database) | Our **processor** | — | Account data only. No patient data. |
| RevenueCat | Our **processor** | — | Random account ID and purchase history. |
| Apple (App Store, IAP, Sign in with Apple) | **Independent controller** for its own services | Apple | Apple's own terms apply. |

## Points the reviewer must decide

1. **Sole-trader or small-practice customers.** If the clinician is an individual, they may be both our customer (controller for account data we hold about them) and the controller of their patients' data. The DPA must work for individuals as well as practices.
2. **Library style (off by default).** When a clinician switches it on, up to three of their own finished-case photographs of *other patients* are sent with the request. The practice remains the controller. The DPIA must accept or reject this processing.
3. **Clinician-entered free text** (notes, patient reference) could contain identifying information despite the in-app guidance. Notes are sent to Google as design instructions. The patient reference stays on the device.
4. **Pseudonymous records we keep** (ledger, consent records, audit log) hold only the random case ID, never the patient reference. Confirm that these stay controller records of ours and are not patient data processed on the practice's behalf.
5. **If cloud case storage or team accounts are added later** (the `organisations` tables exist but are unused in V1), the processor role widens. The DPIA and DPA must be revisited before that ships.

## How the code reflects the roles

- Provider input minimisation: `src/lib/generation/handler.ts` strips `caseId`, account and billing data before calling the provider. Style references are forwarded only when the clinician has switched library style on.
- No server-side patient storage: the handler returns the image in the response. It is never written to a database, KV store, R2 or logs. Worker observability is off (`wrangler.jsonc`).
- Controller records: `supabase/migrations/*.sql`, which uses RLS and service-role-only functions.
