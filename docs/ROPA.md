# Record of processing activities (Art. 30)

> **2026-10-02 implementation update (not deployed):** Macro Stage 1 adds signed-in patient-case state in Supabase and binary patient media in the separate PRIVATE `patient-cases` bucket, with an account-isolated local cache/outbox. This supersedes earlier device-only descriptions for patient cases in this document. AI generation and the clinician reference library remain separate. See [the Stage 1 implementation report](CLOUD_PATIENT_SYNC_STAGE1_2026-10-02.md). Provider contracts, region, backup retention and professional approvals are not verified by this implementation.


> Draft from the repository. The owner completes the bracketed fields. **REQUIRES LEGAL REVIEW.** Art. 30(5) exemptions for organisations with fewer than 250 staff do **not** apply where special category data is processed, so keep this record.

**Organisation:** [LEGAL ENTITY NAME], [REGISTERED ADDRESS], company no. [ ], ICO registration [ ]. **Contact / DPO:** [ ].

## Part A: SmileCompose as controller (Art. 30(1))

| Activity | Purpose | Data subjects | Data categories | Recipients | Transfers | Retention | Security (summary) | Lawful basis |
|---|---|---|---|---|---|---|---|---|
| Account management | Provide accounts, authentication, MFA, deletion | Clinicians | Identity/contact, credentials (hash), Apple ID, MFA factors | Supabase, email provider, Apple | See [INTERNATIONAL_TRANSFERS.md](INTERNATIONAL_TRANSFERS.md) | Life of account | [SECURITY.md](SECURITY.md) | [LAWFUL_BASIS_REGISTER.md](LAWFUL_BASIS_REGISTER.md) |
| Subscriptions and entitlements | Sell and apply Pro subscriptions | Clinicians | UUID, purchase history, entitlement | RevenueCat, Apple | USA (RevenueCat) | Life of account | RLS, secret keys server-only | |
| Usage metering | Allowance, disputes, troubleshooting | Clinicians | Ledger (no content), random case IDs | Supabase | | Life of account | Append-only | |
| Accountability records | Evidence of acceptance and confirmations | Clinicians | Consent records | Supabase | | Life of account | Append-only | |
| Security monitoring | Protect accounts and service | Clinicians | Audit events, IPs (provider logs) | Supabase, Cloudflare | | [DATA_RETENTION.md](DATA_RETENTION.md) | Append-only, pseudonymised on deletion | |
| Support and DSARs | Respond to requests | Clinicians, patients (redirected) | Correspondence | [Mailbox provider] | | [ ] | | |

## Part B: SmileCompose as processor (Art. 30(2))

| Controller(s) | Categories of processing | Transfers | Security |
|---|---|---|---|
| Customer dental practices (list maintained from the accounts / DPA acceptance records) | Transient generation of smile visualisations from patient photographs and clinical inputs; forwarding to the Google sub-processor; no storage | Google (see transfers doc); Cloudflare edge | [SECURITY.md](SECURITY.md); no server-side storage; minimised provider input |

Review this record at least annually and whenever processing changes.
