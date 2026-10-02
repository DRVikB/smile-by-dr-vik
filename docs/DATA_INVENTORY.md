# Data inventory

> **2026-10-02 implementation update (not deployed):** Macro Stage 1 adds signed-in patient-case state in Supabase and binary patient media in the separate PRIVATE `patient-cases` bucket, with an account-isolated local cache/outbox. This supersedes earlier device-only descriptions for patient cases in this document. AI generation and the clinician reference library remain separate. See [the Stage 1 implementation report](CLOUD_PATIENT_SYNC_STAGE1_2026-10-02.md). Provider contracts, region, backup retention and professional approvals are not verified by this implementation.


Every personal-data item SmileCompose V1 handles, based on the code in this repository (as of 2026-09-27). Retention values marked **OWNER DECISION REQUIRED** are proposals; see [DATA_RETENTION.md](DATA_RETENTION.md).

Legend: **Device** means WebView/browser storage on the clinician's device. **Transit** means held in memory only while a request is processed.

## A. Patient data (special category: health; biometric-capable facial images)

| Item | Where | Source | Sent to | Kept | Code |
|---|---|---|---|---|---|
| Patient photograph (smile / face) | Device: IndexedDB `smile-temporary-case`, `smile-case-log` | Camera or system photo picker (no Photo Library permission) | Cloudflare Worker (transit) → Google (only when **Generate** is confirmed) | Until the clinician deletes the case, the device data or the app. Deleted cases stay in Recently Deleted (on the device) for `RECENTLY_DELETED_DAYS` (30) then are purged | `src/lib/storage.ts`, `src/lib/caseLog.ts`, `src/components/PhotoUploader.tsx` |
| Optional reference / inspiration photo | Device | Clinician | Worker (transit) → Google | As above | `src/app/page.tsx` |
| Case Library photos (clinician's own finished cases; other patients) — **cloud from 2026-09-28** | Supabase Storage, private bucket `case-library/{user_id}/{case_id}/original.jpg` (≤2048 px) and `reference.jpg` (smile-region crop ≤1280 px); rows `reference_cases`, `reference_case_images` | Clinician upload after the one-time authority confirmation (`case_library_authority` consent record) | Worker selects up to `STYLE_REFERENCE_LIMIT` (default 3, cap 5) matching smile crops of the **authenticated user's own** cases → Google, when "Use my Case Library" is on (default on once cases exist). Client-sent style images are ignored when accounts are enforced | Until the clinician removes the case or deletes the account (images and rows deleted together) | `src/server/caseLibraryHandlers.ts`, `src/lib/styleMatching.ts`, `supabase/migrations/20260928140000_case_library_avatars.sql` |
| Case Library tags | Supabase `reference_cases` | Clinician (material, optional label ≤80, teeth treated, starting conditions) | Not sent to Google (labels never; tags only drive matching on the server) | As above | as above |
| Style references used / style feedback | Supabase `generation_ledger.reference_case_ids`, `style_feedback` | Server / clinician's optional Yes / Not quite | Not sent anywhere | While the account exists | `src/lib/generation/handler.ts` |
| Case Library (builds without accounts, local development only) | Device: `smile-case-library` | Clinician's own library | Worker → Google when the option is on | Until deleted | `src/lib/caseLibrary.ts` |
| Profile photo (clinician) | Supabase Storage, private bucket `profile-avatars/{user_id}/{uuid}.jpg` (512 × 512 JPEG); `profiles.avatar_path` | Clinician (camera or photo picker, cropped on the device) | Never sent to AI providers or analytics; shown via 1-hour signed URLs | Until replaced (old file deleted), removed, or the account is deleted | `src/server/accountHandlers.ts` (`handleAvatar`), `src/components/profile/` |
| Generated visualisation and before/after report | Device | Google response | Returned to the device only | As above | `src/lib/caseLog.ts` |
| Patient reference ("Case ref.", max 24 characters; initials recommended) | Device only | Clinician | **Not sent** to the server or Google | As above | `src/app/page.tsx` |
| Design settings and tooth plans | Device | Clinician | Worker → Google (prompt) | As above | `src/lib/generation/schema.ts` |
| Clinical notes (max 400 characters) | Device | Clinician | Worker → Google (prompt) | As above | `src/components/DesignControls.tsx` (identifying-information warning shown) |
| Validation scores and reviewer notes | Device: `smile-validation` | Clinician | Not sent | As above | `src/components/ValidationPanel.tsx` |
| Face landmarks, face lock and edit mask (derived on the device) | Device | On-device MediaPipe (model files from jsDelivr / Google Cloud Storage; no image is uploaded) | Not sent. Only numeric framing/bounds coordinates go with the request | Stored with the case | `src/lib/face/`, `src/lib/editMask.ts` |
| Temporary picked-photo copy (iOS) | App temp folder `picked-photos/` | PHPicker | — | Deleted after it is read (`releasePhoto`); iOS may purge temp files | `ios/App/App/PhotoPickerPlugin.swift` |
| App Switcher snapshot | iOS system | iOS | — | Replaced by the privacy cover (no patient image) | `ios/App/App/SceneDelegate.swift` |

In the iOS app, `Library/WebKit` (which holds IndexedDB) is excluded from iCloud and device backups (`AppDelegate.swift`). Data is protected by iOS Data Protection (default class: protected until first unlock). There is no app-level encryption beyond iOS Data Protection.

## B. Clinician (customer) account data (Supabase, controller data)

| Item | Table / system | Purpose | Kept | Deleted by account deletion |
|---|---|---|---|---|
| Email, password hash, Apple ID `sub`, optional name from Apple, MFA factors | Supabase `auth.users`, `auth.identities`, `auth.mfa_factors` | Account, sign-in, MFA | While the account exists | Yes |
| Profile: email, display name, subscription tier/status/product/environment/expiry, allowance | `public.profiles` | Entitlement and allowance | While the account exists | Yes (cascade) |
| Account name (`full_name`, from Apple at first sign-in or typed), preferred name (`preferred_name`), `onboarding_completed_at` | `public.profiles` (server-written only) | Personalisation, greeting, first-run state | While the account exists | Yes (cascade) |
| Storage accounting (`used_bytes`, `limit_bytes`) | `public.storage_accounts` | Future account-held files. V1: no rows (no cloud patient storage) | While the account exists | Yes (cascade) |
| Complimentary access (reason, created_by, expiry) | `public.access_overrides` | Server-side promotional access | While the account exists | Yes |
| Allowance periods and reservations (random request ID, random case ID) | `allowance_periods`, `generation_reservations` | Metering | While the account exists | Yes |
| Generation ledger (event, quantity, provider, model, prompt version, treatment type, failure code, random case ID) | `generation_ledger` (append-only) | Usage accounting, disputes, troubleshooting | While the account exists | Yes |
| Consent records (type, document version, random case ID, time) | `consent_records` (append-only) | Accountability | While the account exists | Yes |
| Security events (event type, actor, small metadata, **no email or content**) | `security_audit_log` | Security | **OWNER DECISION REQUIRED** | Pseudonymised (user link set to null) |
| RevenueCat webhook receipts (event ID, type, app user ID, outcome) | `revenuecat_events` | Idempotency | **OWNER DECISION REQUIRED** | No (the app user ID is the random Supabase UUID). See the retention doc |
| Deletion record (SHA-256 of user ID, time) | `account_deletions` | Proof of deletion; abuse prevention | **OWNER DECISION REQUIRED** | Kept (pseudonymous) |
| Organisations / membership (unused in V1) | `organisations`, `organisation_members` | Future team accounts | — | Yes (cascade) |
| Auth logs (IP address, user agent, events) | Supabase platform | Security | Supabase's retention (plan-dependent) | Per Supabase |
| Session tokens | iOS: Keychain (`AfterFirstUnlockThisDeviceOnly`). Web: `localStorage` `smilecompose.auth` | Stay signed in | Until sign-out or expiry | Sign-out removes them |

## C. Subscription data (RevenueCat, Apple)

| Item | Where | Notes |
|---|---|---|
| App User ID (= Supabase user UUID), purchase history, entitlements, store transaction IDs | RevenueCat | No email is sent to RevenueCat by the app. Deleted via the REST API on account deletion (`deleteSubscriber`). |
| Payment details, Apple ID | Apple | Apple is the independent controller. We never receive card data. |

## D. Operational and transient data

| Item | Where | Kept |
|---|---|---|
| Random request ID claim (timestamp only) | Cloudflare Durable Object `SmileRequestGuard` | 24 hours (alarm deletes it) |
| HTTP request metadata (IP address, headers) | Cloudflare edge | Cloudflare's own operational logs. Worker Logs/observability are **disabled** |
| Request bodies (photos) | Worker memory | For the duration of the request only. Not logged (`safeLog` redacts, `no-store` responses) |
| Google prompt/response logs | Google | Abuse monitoring for a limited period under paid terms (see [SUBPROCESSORS.md](SUBPROCESSORS.md)) |
| Server error logs | Worker console (not persisted: observability off) | Redacted by `src/server/redact.ts` |

## E. Device preferences (not patient data)

`localStorage` keys prefixed `smile.` hold display preferences, the upload-authority and AI-consent state, onboarding progress (`smile.onboarding`: steps seen, a preferred name chosen without an account, random account IDs that finished onboarding) and a cached copy of the signed-in account's names for offline greetings (`smile.account-profile`, removed on sign-out). `sessionStorage` holds a one-time account notice. "Delete all data on this device" clears these; it keeps the sign-in session, which sign-out removes.

## F. Not collected

No analytics, advertising identifiers, crash-reporting SDK, location, contacts, IDFA/ATT, fingerprinting, or third-party cookies. The CSP blocks MediaPipe usage telemetry (`odml.pa.googleapis.com`).

## G. Support requests

"Report a Problem" opens the user's mail app with the app version, platform and OS version only (`src/lib/appInfo.ts`). No account ID, email, case data or images are added automatically. What the user then sends is ordinary support correspondence.
