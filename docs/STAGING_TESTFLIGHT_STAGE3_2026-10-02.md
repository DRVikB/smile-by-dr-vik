# SmileCompose V1 — Stage 3 handover

Date: 2 October 2026. This is an engineering handover, not legal approval or certification of clinical accuracy.

**Completed:** local release checkpoint, regression/build checks, local Worker runtime checks, Capacitor sync, Release simulator compilation and launch, configuration/signing audit, and the testing/upload instructions below.

**Deferred by the owner:** Supabase login/project confirmation, RevenueCat setup, and dependent staging activation/live validation. No remote deployment, migration, test account creation, patient upload, paid generation or Apple upload was performed. Production was not changed. App functionality and design were not changed in this pass.

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

This handover and the environment documentation are separate preparation changes after the RC tag. The tag is not moved or amended. It is not a claim that the RC has been deployed.

## A. Staging database — NOT READY

Supabase CLI access was unavailable (`Access token not provided`). Local configuration uses project ref `wukcqlpuzkzwxmdkotfg`; its project name and separation from production are unconfirmed. No migrations were applied. Do not assume this is staging merely because the app API origin points to the staging Worker.

When ready, the first user step is:

```sh
cd "/Users/vik/Documents/New project/smile"
npx --yes supabase login
```

Then confirm the dedicated staging project name/ref. After confirmation, the operator must inspect the linked target and migration history, review `db push --dry-run`, and apply the complete migration chain to that project only. The Stage 1 migration is `supabase/migrations/20261002093305_patient_case_sync.sql`; it needs the earlier account/library infrastructure as well.

Expected schema: `patient_cases`, `patient_case_assets`, `patient_case_mutations`, `patient_case_cleanup_jobs`, owner RLS, revision/idempotency RPCs, and the private `patient-cases` bucket. Local PGlite tests pass; remote migration, grants and policy existence are not verified. Do not use a remote `db reset`.

Reference: [Supabase database migrations](https://supabase.com/docs/guides/local-development/database-migrations).

## B. Staging storage — NOT READY

The code/migration defines private patient media, owned metadata, immutable checksummed assets and retryable cleanup. This was verified locally, not on the hosted bucket. The bucket's actual privacy, policy configuration, storage region, backup retention and deletion behaviour are unverified.

Live test plan, using a synthetic PNG only:

1. Create A's case, authorise a pending asset through the API, and upload bytes with the declared size/checksum.
2. Fetch as A; compare checksum. Request a short-lived signed URL as A and verify its expiry.
3. Fetch case/thumbnail/asset as B and through unauthenticated/public paths; access must be denied.
4. Attempt B-owned metadata pointing to A's object, a forged owner/case/kind path, and an unknown asset ID; all must fail.
5. Retry identical upload; it must keep one confirmed immutable asset. A mismatched checksum must fail.
6. Permanently delete the case; verify the tombstone and object removal. Simulate a cleanup failure in the isolated test environment, then retry; pending cleanup must survive.

Private storage and access policy guidance: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## C. Staging backend — NOT READY

Cloudflare OAuth and access to account **DrVik** work. Target: `smile-by-dr-vik-staging`, URL `https://smile-by-dr-vik-staging.drvik.workers.dev`. The current RC bundles successfully and Wrangler staging dry-run passes, including `REQUEST_GUARD` Durable Object and assets.

The staging secret *names* already present are `SMILE_GEMINI_API_KEY`, `SMILE_GEMINI_DATA_TERMS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REVENUECAT_SECRET_API_KEY`. Values were not printed, and their validity/project mapping was not verified. `REVENUECAT_WEBHOOK_AUTH` and Apple revocation secrets were absent from that list.

Current config is **Gemini**, model `gemini-3.1-flash-image`, not mock. Observability is disabled. Each environment needs its own bindings/secrets; see [Cloudflare environments](https://developers.cloudflare.com/workers/wrangler/configuration/#environments).

Once the dedicated staging project is confirmed and migrated, build with the matching public configuration and deploy **only**:

```sh
cd "/Users/vik/Documents/New project/smile"
npm run build:cloudflare
npx wrangler deploy --env staging
```

Do not use `npm run deploy:cloudflare` here: it targets production.

## D. Staging web — NOT READY

The web build passes and is bundled with the Worker assets. Web API requests are relative; native requests use `NEXT_PUBLIC_SMILE_API_ORIGIN`. The local native build uses the staging API origin. The staging web shell is not updated to this RC; its account project still requires verification before publishing.

Build-time public configuration must match the verified staging project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SMILE_API_ORIGIN=https://smile-by-dr-vik-staging.drvik.workers.dev`
- `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` (real App Store public `appl_…` key for native)

No server secret belongs in a `NEXT_PUBLIC_` variable. Public Supabase keys are designed for client use with RLS; they are not service-role keys. The current bundle still contains a RevenueCat Test Store public key, so it is an engineering build, not a final beta.

## E. API smoke results

| Endpoint/check | Existing remote staging (read only) | Current local Worker |
| --- | --- | --- |
| `/api/account/status` | 401 `auth_required` | 503 account configuration unavailable; route exists |
| `/api/case-library` | 401 `auth_required` | 503 unavailable; route exists |
| `/api/patient-cases` | **404** | 503 unavailable; route exists |
| Patient-case detail / asset routes | Not exercised remotely | 503 unavailable; routes exist, `no-store` |
| Native patient API preflight | Not revalidated remotely | 204, exact `capacitor://localhost` origin; required methods/headers |
| Unrelated-origin preflight | Not exercised remotely | 403 |
| Mock generation + duplicate requests | No generation invoked | One 200, concurrent/repeated duplicate 409 |
| Page/PWA/icons/service worker | Not revalidated remotely | Pass; GET/HEAD 200, unknown route 404, generation GET 405 |

Local requests intentionally have no Supabase/RevenueCat secrets and fail closed. Browser requests to the web's own origin do not need CORS preflight; only the packaged native origin is allowed cross-origin. `capacitor://localhost` is the on-device bundled WebView origin, **not a localhost API dependency**. Development-only CLI/test URLs remain local by design.

The original remote patient-case 404 is **not resolved yet** because deployment is deferred.

## F. Account/authentication/isolation

Local tests pass for auth requirements, account namespaces, stale response prevention and owner isolation. Live account creation/email/Apple sign-in, session persistence, logout/switch, Supabase RLS and remote thumbnail/draft/outbox isolation remain **NOT RUN**. Create disposable A/B accounts only after staging identity is confirmed. Never use production accounts for destructive acceptance tests.

## G. Cloud sync

Local regression passes for UUID stability, revisions, idempotency, binary upload/checksum, thumbnail-on-demand, preferred smile, Tooth Map, analysis, restart/offline outbox, conflicts/local-copy preservation, remote tombstones and cleanup retry. These use PGlite, fake IndexedDB and test transports; they are not live Supabase or physical-device proof.

For live validation, create/edit/fetch the same UUID; advance to revision 8; send a revision-7 update and require HTTP 409 without losing local work. Exercise deletion and reconnection from a second session. Every scenario is still pending remotely.

## H. Live generation

**No paid generation was run; 0 generations spent in this pass.** Current backend activation, real Google credentials/data terms and live allowances are unverified. Use the [acceptance script](TESTFLIGHT_ACCEPTANCE_V1_2026-10-02.md) and Stage 2's [20-run visual matrix](GENERATION_HARDENING_STAGE2_2026-10-02.md#r-exact-macro-stage-3-live-generation-matrix). Start with one synthetic reviewed 6-tooth case; assess before spending on the full matrix.

Precision acceptance requires selected teeth to change appropriately while all unselected teeth, gingiva, lips, expression, mouth width/opening, head position and source framing stay preserved, without mask seams. Review the original and full-resolution final PNG as well as the overlay. A pixel comparison supports review; it does not establish clinical feasibility or cosmetic accuracy. Alignment/full-arch are separate concept paths, not selected-tooth precision guarantees.

## I. Allowance/refund/idempotency

Local tests pass for commit on success, refund on provider failure, reservation locking and exhausted allowance rejection. The mocked local Worker proves duplicate protection in the runtime. Real staging ledger/RevenueCat integration and reconnect/concurrent accounting remain **NOT RUN**.

After activation, record balance/ledger before one success (one generation consumed), then test a controlled provider failure (refund), retries and double taps (no second charge). Prefer isolated stub-provider integration checks for failure/concurrency instead of repeatedly spending real AI generations. Never weaken entitlement checks or expose a mock bypass on the hosted beta.

## J. RevenueCat / StoreKit — manual actions deferred

| Configuration | Expected |
| --- | --- |
| Project/App | SmileCompose / App Store app |
| Bundle identifier | `uk.co.drvik.smilecompose` |
| Entitlement | `pro` |
| Monthly product | `uk.co.drvik.smilecompose.pro.monthly` |
| Annual product | `uk.co.drvik.smilecompose.pro.annual` |
| Current offering | `default` |
| Packages | `$rc_monthly` → monthly; `$rc_annual` → annual |
| Native public SDK variable | `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` (`appl_…`) |
| Server secret | `REVENUECAT_SECRET_API_KEY` |
| Staging webhook | `https://smile-by-dr-vik-staging.drvik.workers.dev/api/webhooks/revenuecat` |
| Webhook authorization | Exact configured value in server-only `REVENUECAT_WEBHOOK_AUTH` |
| Sandbox handling | `REVENUECAT_ALLOW_SANDBOX` defaults true; needed for TestFlight |

**Not verified remotely:** existence/status of either StoreKit product, product mappings, entitlement/offering, agreements/tax/banking, price/trial setup, Apple IAP key integration or webhook delivery. The current iOS key starts `test_`, and cannot be used as the Apple SDK key.

When ready: RevenueCat → SmileCompose → API keys → App Store app → public `appl_…` key; place it in `.env.local`, not chat. Configure products/offering and sandbox webhook in the dashboards. Apple IAP `.p8`, issuer/key ID belong in RevenueCat's secure App Store configuration, never the browser bundle. See [PAYMENTS_AUTH_SETUP.md](../PAYMENTS_AUTH_SETUP.md) and [RevenueCat Apple sandbox testing](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store).

No fake subscription or fabricated key was added. Test mode remains a clearly labelled bundled synthetic demo with no real AI, not a free-credit bypass for real patient generation.

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

## M. Signing status — NOT READY

A valid Apple Development identity for the selected team exists. However, the signed generic iOS device build failed (exit 65): the profile `iOS Team Provisioning Profile: uk.co.drvik.smilecompose` lacks **Data Protection**, **Sign In with Apple** and their entitlements. Automatic signing is configured; it has **not** succeeded with the current profile. No distribution identity/archive was verified.

Manual steps when ready:

1. Open Xcode via `npm run ios:open`; Settings → Accounts → sign in and select the paid team.
2. Apple Developer → Certificates, Identifiers & Profiles → Identifiers → `uk.co.drvik.smilecompose`: enable Sign in with Apple and Data Protection (Complete). Confirm both capabilities appear for App in Xcode. Do not remove entitlements to force a build.
3. Enable automatic signing for App and SmileComposeWidgetExtension, select team `7TPF7LT884`, and let Xcode refresh/register profiles. A capability change affects provisioning profiles: [Apple capability guidance](https://developer.apple.com/help/account/identifiers/enable-app-capabilities/).
4. Connect/unlock/trust each device, enable Developer Mode if requested, choose it in Xcode and build. Accept any dashboard agreement or provisioning prompt personally.
5. Re-run the signed build after profile refresh; confirm success before calling device/archive signing ready.

The paired iPad Pro 11-inch (M5) and iPhone 17 Pro Max are available locally. Neither physical app install nor physical acceptance testing was performed. App Groups are optional for personalized widget greeting and are not required for patient sync; do not add unrelated capabilities merely to fix signing.

## N. Version / archive

Preserved marketing version **1.0**, build **1**, package **1.0.0**. The Release simulator bundle reports 1.0/1. App Store Connect build history was not accessible/checked. If build 1 has already been uploaded for this version, use the next unused increasing build number for **both targets**, rebuild and sync. Do not silently overwrite an existing uploaded build.

No `.xcarchive` or `.ipa` was created. The current native output is a production-optimized engineering bundle with test-key/legal blockers, not a final TestFlight artifact.

## O. Final automated checks

| Check | Result |
| --- | --- |
| `npm run check:production` | PASS (includes lint, tests, production web build and verifier) |
| Full suite | **524 tests / 524 pass / 0 fail / 0 skipped / 0 cancelled** |
| ESLint | PASS, zero warnings |
| TypeScript | PASS |
| `npm run build` | PASS |
| Cloudflare bundling | PASS |
| Wrangler staging deploy dry-run | PASS; no deployment |
| Mocked local Worker runtime smoke | PASS; no paid AI |
| Local current account/patient routes + native preflight | PASS, fail-closed unavailable responses / 204 native preflight |
| Native packaging → Capacitor sync → bundle verifier | PASS |
| Xcode Release simulator compile | **BUILD SUCCEEDED** |
| Release launch on iPhone 18 Pro Max / iPad Pro 11-inch M5 simulators, iOS 27 | PASS, fresh screenshots inspected; branding/start controls within screen |
| Signed Debug generic iOS device build | **FAIL**, missing provisioning capabilities above |
| Release packaging guard | **Correctly blocked** by Test Store key and legal markers |
| App Store static readiness | **31/34 satisfied**, 3 owner-action categories, not release approval |
| Runtime npm audit | 0 known vulnerabilities |
| Full npm audit | 3 moderate, dev-only Capacitor CLI → xcode → uuid; 0 high/critical |

The full suite includes simulated multi-device and database policies; do not relabel those as live/physical checks. No app-code change was made after regression. Only preparation documentation was changed. Evidence logs, metadata and simulator screenshots are retained in ignored `output/stage3-evidence/`; no private keys or real patient fixtures are included there. The existing Node module-type warning in bundle inspection is non-fatal.

## P. Physical tests requiring the owner

Use the [numbered acceptance script](TESTFLIGHT_ACCEPTANCE_V1_2026-10-02.md): iPhone, iPad portrait/landscape, Safari and installed native beta. Include camera front/back and capture orientation, HEIC/nonstandard aspect ratios, full-photo framing/blur, map review/touch targets, comparison/overlay slider, share/cancel/export/reopen, case sync/account switching, airplane mode, force-close, background/resume, memory pressure and locked-device privacy/data protection.

The current simulator launches are not exhaustive flow, camera, safe-area, hardware security or clinical-output validation. Stage 2 responsive/model checks remain useful separate evidence; their instrumentation is not in the current production app.

## Q. Internal TestFlight upload checklist — perform later

1. Resolve/confirm staging schema, storage, secrets and deployment; pass live API/account/sync checks.
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

1. Supabase CLI login and explicit dedicated-staging project identity; migrations/private bucket/live owner-policy verification.
2. Matching verified Worker secrets/public build configuration; deploy current staging backend/web and resolve remote `/api/patient-cases` 404.
3. Safe staging A/B auth/sync/private asset/allowance/live generation validation.
4. RevenueCat `appl_…` key, real StoreKit product mappings, webhook authorization and sandbox testing.
5. Apple capability/profile refresh and successful signed device/archive build; Apple revocation secrets for account deletion and Auth callback/provider configuration.
6. Legal identity, professionally reviewed privacy/terms/DPA/DPIA/retention/transfers, stale disclosures and licensing review; preserve the release guard.
7. Physical-device acceptance and clinician visual QA. App Store Connect version/build history and actual upload remain manual.

STAGING BACKEND: NOT READY

PATIENT CLOUD SYNC: NOT READY

LIVE GENERATION: NOT READY

IOS BUILD: NOT READY

INTERNAL TESTFLIGHT: NOT READY

PUBLIC APP STORE RELEASE:
DO NOT ASSESS AS READY YET
