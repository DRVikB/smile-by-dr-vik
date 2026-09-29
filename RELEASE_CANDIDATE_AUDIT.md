# SmileCompose V1 — release candidate audit

Date: 2026-09-28 · Branch: `release/v1-device-test` (checkpoint commit `06d289e`, later fixes uncommitted) · Statuses: PASS / FAIL / PARTIAL / NOT TESTED / NOT APPLICABLE.

"Browser QA" = the production iOS web bundle in the browser pane against a mock API, at 375×667, 390×844 and 1180×820 / 820×1180, Light and Dark. "Simulator" = iOS 27 simulators (iPhone 17e, iPhone 18 Pro Max, iPad Pro 11"). No live Supabase, RevenueCat, App Store or AI calls were made; the deployed Worker was only read (GET/OPTIONS).

## Build

| Item | Status | Evidence |
|---|---|---|
| Dependency installation | PASS | `npm ci` from the lockfile, no errors; no major upgrades made |
| Lint | PASS | `eslint src tests scripts --max-warnings=0` |
| Typecheck | PASS | `tsc --noEmit` (after clearing iCloud-duplicated `.next` files) |
| Tests | PASS | 296/296 (`tsx --test tests/*.test.ts`), incl. PGlite database/RLS tests |
| Production web build | PASS | `npm run build`, `npm run build:cloudflare` |
| Capacitor sync | PASS | `npm run ios:sync` → bundle check passed (appId `uk.co.drvik.smilecompose`, name SmileCompose, webDir `dist/native`, no `server.url`, no secrets, 0 duplicates) |
| Xcode build | PASS | Release, generic iOS device, unsigned: BUILD SUCCEEDED (arm64, 1.0 (1), iOS 15+); Debug simulator builds succeeded. Signed build to a physical iPhone: NOT TESTED (needs your team) |

## Authentication

| Item | Status | Evidence |
|---|---|---|
| Email signup | NOT TESTED | Needs a Supabase project (none configured). Code and redirect (`uk.co.drvik.smilecompose://auth-callback`) reviewed |
| Verification | NOT TESTED | As above |
| Login | NOT TESTED | As above; account UI verified in browser QA with a mock session |
| Password reset | NOT TESTED | As above (`resetPasswordForEmail` → deep link) |
| Apple login | NOT TESTED | Needs a signed device build + Supabase Apple provider; native plugin and entitlement present |
| Session persistence | PARTIAL | Session stored in the Keychain plugin (native) — reviewed; not exercised on a device |

## Onboarding

| Item | Status | Evidence |
|---|---|---|
| Complete flow | PASS | Browser QA: Welcome → Account → Personalise (+photo) → How It Works → Your Style → Subscription → Ready → Home |
| Migration (existing users) | PASS | `tests/onboarding-profile.test.ts` (existing users skip; interrupted resume) |
| Preferred name | PASS | Browser QA + tests |
| Profile photo | PASS | Browser QA (add/crop/replace/remove, initials fallback) + server/RLS tests |
| Case Library onboarding | PASS | Browser QA (authority once, success copy, skip) |

## Payments

| Item | Status | Evidence |
|---|---|---|
| RevenueCat | PARTIAL | Identity = Supabase UUID; server-side REST entitlement check; tests with stubs. No RevenueCat project configured |
| `pro` entitlement | PARTIAL | Server tests (active, expired, sandbox rules) |
| Monthly | NOT TESTED | Needs App Store Connect product + RevenueCat offering |
| Annual | NOT TESTED | As above |
| Restore | NOT TESTED | Implemented (Settings › Restore Purchases); needs sandbox |
| Offer Code | NOT TESTED | Implemented (native redemption sheet); needs App Store Connect |
| Complimentary access | PASS | `access_overrides` grants Pro server-side; users can't create/modify overrides (RLS test) |
| Sandbox | NOT TESTED | `REVENUECAT_ALLOW_SANDBOX` defaults to accept; needs a sandbox account |

## AI

| Item | Status | Evidence |
|---|---|---|
| Gemini endpoint | PARTIAL | Current code builds and is tested; the **deployed** Worker is outdated (no account/Case Library routes; iOS CORS preflight returns 405) — deploy needed (manual) |
| Secrets | PASS | Server-only; bundle scans clean (patterns + actual `.env.local` values); `NEXT_PUBLIC_` rule enforced |
| Generation | PARTIAL | End-to-end in browser QA via the mock API and test mode; handler tests with a stubbed provider; no live AI call in this pass |
| Every generation attached to the account | PASS | No anonymous mode (the `SMILE_ACCOUNTS=off` switch was removed); test "every real AI generation is attached to the signed-in account" |
| Failure refund | PASS | Tests: provider failure releases the reservation; stale reservations released after 15 min; commit retried once |
| Style references | PASS | CRITICAL test inspects the outbound provider request: patient image first, then the account's matching smile crops, SOURCE PATIENT / STYLE REFERENCES prompt, IDs recorded; off → none |

## Cases (patient cases, on the device)

| Item | Status | Evidence |
|---|---|---|
| Create | PASS | `tests/case-log.test.ts`, browser QA |
| Update | PASS | Tests (visualisations assemble into cases) |
| Archive | PASS | Tests (archive / Recently Deleted / restore / purge) |
| Delete | PASS | Tests + Settings › Cases |
| Generation versions | PASS | Tests + browser QA (variants on a case) |

## Case Library

| Item | Status | Evidence |
|---|---|---|
| Upload | PASS | Server tests + browser QA (mock) |
| Privacy | PASS | Private bucket, owner-only RLS (PGlite with a Storage stub), authority confirmation |
| Tags | PASS | Edit material/label/teeth/conditions (browser QA + tests) |
| Matching | PASS | `styleMatching` tests; Compose count matches server |
| Gemini inclusion | PASS | See "Style references" |

## Native

| Item | Status | Evidence |
|---|---|---|
| Camera | NOT TESTED | `NSCameraUsageDescription` present; needs a device |
| Photos | PARTIAL | PHPicker plugin (no full-library permission); add-only usage string for saving; needs a device |
| Share Sheet | NOT TESTED | `@capacitor/share` + Filesystem temp files; needs a device |
| Keyboard | PARTIAL | Input types/autocomplete reviewed (email, passwords, one-time code, names); interactive test on device pending |
| Safe areas | PARTIAL | `viewport-fit=cover` + `env(safe-area-inset-*)`; simulator screenshots (Dynamic Island, home indicator) fine; landscape on device pending |
| Haptics | NOT APPLICABLE | Not used in V1 |

## UI

| Item | Status | Evidence |
|---|---|---|
| iPhone | PASS | Browser QA 375/390 + simulator 17e / Pro Max; fixes: sheet overflow, Home short-screen spacing, stray panel bands, placeholder clipping, Email row, compact reveal tags |
| iPad | PASS | Split Settings, Case Library grid, design/result workspace with inspector (portrait and landscape) |
| Light | PASS | All major screens; primary-button hover colour fixed |
| Dark | PASS | All major screens; photos untinted |
| Accessibility | PARTIAL | Contrast tests, Reduce Motion / Transparency / Increase Contrast, 44 pt targets; VoiceOver not tested |
| Loading | PASS | Native launch screen held until the page paints; account, Cases, Case Library, generation states |
| Errors | PASS | Code-mapped user messages; no raw provider/database errors, tokens or URLs shown (tests) |
| Offline | PARTIAL | Generation refuses offline with a message; request timeouts; device test pending |

## Security

| Item | Status | Evidence |
|---|---|---|
| RLS | PASS | PGlite tests of the real migrations |
| Cross-user isolation | PASS | User B can't read A's profile, ledger, consents, Case Library, avatar; can't change allowances, overrides or subscription state. Patient cases/images are device-only (not on the server) |
| Secret audit | PASS | Repository scan (only a runtime-generated test key), compiled iOS bundle scan |
| Log redaction | PASS | Server logs only via `safeLog` redaction; no client `console.*`; Worker observability off |
| Private storage | PASS | Private buckets; signed URLs 10 min / 1 h, never logged |

## Privacy

| Item | Status | Evidence |
|---|---|---|
| Deletion | PASS | Account deletion removes storage first (fails closed), rows cascade, Apple revocation, RevenueCat subscriber deletion; tests |
| Export | PASS | Account export (incl. Case Library metadata) + on-device export |
| Privacy routes | PASS | `/privacy.html`, `/terms.html` generated and bundled; in-app sheets |
| Retention architecture | PARTIAL | Implemented controls; retention periods are owner decisions (docs/DATA_RETENTION.md) |
| GDPR technical controls | PASS | Upload/AI confirmations, minimisation, no analytics, no vendor names in app copy, DPIA/inventory/processors documented (legal sign-off pending) |

## Distribution

| Item | Status | Evidence |
|---|---|---|
| Xcode signing readiness | PARTIAL | Automatic signing, entitlements and bundle ID set; team must be chosen (manual) |
| Physical iPhone readiness | PARTIAL | Compiles for device; installs once signed. Sign-in/generation need the staging backend (manual) |
| TestFlight readiness | PARTIAL | 29/33 automated App Store checks pass; remaining: production public keys, legal placeholders (release build refuses them), App Store Connect products, privacy answers |

## Manual actions required (not code failures)

1. Apple Developer team in Xcode (paid membership for Sign in with Apple).
2. Supabase staging project + migrations + auth redirect URLs + Apple provider.
3. RevenueCat project, `pro` entitlement, products; App Store Connect subscriptions.
4. Deploy the current Worker (staging) with secrets; set `NEXT_PUBLIC_*` keys; `npm run ios:sync`.
5. Legal: privacy/terms placeholders, DPIA re-review (Case Library), solicitor/DPO review.
6. App Store Connect App Privacy answers (declare Photos linked to the user).
