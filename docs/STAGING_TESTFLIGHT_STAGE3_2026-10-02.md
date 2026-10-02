# SmileCompose V1 — Stage 3 handover

Date: 2 October 2026. This is an engineering handover, not legal approval or certification of clinical accuracy.

**Completed:** local release checkpoint, regression/build checks, staging Supabase migration reconciliation and activation, private storage/live owner-isolation tests, staging Worker/web deployment, one synthetic live Gemini generation, real staging ledger tests, simulated-device sync against the hosted staging API, Capacitor sync, Release simulator compilation/launch, and configuration/signing audit.

The owner resumed Supabase setup and connected the RevenueCat plugin after the initial preparation-only handover. Only staging was deployed/migrated. Production and Apple distribution were not changed. No real patient photograph was used. No app redesign or new product feature was added; two database fixes address security warnings and an account-deletion failure discovered during live validation.

## Release checkpoint

| Item | Recorded value |
| --- | --- |
| Branch | `release/v1-device-test` |
| Engineering RC commit | `6f48042865e45fbd7ddee8440186696b82509f2f` |
| Annotated local tag | `v1.0.0-rc1` (not pushed) |
| Initial working state | Stage 1/2 and existing user changes were uncommitted; 195 files were checkpointed together, after a credential scan |
| State immediately after checkpoint | Clean |
| Framework/package manager | Next.js 16.3.8, React 19; npm 11.19.0 / Node 24.20.0 |
| Package version | `1.0.0` |
| Xcode version/build | `1.0` / `1` (existing convention preserved for both app and widget) |

The original RC tag is not moved or amended. Staging deployment uses that app-code checkpoint; the two database fixes and this updated handover are subsequent release-preparation changes. Neither the tag nor branch was pushed.

## A. Staging database — READY

Confirmed via logged-in Supabase CLI: **smilecompose-staging**, ref `wukcqlpuzkzwxmdkotfg`, region **eu-west-2 (London)**, ACTIVE_HEALTHY. The owner confirmed this is the staging target.

The first push found existing account tables without migration history. Rather than resetting or replaying them, the first four migrations were compared to the remote schema: 16 tables, 141 columns, 25 function bodies/configurations, 87 constraints, 29 indexes, 19 policies, 12 triggers and 40 expected grants. Equivalent baseline migrations were recorded with `migration repair --status applied`. The rollover and patient-sync migrations then applied successfully. No table was removed.

Two additional migrations applied only to staging:

- `20261002153000_trigger_privilege_hardening.sql`: lock four trigger search paths to `pg_catalog`; revoke API-role execution of Supabase's optional administrative RLS event-trigger function without removing it.
- `20261002154000_identity_deletion_audit.sql`: retain an unlink audit with a null user reference when Auth deletes an identity by account-deletion cascade. Ordinary unlinking retains the existing owner reference. This fixes the live foreign-key failure on account deletion.

All eight local/remote migration versions match. Patient case, asset, mutation and cleanup tables exist with RLS enabled. The owner SELECT policies and registered-upload storage policies are present. No production migration was applied.

Final security advisors: only **leaked-password protection disabled** remains. Enable it in Supabase Auth password-security settings if the project's plan supports it; no paid plan upgrade was made. The six database function warnings were resolved. Guidance: [Supabase functions](https://supabase.com/docs/guides/database/functions), [password security](https://supabase.com/docs/guides/auth/password-security).

## B. Staging storage — READY FOR DEVICE TESTING

`patient-cases` is **PRIVATE**, with a 25 MiB limit and JPEG/PNG/WebP/PDF allowlist. All other inspected media buckets are private too.

A procedural 1×1 PNG passed owner authorisation/upload, SHA-256 verification, immutable retry, owner fetch and temporary signed access/expiry. Foreign-account case/asset access, public URL access, an unregistered object path and checksum mismatch were rejected. No clinical photograph was uploaded to storage.

Deletion produced a tombstone, denied app asset access with 410, and removed the storage object and cleanup job. One immediate request to the previously fetched storage URL returned cached bytes; a fresh cache-busted request was denied and `storage.objects` confirmed zero objects. This is a **REVIEW** record, not a promise that previously downloaded bytes can be recalled. Live failed-cleanup/retry injection was not performed; that path remains covered by isolated regression tests.

Both disposable accounts were subsequently deleted through the real account-deletion route, including their RevenueCat records. Final verification confirms **0 QA accounts, 0 patient cases, 0 asset metadata rows, 0 cleanup jobs and 0 patient storage objects**. Supabase backup retention, provider infrastructure retention and physical-device cache behaviour still require owner/privacy review.

## C. Staging backend — READY

Deployed **smile-by-dr-vik-staging**:

https://smile-by-dr-vik-staging.drvik.workers.dev

Worker version: `82b5d00a-1c62-42b0-aac9-63ab7c54277c`.

The verified staging Supabase URL/service-role key were securely installed as Worker secrets. No value was printed. Existing Google and RevenueCat server credentials passed live generation/subscriber checks. Gemini model remains `gemini-3.1-flash-image`; observability remains disabled, and the Durable Object request guard is active. There is no hosted mock/free-credit bypass.

`REVENUECAT_WEBHOOK_AUTH` and Apple revocation secrets are still absent; see J. No production Worker was deployed. Repeat staging deployment only with:

```sh
cd "/Users/vik/Documents/New project/smile"
npm run build:cloudflare
npx wrangler deploy --env staging
```

Each environment needs separate bindings/secrets: [Cloudflare environments](https://developers.cloudflare.com/workers/wrangler/configuration/#environments).

## D. Staging web — READY FOR DEVICE TESTING

The production-style web assets were deployed with the staging Worker. Build-time Supabase URL/anon key were verified against the confirmed staging project. Native API origin is `https://smile-by-dr-vik-staging.drvik.workers.dev`; web calls use their own origin. Production was not replaced.

Required public build variables:

- `NEXT_PUBLIC_SUPABASE_URL=https://wukcqlpuzkzwxmdkotfg.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — configured with the verified public anon key
- `NEXT_PUBLIC_SMILE_API_ORIGIN=https://smile-by-dr-vik-staging.drvik.workers.dev`
- `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` — verified App Store `appl_…` key configured locally and bundled in native assets

Server secrets are excluded from browser/native bundles. The current native bundle is an engineering build until the RevenueCat and legal release guards are satisfied.

## E. API smoke results

| Hosted staging check | Result |
| --- | --- |
| `/api/account/status`, `/api/case-library`, `/api/patient-cases` without auth | 401, `no-store`; routes exist |
| Authenticated account status | 200; live RevenueCat lookup verified |
| Patient collection/detail/create/update/delete | PASS against hosted Worker and staging Supabase |
| Asset authorisation/upload/fetch | PASS, private/checksummed/owner scoped |
| Native preflight | 204 for exact `capacitor://localhost` origin |
| Foreign-origin preflight | 403 |
| Generation without auth / subscription / per-case permission | Rejected before paid generation |
| Hosted page/manifest/Apple icon/manifest icons/service worker | 200; correct branding; unknown page 404 |
| Live Gemini + rapid duplicate + reconnect retry | One success, duplicates 409, one credit consumed |
| Account deletion | Initial FK failure fixed; A and B then returned 200 with `deleted:true`, `revenuecatDeleted:true` |

The previous remote patient-case **404 is resolved**. Browser same-origin requests need no CORS preflight. `capacitor://localhost` is the on-device bundled WebView origin, not a localhost API dependency.

## F. Account/authentication/isolation

Two disposable, confirmed password accounts were created via the staging admin API without sending email. Password login, session refresh, logout, revoked refresh token, re-login and persistence of the same case all passed. Foreign-account API/table/storage access was denied. Simulated IndexedDB namespaces proved account switch isolation and rejection of an aborted previous-account lease.

Both accounts and their RevenueCat customer records were removed after testing. Patient content and QA access overrides were cascaded away; pseudonymous audit/deletion markers remain by the existing policy.

Email confirmation/reset links and Sign in with Apple were not exercised. Confirm Supabase Auth URL configuration permits the staging web URL and `uk.co.drvik.smilecompose://auth-callback*`; configure the Apple provider/client. Physical Keychain/session and account-switch flows remain owner acceptance tests.

## G. Cloud sync — READY FOR PHYSICAL DEVICE TESTING

The real client API adapter/coordinator used the hosted staging backend with two separate **simulated IndexedDB devices**, plus a separate account namespace. Passed: stable UUID, upload/fetch, edit propagation, durable offline outbox, coordinator/store restart, reconnect flush, conflict preservation, preserving the losing draft as a new case, account isolation and deletion propagation.

Separate direct API checks advanced revision 1→8, retained Preferred Smile/Tooth Map/analysis metadata, and returned 409 plus the cloud revision for a revision-7 update. Private thumbnail upload/fetch passed.

Evidence: 12/12 live-coordinator checks pass; direct API/storage suite has 53 PASS and one cached-deletion REVIEW. This is live backend/database integration, not physical iPhone→iPad→web proof. Follow the acceptance script on hardware; real OS force-close, memory pressure and backgrounding remain pending.

## H. Live generation — READY FOR HUMAN QA

**One paid provider generation** used the existing synthetic demo portrait, 6 upper teeth, single-shade composite, Whiten and 512 draft resolution. Google returned a live image and the expected model/prompt receipt. The app's usage-based cost estimate was **US$0.045977**; this is not a verified billing invoice.

Auth, subscription and per-case permission rejection passed. No real patient photograph was submitted. The raw provider image is retained in ignored local evidence for review. It is **not** the client-composited, selected-tooth-protected final presentation, so this test does not certify lips, gingiva or untreated-tooth preservation. Those protections pass local regression; full app/device visual QA is still required.

Use the [acceptance script](TESTFLIGHT_ACCEPTANCE_V1_2026-10-02.md) and [20-run matrix](GENERATION_HARDENING_STAGE2_2026-10-02.md#r-exact-macro-stage-3-live-generation-matrix) for eventual clinician review. Record PASS/REVIEW/FAIL per case, inspect original/full-resolution final/overlay, and never infer clinical feasibility from cosmetic appeal alone.

## I. Allowance/refund/idempotency — PASS WITH STATED SCOPE

Hosted live generation consumed exactly one credit. A rapid identical request and a later reconnect retry returned 409 without a second paid call or balance change.

An isolated local handler used the **real staging auth/allowance database** and a deliberately failing fictional provider transport. It verified full refund and idempotent repeated refund with zero additional paid provider calls. Two concurrent distinct reservations consumed exactly two credits; exhausted balance and duplicate reservation were rejected; concurrent release restored the original balance. Seven checks passed.

The temporary three-credit server-side QA override was scoped to the disposable staging account, expired after one hour, and removed with account deletion. No fake subscription was added, no ordinary-user bypass was enabled, and no override remains from these tests. Actual StoreKit purchase/renewal/grace/restore accounting is pending.

## J. RevenueCat / StoreKit — APPLE CONFIGURATION CONNECTED; PURCHASE VALIDATION PENDING

RevenueCat project **SmileCompose** (`proja5f9a8da`) now has an App Store app (`appb4a1d5eb2d`) with bundle ID `uk.co.drvik.smilecompose`. The App Store Connect and In-App Purchase credentials both passed RevenueCat validation. The public Apple SDK key is configured in ignored `.env.local` and verified in the native bundle; no private Apple key is bundled.

| Item | Verified state |
| --- | --- |
| Entitlement | `pro`; Apple monthly/annual products attached |
| Offering | `default`, current |
| Monthly package | `$rc_monthly` → Apple `uk.co.drvik.smilecompose.pro.monthly`, ONE_MONTH, GBP 29.99 |
| Annual package | `$rc_annual` → Apple `uk.co.drvik.smilecompose.pro.annual`, ONE_YEAR, GBP 299.99 |
| Apple metadata | RevenueCat store state reported MISSING_METADATA, empty localizations/review information; dashboard metadata may have since changed and must be rechecked |
| Introductory trials | None reported in Apple; planned trials are not yet confirmed |
| Webhook | `SmileCompose staging sandbox`, sandbox only, App Store app filter, all events |
| Server webhook authentication | Random bearer header installed as staging `REVENUECAT_WEBHOOK_AUTH`; unauthorized request → 401, authenticated synthetic TEST without user → 200 ignored_unknown_user |
| Actual purchase/restore/renewal | Not tested; no purchase or fake subscription manufactured |

### Remaining owner steps

1. In [the staging webhook settings](https://app.revenuecat.com/projects/a5f9a8da/integrations/webhooks/whintgr253ab15b85), **General → Authorization header value** (directly below Webhook URL): paste the entire single line from ignored `.env.revenuecat-webhook.local`, including `Bearer `, and Save. RevenueCat's API cannot set this field. Do not put the credential in chat or Git. Actual RevenueCat delivery remains unverified until this is saved and Send test event passes.
2. Finish Apple product availability, metadata, review information and any intended introductory offers; verify current store state, then test purchase, restore, renewal and allowance accounting in Apple sandbox.
3. The historical Test Store annual product remains P1M; adjust separately if continuing Test Store testing. It does not change the correctly configured ONE_YEAR Apple product.
4. Apple-linked account deletion still needs server-only `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID=uk.co.drvik.smilecompose`, and matching Supabase Apple provider/callback configuration. Password-account deletion passes; Apple revocation remains unverified.

See [PAYMENTS_AUTH_SETUP.md](../PAYMENTS_AUTH_SETUP.md). No binary has been uploaded to Apple.

## K. Legal/privacy — manual review required

Exact outstanding labels and outdated factual wording are in [the legal/copy inventory](STAGE3_LEGAL_COPY_INVENTORY_2026-10-02.md). Current App Store check reports 23 privacy and 17 terms `data-required` occurrences. Each total includes one CSS selector; actual visible unresolved elements are 22 privacy and 16 terms, including the review banners and repeated contact label.

Owner variables: `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS`, `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`; company number/ICO registration as applicable. These alone do not resolve lawful bases, Article 9, roles, DPA, minor-patient policy, retention, transfers or commercial terms. Do not auto-set `LEGAL_REVIEW_COMPLETE`.

**Internal beta distinction:** legal placeholders are not a Swift compiler error. Apple can process an internal-only TestFlight upload without a public App Store submission, but that is not privacy/legal clearance. This repository's `SMILE_RELEASE_BUILD=1` guard deliberately refuses packaging while legal placeholders and the Test Store key remain. That guard was tested and remains enabled. Therefore this project's final archive/upload workflow is currently blocked; no approval to bypass it is inferred. Use synthetic fixtures until the patient-data basis/disclosures are approved. Model/runtime distribution obligations also require review (including the existing LGPL HEIC dependency).

Apple guidance: [internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers), [upload processing](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).

## L. iOS configuration

- App ID/display name: `uk.co.drvik.smilecompose` / SmileCompose. Widget: `uk.co.drvik.smilecompose.widget`.
- Both targets use automatic signing and team `7TPF7LT884`.
- App icon includes full-size default/dark/tinted assets; launch assets compile.
- Camera and Photos-add usage strings are present. System photo picker avoids broad library access.
- Privacy manifest is bundled; account-linked Photos/Health and other relevant data types are declared. Its stale explanatory comment is flagged separately.
- Export encryption flag is false for OS HTTPS use; answer Apple's questions against the final implementation.
- Custom `uk.co.drvik.smilecompose` auth callback is registered. Associated domains are not used and were not added.
- Sign-in session uses a device-only Keychain adapter. Patient stores excluded from backups; Complete Data Protection entitlement/configuration and App Switcher cover present.
- Native build points to staging API; no remote dev-server `server.url`. Debug overlay is off in production unless explicitly enabled with `NEXT_PUBLIC_SMILE_DEBUG=1`; do not set that for beta.
- No private key appeared in the verified client/native bundles. Environment files remain Git-ignored.

Physical privacy cover, file attributes after lock/unlock, Keychain persistence and permission/share flows still need hardware tests.

## M. Signing status — DEBUG DEVICE BUILD AND INSTALL PASSED

The initial automatic profile lacked Sign in with Apple and Data Protection. A signed Debug build with `-allowProvisioningUpdates -allowProvisioningDeviceRegistration` refreshed it and **BUILD SUCCEEDED**. The embedded profile was verified to include `com.apple.developer.applesignin = Default`, `com.apple.developer.default-data-protection = NSFileProtectionComplete`, and both physical device identifiers. Neither entitlement was removed.

The updated engineering app was installed successfully on Vikas' iPhone 17 Pro Max and Dr VIK's iPad Pro 11-inch M5. iPhone launch succeeded. Automatic iPad launch was blocked while the device was locked; the owner must unlock/open it. Physical terms/privacy acceptance and clinical QA remain owner checks. No signed distribution archive or TestFlight upload was performed.

The native bundle contains the current consent fix, verified staging API origin and Apple public SDK key. See [the device/generation follow-up](DEVICE_GENERATION_FIX_2026-10-02.md).

## N. Version / archive

Preserved marketing version **1.0**, build **1**, package **1.0.0**. The Release simulator bundle reports 1.0/1. App Store Connect build history was not accessible/checked. If build 1 has already been uploaded for this version, use the next unused increasing build number for **both targets**, rebuild and sync. Do not silently overwrite an existing uploaded build.

No `.xcarchive` or `.ipa` was created. The current native output is a production-optimized engineering bundle with legal release blockers, not a final TestFlight artifact.

## O. Final automated checks

| Check | Result |
| --- | --- |
| `npm run check:production` | PASS (includes lint, tests, production web build and verifier) |
| Full suite | **534 tests / 534 pass / 0 fail / 0 skipped / 0 cancelled** |
| ESLint | PASS, zero warnings |
| TypeScript | PASS |
| `npm run build` | PASS |
| Cloudflare bundling | PASS |
| Wrangler staging deployment | PASS; staging-only version `82b5d00a-1c62-42b0-aac9-63ab7c54277c` |
| Mocked local Worker runtime smoke | PASS; no paid AI |
| Hosted account/patient/storage/generation routes + native preflight | PASS; private access, auth gates and 204 native preflight |
| Native packaging → Capacitor sync → bundle verifier | PASS |
| Xcode Release simulator compile | **BUILD SUCCEEDED** |
| Release launch on iPhone 18 Pro Max / iPad Pro 11-inch M5 simulators, iOS 27 | PASS, fresh screenshots inspected; branding/start controls within screen |
| Signed Debug physical iOS device build and iPhone/iPad installation | **PASS**, refreshed profile includes both required capabilities |
| Release packaging guard | **Correctly blocked** by unresolved legal markers; Apple SDK key passes |
| App Store static readiness | **32/34 satisfied**, 2 owner-action categories, not release approval |
| Runtime npm audit | 0 known vulnerabilities |
| Full npm audit | 3 moderate, dev-only Capacitor CLI → xcode → uuid; 0 high/critical |

The full suite includes simulated multi-device and database policies; do not relabel those as live/physical checks. Two database migrations and two meaningful database regression tests were added; application UI/runtime code was not redesigned. Final regression ran after both fixes. Evidence logs, metadata and simulator screenshots are retained in ignored `output/stage3-evidence/`; no private keys or real patient fixtures are included there. The existing Node module-type warning in bundle inspection is non-fatal.

## P. Physical tests requiring the owner

Use the [numbered acceptance script](TESTFLIGHT_ACCEPTANCE_V1_2026-10-02.md): iPhone, iPad portrait/landscape, Safari and installed native beta. Include camera front/back and capture orientation, HEIC/nonstandard aspect ratios, full-photo framing/blur, map review/touch targets, comparison/overlay slider, share/cancel/export/reopen, case sync/account switching, airplane mode, force-close, background/resume, memory pressure and locked-device privacy/data protection.

The current simulator launches are not exhaustive flow, camera, safe-area, hardware security or clinical-output validation. Stage 2 responsive/model checks remain useful separate evidence; their instrumentation is not in the current production app.

## Q. Internal TestFlight upload checklist — perform later

1. Staging schema/storage/deployment and safe live API checks now pass. Complete physical sync, clinician generation QA, Auth callbacks/Apple sign-in, and remaining security/privacy review.
2. Finish RevenueCat App Store key/product mappings/sandbox setup, signing profiles and the repository's legal release guard. Rebuild final assets with **matching staging public keys**:

   ```sh
   cd "/Users/vik/Documents/New project/smile"
   npm run check:production
   npm run typecheck
   npm run check:app-store
   npm run ios:release
   npm run ios:open
   ```

3. App Store Connect → create/select SmileCompose, bundle `uk.co.drvik.smilecompose`. Confirm platform, name, primary language, SKU, app information and subscription prerequisites; retain the matching identifier.
4. Xcode: App scheme, Release Archive action, Any iOS Device/build-only destination; check 1.0/build 1 or the next unused build number.
5. Product → Archive. In Organizer, inspect signing and Generate Privacy Report. Validate the archive. Do not upload an old bundle or the simulator `.app`.
6. Distribute App → **TestFlight Internal Only** where offered; upload personally when ready. It is intended for internal groups and not public App Store review. [Apple beta archive guidance](https://developer.apple.com/tutorials/develop-in-swift/test-your-beta-app).
7. Wait for processing. Complete encryption/export-compliance questions truthfully if shown, using the actual binary; see [Apple beta compliance](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-export-compliance-information-for-beta-builds).
8. TestFlight → Internal Testing → create/select group; add the processed build and yourself/eligible App Store Connect internal testers. No external beta submission yet.
9. Install using TestFlight on iPhone and iPad; follow acceptance script and record failures before broadening the beta.

## R. Acceptance script

[TESTFLIGHT_ACCEPTANCE_V1_2026-10-02.md](TESTFLIGHT_ACCEPTANCE_V1_2026-10-02.md) contains the numbered first-install, core-case, precision/material, synchronization, patient output, account, device and failure tests, plus a per-generation PASS/REVIEW/FAIL record template.

## S. Remaining blockers / resume order

1. Save the staging webhook Authorization header and validate actual delivery; finish Apple product metadata/availability/introductory offers and sandbox purchase/restore tests. App Store credentials, public key and product mappings are connected. Historical annual Test Store duration is still wrong.
2. Signed distribution archive; Apple revocation secrets and Supabase callback/provider configuration. Signed Debug build and physical installation passed. Password auth/deletion works; Apple sign-in/deletion is untested.
3. Legal identity, professionally reviewed privacy/terms/DPA/DPIA/retention/transfers, stale disclosures and licensing review. The release guard remains enabled. Review/enable leaked-password protection and direct-storage cached URL behaviour; backup retention is unverified.
4. Physical-device acceptance, real iPhone→iPad→web sync and clinician visual QA of protected full-resolution outcomes. Auth email/link flows remain untested.
5. App Store Connect app/build history, unused build number, signed Archive and internal TestFlight upload remain manual. Nothing has been uploaded.

STAGING BACKEND: READY

PATIENT CLOUD SYNC: READY FOR PHYSICAL DEVICE TESTING

LIVE GENERATION: READY FOR HUMAN QA

IOS DEBUG DEVICE BUILD: READY; DISTRIBUTION RELEASE REMAINS BLOCKED

INTERNAL TESTFLIGHT: NOT READY

PUBLIC APP STORE RELEASE:
DO NOT ASSESS AS READY YET
