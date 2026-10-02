# Data retention schedule

> **2026-10-02 implementation update (not deployed):** Macro Stage 1 adds signed-in patient-case state in Supabase and binary patient media in the separate PRIVATE `patient-cases` bucket, with an account-isolated local cache/outbox. This supersedes earlier device-only descriptions for patient cases in this document. AI generation and the clinician reference library remain separate. See [the Stage 1 implementation report](CLOUD_PATIENT_SYNC_STAGE1_2026-10-02.md). Provider contracts, region, backup retention and professional approvals are not verified by this implementation.


**Status: OWNER DECISION REQUIRED.** The periods below marked "proposed" are engineering proposals. The owner must decide them, with legal advice, and then update the privacy policy (§7 placeholders) and any automated jobs.

| Data | Location | Current behaviour (code) | Proposed retention | Deletion mechanism | Decision |
|---|---|---|---|---|---|
| Patient photos, results, case data | Clinician device | Kept until the clinician deletes them | Practice's own clinical-records policy. Suggest that the app shows storage used (done) and the practice sets a review interval | Delete case / Delete all cases / Delete all data on this device / delete the app | ☐ |
| Case Library photos and tags (cloud) | Supabase Storage + Postgres (private, owner-only) | Until the clinician removes the case or deletes the account | **OWNER DECISION**: consider a review prompt (e.g. yearly) for old references | Remove from Case Library (deletes both images and the row); Delete Account (all objects first, fails closed) | ☐ |
| Profile photo | Supabase Storage (private) | Until replaced, removed or account deletion | — | Remove Photo; replacing deletes the old file; Delete Account | ☐ |
| Cases in Recently Deleted | Clinician device | Kept for `RECENTLY_DELETED_DAYS` (30, `src/config/cases.ts`) so they can be restored, then purged on next app use | 30 days (product default, **OWNER DECISION**) | Automatic purge; "Delete now"; "Delete all permanently"; Delete all cases / device data | ☐ |
| Temporary picked-photo file (iOS) | App temp folder | Deleted after read | Immediate | `releasePhoto` | — (fixed) |
| Request-ID claim | Durable Object | 24 h | 24 h | Alarm | — (fixed) |
| Generation reservations (`reserved`, abandoned) | Supabase | Returned to the allowance after 15 minutes, on the user's next reservation (`release_stale_reservations`). Rows are kept with the account | Life of account | Automatic release; account deletion | — (fixed) |
| Account, profile (incl. account name, preferred name, onboarding completion), storage accounting, allowance, ledger, consent records | Supabase | Until account deletion | Life of account | Account deletion (cascade) | ☐ |
| Inactive accounts | Supabase | Kept indefinitely | Proposed: notify at 24 months of inactivity, delete at 27 months | **Not implemented**: owner decision | ☐ |
| Security audit log (pseudonymised after deletion) | Supabase | Kept indefinitely | Proposed: 12 months, then purge | **Not implemented**: needs a scheduled `delete … where created_at < now() - interval '12 months'` | ☐ |
| `revenuecat_events` receipts | Supabase | Kept indefinitely | Proposed: 90 days (idempotency needs only days) | **Not implemented** | ☐ |
| `account_deletions` (SHA-256 of user ID) | Supabase | Kept indefinitely | Proposed: 6 years (limitation period), or shorter | **Not implemented** | ☐ |
| `incident_register` | Supabase | Kept | Proposed: 6 years | Manual | ☐ |
| Supabase auth logs | Supabase platform | Plan-dependent | Provider default | Provider | ☐ |
| Supabase backups | Supabase platform | Daily backups (plan-dependent; PITR optional) | Provider default; deleted accounts persist in backups until expiry. Disclose this | Provider | ☐ |
| RevenueCat subscriber | RevenueCat | Deleted on account deletion | — | REST `DELETE /subscribers/{id}` | — |
| Apple purchase records | Apple | Apple's retention | — | Apple | N/A |
| Google abuse-monitoring logs | Google | Limited period (Gemini API); up to 90 days (Vertex) unless an exemption applies | Provider | Provider | ☐ confirm |
| Cloudflare operational logs | Cloudflare | Provider default; Worker Logs off | Provider | Provider | ☐ confirm |
| Support / DSAR correspondence | Mailbox | — | Proposed: 2 years after closure | Manual | ☐ |
| Web session / preferences | Browser | Until sign-out / cleared | — | Sign-out, Delete all data on this device | — |

Once decided, implement the scheduled purges (a Supabase `pg_cron` job calling a service-role function) and add tests in `tests/database.test.ts`.
