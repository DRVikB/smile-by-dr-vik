# Data subject requests (DSAR) procedure

> **2026-10-02 implementation update (not deployed):** Macro Stage 1 adds signed-in patient-case state in Supabase and binary patient media in the separate PRIVATE `patient-cases` bucket, with an account-isolated local cache/outbox. This supersedes earlier device-only descriptions for patient cases in this document. AI generation and the clinician reference library remain separate. See [the Stage 1 implementation report](CLOUD_PATIENT_SYNC_STAGE1_2026-10-02.md). Provider contracts, region, backup retention and professional approvals are not verified by this implementation.


Contact point: the configured `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` ([OWNER DECISION REQUIRED]). Deadline: **one calendar month** from receipt, extendable by two further months for complex or numerous requests, provided the person is told within the first month. No fee unless a request is manifestly unfounded or excessive. Verify identity proportionately. Log every request (date received, type, identity check, action, date closed).

## 1. Requests from clinicians (SmileCompose is controller)

| Right | How to fulfil | Tooling |
|---|---|---|
| Access / portability | In-app: Settings › Privacy & data › **Export my data**. This produces a JSON file with the server account export plus all data on that device. Manual: run `select public.export_account_data('<user uuid>')` as service role; add Supabase auth details and the RevenueCat subscriber record | `handleAccountExport`, `export_account_data`, `src/lib/dataExport.ts` |
| Rectification | Email change via Supabase Auth; other fields are system-generated | Supabase dashboard |
| Erasure | In-app **Delete account**; or manually via the admin API. Security events are kept pseudonymised; see [DATA_RETENTION.md](DATA_RETENTION.md) | `handleAccountDelete` |
| Restriction / objection | Suspend by revoking access overrides or disabling the user in Supabase; record the decision | Supabase |
| Withdraw consent | No clinician processing relies on consent | — |

## 2. Requests from patients (practice is controller)

SmileCompose holds no patient cases, patient references or generated images server-side; server records for cases contain only a random case ID. **Exception (from 2026-09-28): Case Library photographs** — finished-case photos a clinician adds to their own Case Library (style references) are stored in that clinician's account. The practice can find, re-tag or remove them in Settings › Case Library, and they are included (metadata) in the clinician's account export; removing a case deletes its images.

1. If a patient contacts us directly, do not fulfil the request ourselves. Tell the patient we act for their dental practice, and forward the request to the practice promptly (with the patient's agreement), per the DPA.
2. The practice fulfils it on its device (find the case in Cases, export the report, or delete it) and, if the patient appears in the clinician's Case Library, removes that reference case in Settings › Case Library.
3. If the practice needs to know whether server records exist for a case, it gives us the case's random ID (visible in the case export). We run `select public.locate_case_records('<user uuid>', '<case id>')` and confirm the consent and ledger rows. These contain no images.
4. Images already processed by Google are covered by Google's retention terms. We cannot retrieve or delete Google abuse-monitoring logs individually. Disclose this in the privacy information.

## 3. Templates

- Acknowledgement: "We received your request on [date]. We will respond by [date + 1 month]…"
- Identity check request.
- Patient redirect: "SmileCompose provides software to your dental practice, which decides how your information is used. We have passed your request to [practice] / please contact your practice…"

**REQUIRES LEGAL REVIEW** of the templates and the patient-redirect approach.
