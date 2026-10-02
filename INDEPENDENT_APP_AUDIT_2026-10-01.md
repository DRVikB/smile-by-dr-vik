# SmileCompose — independent audit, 1 October 2026

## Conclusion

Claude's changes are substantially implemented, rather than just described in documents. This is now a Next.js/React application with a bundled Capacitor iOS app, Supabase accounts, RevenueCat subscriptions, private account-held reference cases, local patient consultation cases, structured clinical inputs, and an on-device tooth-map pipeline.

**The current working tree is not ready for a production release.** Its production build fails, production and staging backends differ, local deletion can report completion prematurely, and several anatomy-protection and clinical-accuracy claims exceed what is enforced. Native release configuration and legal documents also remain incomplete.

This was an audit, not a deployment or redesign. No live AI generation, patient upload, purchase, account deletion, or hosted mutation was performed. The existing uncommitted tooth-template edit was preserved.

## Scope and evidence

- Checkout: `/Users/vik/Documents/New project/smile`, HEAD `65b838b`, plus the existing edit in `src/lib/toothMap/template.ts`.
- Inspected implementation: generation services and providers; clinical prompts; tooth mapping, templates, masking and facial analysis; upload/camera pipelines; cases, exports and deletion; account, library and entitlement handlers; native plugins, capabilities and release scripts; security headers; legal configuration; deployment configuration.
- Read Claude's `APP_AUDIT_2026-10-01.md` as claims to verify, not as test evidence.
- Ran fresh automated checks and an isolated guest/demo browser session using Playwright WebKit. No changes were made to the user's browser profile.
- WebKit device emulation is not verification of a physical iPhone, installed Home Screen app, native camera, Keychain, Apple authentication, or StoreKit.

## Fresh check results

| Check | Result | Practical meaning |
| --- | --- | --- |
| `npm test` | **390/390 passed** | Includes unit/integration coverage and actual database migration/RLS checks through PGlite. Does not validate generated dental outcomes or real external provider integrations. |
| `npm run lint` | **Passed** | No lint failures. |
| `npm run typecheck` | **Failed** | Five missing-property errors in the tooth-map overlay. |
| `npm run build` | **Failed** | Next compiles, then fails TypeScript validation at the same overlay mismatch. Worker/native packaging is not completed by this run. |
| `npm run check:app-store` | **Failed; 28/33 satisfied** | Sign in with Apple entitlement missing; legal documents and release configuration need attention. This is a static check, not App Store approval. |
| `npm audit --omit=dev` | **One critical dependency advisory** | Installed Next.js is 16.3.5. Applicability is qualified below. |
| Secret-file Git checks | **Passed for checked files** | Only `.env.example` is tracked; `.env`, `.env.local`, `.env.production`, `.dev.vars` and checked private-key files are ignored. Not a historical secret scan. |
| Guest/demo WebKit flow | **Passed for exercised paths** | Onboarding without account, sample case, design review, generation splash, comparison, touch-sized overlay controls, share-image rendering, refresh recovery and saved comparison reopening. |

Framework/package manager: **Next.js 16.3.5 installed, React 19, TypeScript, npm/package-lock.json**. Native integration: **Capacitor 8.5.2**. Cloudflare hosts the API Worker; the native app bundles its UI and calls a configured hosted API origin.

## Release blockers and defects

### 1. P1 — current tooth-template edit breaks production build

`src/lib/toothMap/template.ts:156` now exposes `topLine` and `incisalArc` instead of `incisalLine` and `gingivalLine`. `src/components/toothMap/ToothMapOverlay.tsx:145–146` still reads the removed properties.

Both the fresh type check and production build fail. When the relevant proportion guides render with a fitted template, the missing `incisalLine` also presents a runtime failure path.

**Next action:** update the overlay to the intended new geometry, then check the actual guide placement and rerun the production build. Preserve the meaning of the new fields; do not merely rename unlike guides to silence TypeScript.

### 2. P1 — device deletion can finish before photographs are deleted

`src/lib/localData.ts:14` resolves its deletion promise on IndexedDB `onblocked`. An open connection in another tab can keep a database and its photographs readable while the deletion function reports success. Settings then reloads the page.

**Reproduced:** opened an isolated `fake-indexeddb` case database, stored an audit-only image placeholder, held its connection open, and called `deleteAllCases`. The function returned successfully and the record was still readable through the held connection. No patient data was used or deleted.

**Next action:** close owned connections, handle cross-tab `versionchange`, and report deletion complete only after `onsuccess`. A blocked operation needs a truthful pending/error state and a meaningful regression test.

### 3. P1 — production API is behind the current native/account implementation

Read-only probes returned:

| Route | Production `smile-by-dr-vik.drvik.workers.dev` | Configured staging `smile-by-dr-vik-staging.drvik.workers.dev` |
| --- | --- | --- |
| `/api/account/status` | 404 | 401, expected without authentication |
| `/api/case-library` | 404 | 401, expected without authentication |
| `/privacy.html`, `/terms.html` | 404 | 200 |
| Native generation CORS preflight | 405, no allow-origin | 204, `capacitor://localhost` allowed |

The local `.env.local` points the native build at **staging**, so the production mismatch does not establish that this locally configured native app is currently broken. Web requests use their own origin. The default native origin still points at production.

**Next action:** after the build/configuration blockers are resolved, explicitly align the release API origin, Worker version, database migrations and provider/account secrets. Probe authentication, library access and native CORS against the actual release endpoint. A 401 response proves route presence, not successful authenticated generation.

### 4. P1 — native capabilities and release configuration are incomplete

- `ios/App/App/App.entitlements` is empty, despite native Sign in with Apple being implemented and advertised.
- App and widget source use `group.uk.co.drvik.smilecompose`; no App Group entitlement was found. The widget target exists, but shared preferences need the capability and matching provisioning on both targets.
- The locally configured RevenueCat public SDK key is a **Test Store** key. Release packaging deliberately rejects this, which is a useful safeguard.
- Legal generation reports **40 open items**. Both legal-review flags remain false; release packaging deliberately blocks unresolved legal review.
- `check:app-store` does not load `.env.local`, so its missing-Supabase report is misleading for this checkout: both public Supabase variables are present locally. This does not prove release configuration exists.

**Next action:** configure capabilities/provisioning, production RevenueCat products and public SDK key, public legal identity/contact fields, and the documented review process. Test native sign-in, subscription purchase/restore, deletion and widget updates using an appropriately signed build. Static checks cannot certify legal compliance or approval. [Apple's current review guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy) remain the submission reference.

### 5. P2 — UI promises precise protection for multi-tooth designs, but masking is disabled there

`src/components/studio/DesignStudio.tsx:239` says “only the selected teeth can change.” The eight-tooth demo displayed this wording.

Actual implementation:

- `PRECISION_FOR_MULTIPLE_TEETH = false` in `src/lib/toothMap/protect.ts`.
- Standard multi-tooth requests skip precise tooth compositing.
- `FULL_ARCH_ARCH_COMPOSITE = false` in `src/lib/toothMap/arch.ts`.
- Face/lip protection and optional clinician-painted edit-area compositing still exist. They do not, by themselves, protect every gum margin or untreated tooth inside the mouth.
- Automatic tooth detection is explicitly for **upper teeth**. Lower-tooth treatment planning is broader than the automatic mapping capability.

**Next action:** immediately make the wording accurate. Before enabling more masking, evaluate real upper/lower clinical examples, edge additions, gap closure and alignment; an incorrect mask can itself damage the result. Require clinician review rather than representing prompt instructions as guarantees.

### 6. P2 — landscape comparison defaults contradict the no-crop requirement

`src/components/ZoomPan.tsx` calculates `fillScale` and resets the resting view to that scale, not to the scale that contains the whole photograph. At 1180×820, the portrait demo visibly loses the top and bottom of the original photograph. The photo file itself is not destructively cropped.

**Next action:** open patient photographs at contained scale 1 with a blurred backdrop; retain deliberate pinch/zoom for inspection. Treat whole-photo viewing separately from a mouth-focused close-up.

Evidence: `output/playwright/audit-ipad-landscape-overlay.png`. The browser resize matrix also included 390×844, 820×1180, 375×667 and 844×390; no horizontal page overflow was observed in the exercised preview/saved-view states.

### 7. P2 — network-error copy incorrectly guarantees no generation was counted

`src/services/ai/smileImageService.ts:38–44` uses “Your generation has not been counted” for network and client-timeout errors. However, the server can finish a generation and commit its allowance before the response is lost. Each retry creates a new request UUID; the client has no durable request-status/result recovery path.

**Next action:** distinguish confirmed pre-generation failures from an unknown outcome after submission. Persist a pending request ID and reconcile its status before offering a retry. Do not promise no allowance or provider charge when the response was merely lost.

Related reliability gap: the server retries allowance commit once, then logs failure and still returns the generated image; failed commits can later release a stale reservation. The consent audit insert is also best-effort. These paths need explicit recovery/monitoring, not silent loss of accounting or audit events.

### 8. P2 — export creation is labelled as patient sharing

`ShareSheet.makePreview()` records an export immediately after rendering, before Share/Save/Email is selected. The case viewer presents the history under “Shared with patient.”

**Reproduced:** made a demo preview, closed the sheet without sharing/saving, then reopened the case. A “Shared with patient” item was present.

**Next action:** label this as an export/prepared-document history, or separately record preparation and confirmed share actions. Even a completed share sheet does not establish patient receipt.

### 9. P2 — account deletion can leave external-provider records without surfacing it

`src/server/accountHandlers.ts:135–153` returns account-deletion success even if Apple authorization revocation or RevenueCat subscriber deletion fails. It does correctly stop if private account media cannot be deleted. The client ignores the returned cleanup flags.

**Next action:** provide retryable cleanup/reconciliation and preserve enough minimal operational state to finish it. Test forced provider failures. Avoid presenting all linked data as removed if cleanup is incomplete.

### 10. P2 — automated release verification contains false positives

`scripts/verify-production.mjs:41` collects every environment value whose name contains KEY/SECRET/TOKEN, including intentionally public Supabase anonymous and RevenueCat SDK keys, then flags them if found in a browser bundle. The source-name check correctly exempts these public keys; the value scan does not.

`scripts/check-app-store.mjs` reads only process environment, unlike the native build's environment-loading path. This explains the missing-Supabase action despite valid local public configuration.

**Next action:** distinguish provider-designated public identifiers from secrets in both scanning phases, share configuration loading, and add tests for both genuine private-key leaks and allowed public keys. This is not permission to expose Gemini/service-role/RevenueCat secret keys.

### 11. P2 — dependency maintenance needed; exploit not demonstrated

Installed Next.js 16.3.5 matches critical advisory GHSA-vcvr-r3jv-pc5j; the maintainer identifies 16.3.6 as patched. The documented issue concerns attacker-controlled SVG values passed into Node.js `next/og` `ImageResponse`. No `next/og`/`ImageResponse` use was found in this application's source, so this audit did **not** demonstrate that the app exposes the exploit. [Maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).

**Next action:** upgrade to a supported patched version and rerun the build/runtime checks.

## What has actually been implemented

| Area | Verified implementation | Limit |
| --- | --- | --- |
| Smile-design rules | Preserve original front-tooth length by default; shade-only, edge repair, gap closure and reshape have different permissions; tooth-specific changes override broad presets; material upgrades must not automatically lengthen/whiten. | Prompt rules, not measured outcome guarantees. |
| Clinical inputs | Clinician-supplied overbite/overjet, restorative-space assessment, constraints, patient priorities and smile-arc preference accompany generation. Limited/uncertain space blocks intended edge-height additions in the prompt. | No automatic bite diagnosis or reconstruction of unseen occlusal geometry. |
| Lip/smile arc | Preserve, lower-lip-guided, flatter and more-curved instructions; unclear lips preserve original arc; aesthetic preferences do not authorize hidden bite correction. | No calibrated curvature measurement driving deterministic restorative geometry. |
| Tooth map | Upper-tooth detection, numbering, clinician correction, selection, fitted templates and SlimSAM refinement are in source. | Generic segmentation plus heuristics; manual review required. Template/proportion lines are display geometry, not the AI's enforced output shape. |
| Anatomy protection | Face/lip lock, painted edit-area protection and single-tooth compositing. | Precise multi-tooth/full-arch masking disabled; face-model failure reduces protection and is surfaced. |
| Material comparison | Single-shade composite, layered composite and porcelain instructions and prepared demo images; multiple options and reuse of matching existing results. | Independent generations can differ in geometry. Material optics are illustrative, not calibrated resin/ceramic prediction. Demo settings do not simulate all requested changes. |
| Reference work | Private cloud reference upload, material/teeth/condition tags, owner-scoped access, matching references selected by the server, feedback and reference usage metadata. | Not model training. References influence style rather than guarantee geometry or reproducibility. |
| Cases | Local current-case persistence, grouped versions, favourites, archives, rename, 30-day Recently Deleted and permanent deletion controls. Saved comparisons reopen without a new generation. | Reopening is viewing/re-sharing saved pixels, not resuming that historical version in the design editor. Blocked database deletion defect remains. |
| Photos/camera | JPG/PNG/HEIC conversion, size limits, metadata-stripping canvas normalization, provider padding, output framing checks, front/back web camera and native still-photo camera/photo picker. Back is default; front preview/capture mirroring is implemented in both code paths. | Physical capture, HEIC orientation and denied/revoked permissions require real-device QA. Largest source dimension is reduced to 2048px. Display still defaults to fill zoom. |
| UI | Five design steps; compact preview with Share/Options; overlay slider/+/-; analysis; consultation mode; branded before/concept export and reviewed report; reveal video implementation. | New source tested in WebKit development mode, not a freshly packaged native production build. Generation-stage labels are presentation stages, not backend telemetry. |
| Accounts/billing | Supabase auth/profile/MFA plumbing; native Keychain session storage; RevenueCat/StoreKit integration; trial/allowance/rollover; server verified access and atomic reservations. | Real signed auth, purchases, webhooks and production reconciliation not exercised. Test Store key remains. |
| Local privacy | Patient cases in IndexedDB; native snapshot privacy cover; WebKit backup-exclusion code; export/delete controls; versioned consent tied to the photo. | No app-level encryption/biometric case lock found. Verify native backup exclusion on device. |
| Server privacy | Provider secrets server-side; versioned consent/header checks, bounded input, duplicate guard, account checks and no-store response handling; patient account/billing identifiers stripped before provider request. | Clinical notes and chosen reference photographs are sent for AI processing. Cloud account/library records are now part of the data model. |
| Native extras | Widget extension, Home Screen quick actions and native sharing/picker/plugins exist. | Widget App Group capability missing; source presence is not successful signed-device verification. |
| Future modules | Feature flags exist for STL, 3D design, jaw motion, face capture, Smile Motion and lab export. | These are disabled. Reveal video is a comparison animation, not a validated smile-motion simulation. |

## Clinical reliability and privacy boundaries

The strongest improvements are the conservative, conditional permissions and clearer clinician constraints. They directly address the previous tendency to lengthen already balanced central incisors. However, 390 passing tests do not show that Gemini obeys those rules on real patients.

Facial analysis measures facial landmarks and mouth-corner relationships; it explicitly does not measure dental midlines, incisal edges or gingival display. Millimetre estimates assume an average 11.7mm iris diameter. Report confidence bands are heuristics, not clinically validated probabilities. The clinician review step and caveats are useful and should remain.

The result-size check in `page.tsx:644` runs only when the photo has `framing` metadata. A normal uploaded photo lacks that camera-guide metadata, so it does not receive the same check. This is especially relevant to the reported long-incisor failures.

Your previously selected privacy model was local case storage with Google processing after patient permission. Consultation cases still follow a local storage model, but the new **finished-case reference library stores images in the cloud when an account is configured and signed in**. The app discloses this and requests library authority. It is an actual change to the data model and must be covered by the final documents and permissions; “all photographs stay on device” would no longer be accurate.

MediaPipe face analysis runs locally, but its runtime/model are fetched from jsDelivr and Google Storage. SlimSAM/ONNX assets are bundled. First-use offline face analysis therefore is not guaranteed. Both face detection and SAM work are initiated on the main browser thread; no performance guarantee for older iPads has been established.

The CSP restricts network destinations and framing but lacks `script-src`/`default-src`. It provides limited script-injection mitigation. This is a hardening opportunity, not a demonstrated injection exploit.

## Browser evidence and limitations

Screenshots are in `output/playwright/`:

- `audit-iphone-studio.png` — compact Studio at 390×664 browser content area.
- `audit-iphone-preview.png` — preview at 390×844.
- `audit-ipad-landscape-overlay.png` — landscape preview at 1180×820; demonstrates default fill zoom.
- `audit-ipad-portrait.png` — portrait at 820×1180.
- `audit-ipad-share.png` — branded before/concept export preview.
- `audit-small-iphone-saved-case.png` — saved comparison at 375×667.
- `audit-iphone-landscape-saved.png` — saved comparison at 844×390.

Overlay +/- changed 50→60→50 and all three overlay controls measured 44px high at the checked iPad size. Saved comparison, active-case refresh recovery and before/concept image rendering worked. No patient image was used. MediaPipe printed informational native-model messages as console errors/warnings; these were not evidence of a failed generation.

Not exercised: live paid generation, clinical outcome accuracy, production signed-in account/library flows, StoreKit/RevenueCat sandbox transactions, Apple sign-in/revocation, physical camera/photo picker, native backup behavior, real share destinations, video recording/export, installed standalone status-bar behavior, oldest-supported iOS and long-session memory/storage pressure. Existing booted simulators were not treated as fresh-build evidence because the current production build is blocked.

## Recommended order

1. Resolve the template/overlay build mismatch and make both release-check scripts trustworthy.
2. Fix blocked deletion and the inaccurate protection/charge/share-history messages.
3. Restore whole-photo default framing with blurred padding.
4. Patch dependencies, finish capabilities/configuration and align production with the validated staging backend.
5. Validate signed authentication, purchases, external deletion cleanup and live generation using synthetic/reference cases.
6. Run a clinician-scored outcome set: already-balanced smiles, worn/chipped edges, small/large gaps, deep bite, flat/curved lips, visible lower teeth, recession/uneven gums and poor/oblique photographs, across all three materials. Record protected-anatomy changes and incisor-length drift against the original. Do not add a paid second AI pass until this establishes its benefit.
7. Complete physical iPhone/iPad QA and professional review of the current data flows before an App Store submission.

Finally, update `README.md`: it still says there is no authentication/billing/server upload architecture and describes OpenAI and symmetric upper-only selection. Those statements no longer describe this checkout. Keep the older audits as dated historical records; they should not be used as current release evidence.
