# SmileCompose V1 readiness

**Assessment date:** 2026-09-27.

**V1 product readiness: NOT READY** for production patient data.

The engineering controls are largely in place. The legal, contractual, provider-configuration and regulatory steps are not done, and live-service flows are unverified. Successful builds and passing tests are **not** evidence of legal or privacy readiness.

Supporting documents are in [docs/](docs/). This file is the summary.

| Area | Rating | Why |
|---|---|---|
| **UK Privacy** | PARTIAL | Privacy-by-design controls are implemented and tested:<br>• device-only patient case storage, excluded from backups (exception from 2026-09-28: Case Library references stored privately in the clinician's account; DPIA re-review required)<br>• upload-authority and AI-processing confirmations with versioned records<br>• minimised provider input; Case Library references selected server-side from the user's own cases only (on by default once cases exist)<br>• export and deletion; no tracking<br>Outstanding: lawful bases, roles, retention decisions, the practice's patient notice, and final privacy text. |
| **Security** | PARTIAL | 255/255 tests pass, including PGlite RLS and cross-tenant tests. Also in place:<br>• secret scans; Keychain sessions; MFA with server enforcement<br>• audit log, rate limits, redacted logging<br>• App Switcher cover (observed)<br>Gaps: no `script-src` CSP; no app-level device encryption or app lock; live services unverified; no penetration test. See [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md). |
| **Processor/Vendor** | NOT VERIFIED | No evidence that the Google, Cloudflare, Supabase or RevenueCat DPAs are accepted. The Google paid tier or Vertex, and AI Studio logging being off, are unconfirmed. The code refuses live generation until `SMILE_GEMINI_DATA_TERMS` is set. See [docs/SUBPROCESSORS.md](docs/SUBPROCESSORS.md). |
| **International Transfer** | NOT VERIFIED | Gemini API data "may be processed in any country"; RevenueCat is in the USA. No mechanism is confirmed. Vertex `europe-west2` is supported in code but model availability there is unverified. See [docs/INTERNATIONAL_TRANSFERS.md](docs/INTERNATIONAL_TRANSFERS.md). |
| **DPIA Status** | FAIL | Drafted ([docs/DPIA.md](docs/DPIA.md)). **FINAL LEGAL/PRIVACY SIGN-OFF REQUIRED.** It is not approved, and no processing of real patient data should start before sign-off. |
| **Medical Device Boundary** | NOT VERIFIED | The intended purpose, disclaimers and claims checklist are in place ([docs/MEDICAL_DEVICE_BOUNDARY.md](docs/MEDICAL_DEVICE_BOUNDARY.md)). **REQUIRES PROFESSIONAL REGULATORY REVIEW**: the tooth plans, bite context and face analysis need assessment. |
| **Apple Privacy Status** | PARTIAL | `check:app-store` passes 26/30, and the privacy manifest, purpose strings, deletion, IAP, Keychain and snapshot cover are done. Remaining: legal-page placeholders (the release build is blocked), production keys, App Store Connect App Privacy answers and privacy URL, and live purchase/sign-in testing. |
| **Professional Legal Review Outstanding** | FAIL | Solicitor/DPO items B1–B12 and regulatory items C1–C4 are open ([docs/PROFESSIONAL_REVIEW_REQUIRED.md](docs/PROFESSIONAL_REVIEW_REQUIRED.md)). Terms: **LEGAL REVIEW REQUIRED**. |

## Gate answers

- **Safe for TestFlight?** YES, but **only with synthetic or demo data** (test mode, sample images, or consenting staff photos) and after production keys are configured. No real patient photos until the DPIA is signed off and the Google terms are confirmed.
- **Safe for production patient data?** **NO.** The DPIA is unsigned, processor contracts and transfer mechanisms are unverified, the Google configuration is unconfirmed, the lawful basis is undecided, and the legal texts are unreviewed.

## Deployment note

The web deployment is unchanged; nothing was deployed. Once this code is deployed, live generation will be refused until:

1. Supabase and RevenueCat are configured (accounts required).
2. `SMILE_GEMINI_DATA_TERMS` is set by the owner after completing the Google checklist.

This is intended.

## What changed in V1 privacy work

- Legal pages are generated from one source: `src/legal/*` and `src/config/legal.ts`, producing `/privacy.html` and `/terms.html`. Marked placeholders appear until resolved, and release builds are blocked.
- iOS: Keychain session storage (`SecureStoragePlugin.swift`) and the App Switcher privacy cover (`SceneDelegate.swift`).
- Server:
  - The data-terms gate now covers every live provider.
  - Case Library references are selected on the server from the authenticated user's own cases, only when enabled; client-sent style images are ignored.
  - The minimum password length is 10.
- Hosting:
  - A staging Worker environment in `wrangler.jsonc` (synthetic data; mock provider).
  - A strict CSP for the legal pages.
- Earlier in this phase: upload-authority confirmation (adults only), consent/version records, the security audit log, MFA, rate limiting, DSAR helpers, the privacy dashboard with export and deletion, redacted logging, security headers, and the Vertex AI transport.
