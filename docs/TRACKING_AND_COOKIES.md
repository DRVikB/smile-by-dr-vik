# Tracking, cookies and device storage (PECR)

> **2026-10-02 implementation update (not deployed):** Macro Stage 1 adds signed-in patient-case state in Supabase and binary patient media in the separate PRIVATE `patient-cases` bucket, with an account-isolated local cache/outbox. This supersedes earlier device-only descriptions for patient cases in this document. AI generation and the clinician reference library remain separate. See [the Stage 1 implementation report](CLOUD_PATIENT_SYNC_STAGE1_2026-10-02.md). Provider contracts, region, backup retention and professional approvals are not verified by this implementation.


PECR regulation 6 requires consent for storing or accessing information on a user's device unless it is **strictly necessary** for a service the user requested.

## Audit (from the code, 2026-09-27)

| Technology | Purpose | Strictly necessary? | Consent needed? |
|---|---|---|---|
| IndexedDB `smile-temporary-case`, `smile-case-log`, `smile-case-library`, `smile-validation` | Store the clinician's cases (the core service) | Yes | No |
| `localStorage` `smile.*` | Preferences, per-case confirmations | Yes: user-requested functionality | No (proposed) |
| `localStorage` `smilecompose.auth` (web) / Keychain (iOS) | Sign-in session | Yes | No |
| `sessionStorage` one-time account notice | UI state | Yes | No |
| Service worker `sw.js` (web only) | Offline app shell | Yes | No |
| RevenueCat SDK (iOS only) | Purchase and entitlement state | Yes, for a purchased subscription | No |
| Cookies | **None set by SmileCompose.** Cloudflare may set security cookies (e.g. `__cf_bm`) if bot features are enabled, which are strictly necessary | — | No |
| Analytics, advertising, pixels, fingerprinting, ATT | **None** | — | — |
| MediaPipe usage telemetry | Blocked by CSP (`odml.pa.googleapis.com` not allowed) | — | — |

**Conclusion (proposed; REQUIRES LEGAL REVIEW):** no consent banner is required because only strictly necessary storage is used. The privacy policy (§12) states this. If analytics, crash reporting or marketing tools are added later, add a consent mechanism **before** they load, and update this file, the privacy policy, the App Privacy answers and `PrivacyInfo.xcprivacy`.

## Guardrails

- `scripts/build-native.mjs` keeps the native `connect-src` allow-list. A new third-party host requires an explicit code change.
- `PrivacyInfo.xcprivacy` declares `NSPrivacyTracking = false` with no tracking domains.
