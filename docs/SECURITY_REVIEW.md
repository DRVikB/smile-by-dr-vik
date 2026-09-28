# Security review: V1

Review date: 2026-09-27. Reviewer: engineering (automated and manual checks in this repository). **This is not an independent penetration test.**

Status key:
- **PASS**: verified by a test, build check or direct observation, recorded as evidence.
- **PARTIAL**: implemented, but only part is verified, or a known gap remains.
- **FAIL**: missing or failing.
- **NOT APPLICABLE**: does not apply to V1's design.
- **NOT VERIFIED**: cannot be verified from this environment.

No status was assumed.

## Evidence from this review run

- `npm run lint`: clean. `tsc --noEmit`: clean.
- `node --import tsx --test tests/*.test.ts`: **255 / 255 pass**. This includes 15 PGlite Postgres migration tests.
- `npm run build:cloudflare`: succeeds. Built-worker smoke test:
  - `/` returns 200 with CSP and HSTS.
  - `/privacy` and `/terms` return 308 redirects to `.html`.
  - A malformed generation request returns 400.
- `node scripts/build-native.mjs`: succeeds; the forbidden-credential scan is clean. With `SMILE_RELEASE_BUILD=1` it is correctly **blocked** (21 privacy and 17 terms items unresolved).
- `wrangler deploy --dry-run --env staging`: the configuration is valid. Nothing was deployed.
- `xcodebuild` Debug (simulator) and Release (device, unsigned): **BUILD SUCCEEDED**.
- iOS simulator (iPhone 18 Pro, iOS 27): app launches; privacy dashboard renders; in-app Terms page renders with the review banner; upload buttons stay disabled until the upload-authority box is ticked; the App Switcher shows the privacy cover, which lifts on return.
- `npm run check:app-store`: 26 / 30. The 4 remaining are owner ACTION items.
- `npm audit --omit=dev`: 0 known vulnerabilities.

## Results

| # | Control | Status | Evidence / gap |
|---|---|---|---|
| 1 | AI provider credentials absent from the web and iOS bundles | PASS | `build-native.mjs` scan (clean this run); `verify-production.mjs` rejects secret-looking `NEXT_PUBLIC_*` names |
| 2 | Supabase service-role, RevenueCat secret and Apple keys absent from the client | PASS | Scan includes names and a service-role JWT pattern |
| 3 | Unpaid Gemini tier cannot receive patient data | PASS (code gate) | `provider_terms_unconfirmed` tests. The **actual Google account configuration** is NOT VERIFIED |
| 4 | Other adapters (OpenAI, HTTP) blocked without confirmation | PASS | `providerDataTermsRequirement`; tests |
| 5 | Provider receives no case ID, account or billing data | PASS | `tests/accounts.test.ts` |
| 6 | Library-style photos sent only when enabled | PASS | New test; server default is now `false` |
| 7 | Row Level Security, cross-tenant isolation | PARTIAL | PASS in PGlite, with stubbed `auth.uid()` and roles. Not yet run against a real Supabase project |
| 8 | Privileged functions callable only by `service_role` | PARTIAL | As #7 |
| 9 | No user-editable role or admin flag | PASS | Only `update (display_name)` is granted; overrides are service-role only |
| 10 | Append-only ledger, consent and audit logs | PASS | Trigger tests (PGlite) |
| 11 | Security audit events (password, email, identity, overrides, credits, subscriptions, deletion) | PASS | PGlite trigger tests |
| 12 | Email verification, password reset, Sign in with Apple | NOT VERIFIED | Implemented and unit-tested. Needs a live Supabase and Apple configuration |
| 13 | MFA (TOTP) with server-side `aal2` enforcement | PARTIAL | Unit tests cover `mfa_required`. The live enrolment and challenge flow is NOT VERIFIED |
| 14 | Session tokens in the Keychain (this device only), wiped on reinstall | PARTIAL | Adapter unit test, Swift builds, plugin registered. The on-device Keychain round-trip is NOT VERIFIED (accounts are not configured in this build) |
| 15 | Per-user rate limit and allowance row locking | PASS | PGlite tests |
| 16 | Request idempotency (Durable Object) | PARTIAL | Unit tests with an in-memory claim. The Durable Object in production is NOT VERIFIED this session |
| 17 | RevenueCat webhook authentication and idempotency | PASS | Constant-time compare; tests |
| 18 | Web security headers (HSTS, nosniff, Referrer-Policy, frame, Permissions-Policy, COOP) | PARTIAL | PASS for `/` (smoke test). Static-asset headers via `_headers` are NOT VERIFIED on Cloudflare |
| 19 | Content-Security-Policy | PARTIAL | `connect-src` allow-list, `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors`. **No `script-src` restriction** (the Next.js inline bootstrap would need nonces or hashes). XSS defence relies on React escaping. Legal pages have a strict `default-src 'none'` |
| 20 | Native WebView network allow-list; MediaPipe telemetry blocked | PASS | CSP injected by `build-native.mjs` |
| 21 | Face lock still works under the native CSP | NOT VERIFIED | Needs a real photo on a device |
| 22 | Logging redaction; no request bodies logged | PASS | "server logs are redacted" test (`tests/accounts.test.ts`). Worker observability is off in `wrangler.jsonc` |
| 23 | Cloud storage buckets private, signed URLs, storage tenant isolation | NOT APPLICABLE | V1 has no cloud patient storage |
| 24 | Device storage excluded from iCloud / backups | PARTIAL | Code plus `check-app-store`. Backup contents were not inspected on a device |
| 25 | App Switcher snapshot covered | PASS | Observed on the simulator |
| 26 | Temporary picked-photo files deleted | PARTIAL | `releasePhoto` in code; not observed on a device this session |
| 27 | At-rest encryption of device data beyond iOS Data Protection | FAIL (gap) | No app-level encryption and no app lock. Recommended for V1.1 (DPIA R3) |
| 28 | Upload-authority gate before any photo is accepted | PASS | Simulator; `PhotoUploader` |
| 29 | Account deletion (RevenueCat, Apple revoke, Supabase cascade, pseudonymised audit) | PARTIAL | Unit tests with fakes; PGlite cascade test. The live flow is NOT VERIFIED |
| 30 | Data export (server plus device) | PARTIAL | Unit-tested helpers. The live export is NOT VERIFIED |
| 31 | TLS only; ATS without exceptions | PASS | No `NSAppTransportSecurity` exceptions; HSTS |
| 32 | Dependency vulnerabilities (production) | PASS | `npm audit --omit=dev`: 0 |
| 33 | Environment separation (staging) | PARTIAL | Staging config validated by dry run; staging not provisioned |
| 34 | No real patient data in git, fixtures or screenshots | NOT VERIFIED | `Claude outputs/smile_test_result.png` (a photorealistic face) is tracked; provenance unknown. Demo and hero images need provenance and consent confirmation |
| 35 | Independent penetration test | NOT VERIFIED | Not performed |
| 36 | Supabase project hardening (leaked-password protection, MFA, SMTP, password length) | NOT VERIFIED | Dashboard settings are documented in `PAYMENTS_AUTH_SETUP.md` |
| 37 | Cloudflare account hardening (MFA, least privilege, logs off) | NOT VERIFIED | Owner action |

## Summary

No critical code-level vulnerability was found in this review. **Security readiness is PARTIAL.** The controls are implemented and locally tested, but everything that depends on the live services (Supabase, RevenueCat, Apple, Google, Cloudflare) is unverified. Device-level encryption and app lock are a known gap, and there has been no independent test.
