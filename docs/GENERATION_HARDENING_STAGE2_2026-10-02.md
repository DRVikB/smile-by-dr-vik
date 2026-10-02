# SmileCompose V1 — Macro Stage 2 handover

Completed locally on 2 October 2026. **No staging/production deployment, database migration deployment, TestFlight upload or paid AI generation was performed. Stop at Stage 2.**

This is an engineering handover. Pixel protection and responsive inference are tested; cosmetic quality, clinical accuracy and App Store/legal clearance are not established by these tests.

## A. Multi-tooth generation architecture

Single, 4, 6, 8, 10 and Custom selected-tooth restorative edits now share the mandatory protection path. Before a live paid request, the source photo must have a valid, current, clinician-confirmed Tooth Map containing every actively selected tooth. Incomplete, stale, unconfirmed, duplicate-numbered or degenerate selected boundaries block the request. Invisible/missing teeth must be removed from the selection or mapped appropriately.

The approved region is the union of individual selected outlines and their treatment-specific permitted influence regions. It is not a rectangular mouth selection. Known unselected regions are subtracted, including unnumbered detected regions. Masks remain clipped to the original inner mouth opening. Without a trustworthy opening, influence expansion is disabled.

The existing request-canvas guidance-mask path remains available through server configuration `SMILE_MASK_GUIDANCE=on`. It is not enabled by default: the current Gemini integration accepts an extra image as guidance, not a native enforced inpainting mask. Enabling it needs live quality/cost validation. Final protection is mandatory regardless of this option. Generation-result fingerprints include `precisionVersion: 2`, avoiding reuse of results from the previous protection policy.

## B. Flag inspection and decision

The old `PRECISION_FOR_MULTIPLE_TEETH=false` deliberately bypassed single-tooth compositing for normal multi-tooth designs, with a comment prioritising image quality until testing proved compositing better. The code reused the single-tooth infrastructure and returned a `standard` skip for multiple teeth. The repository does **not** establish that seams were previously measured or resolved; no such evidence is claimed.

Inspection found additional weaknesses: permissive partial-map selection, JPEG tolerance outside the region and influence expansion that could include neighbouring tissue. Those were addressed rather than merely enabling the flag. The compatibility export now reads `true`, but no executable policy branches on it. It is unnecessary as a runtime toggle; selected-tooth protection is a treatment policy. Alignment and Full-arch remain explicit separate paths. `FULL_ARCH_ARCH_COMPOSITE` remains **false**.

## C. Treatment-specific masks

| Treatment | Allowed change | Hard boundary |
| --- | --- | --- |
| Whitening / Shade only | Bounded median RGB shade transfer to original enamel pixels | Exact selected outlines; no generated geometry or texture copied |
| Single-shade or layered composite | Selected enamel plus small additive incisal/lateral influence | No cervical expansion; incisal expansion capped at 14% of outline height; protected neighbours and original mouth opening |
| Porcelain | More selected morphology/texture freedom | Incisal cap 20%; lateral cap 18%; same neighbour/tissue protection |
| Alignment | Existing visual movement concept | Face/lip and optional painted edit-area protections; no claim of per-tooth positional precision or orthodontic accuracy |
| Full-arch | Existing independent treatment path | Existing face/lip/edit-area safeguards; no per-tooth mask imposed; arch-composite flag unchanged |

Composite/porcelain influence beyond exact enamel is additionally restricted to dark, non-red source pixels, avoiding obvious unmapped enamel and gingiva. This conservative colour guard is not semantic tissue recognition. It may intentionally limit visible contour changes in bright gaps. Lower-tooth incisal expansion points upwards rather than towards the lower gingiva. Manual boundary correctness remains the clinician's responsibility.

## D. Compositing and verification

The final compositor copies original RGBA values outside the authorised region. Feathering occurs only narrowly inside its boundary. Known nonselected tooth outlines receive an additional protected margin. No whole-mouth blur is used.

Final protected images are encoded as lossless PNG and decoded again to verify the **actual saved output**, with zero tolerance outside the approved region. A verification failure rejects the result. This replaces the previous allowance for JPEG compression noise. Development-only masks/difference maps remain behind the debug path.

Actual browser and native Canvas tests used hostile candidates changing the entire image. For 4/6/8/10, every decoded PNG verified with zero changed pixels outside the authorised region. This guarantee is relative to the reviewed mask and decoded source photograph; it cannot establish that an incorrectly drawn mask follows real dental anatomy.

## E. SlimSAM and worker performance

- Classical detection is the default; Studio opening does not invoke SlimSAM automatically for normal presets.
- Single-tooth, Custom or explicit Review can request refinement when an unconfirmed classical map needs it. Confirmed/manual/refined maps are reused.
- A three-entry refinement cache keys on source fingerprint, map version, arch, mouth and tooth identities/outlines. Face analysis uses a six-entry in-memory cache. Both clear on account/workspace detach.
- Dedicated persistent workers hold SlimSAM ONNX sessions and MediaPipe CPU inference. Serial request IDs, scope leases, cancellation, timeouts and worker termination prevent old results from updating another case/account.
- Refinement transfers the mouth crop's RGBA buffer. Cancellation resets the worker; inferred results are checked again against the current workspace and case controller.
- The UI shows refining state and allows keeping the suggested map. Inference failure returns the classical map safely; generating still requires clinician review.

Measured local runtime, not a physical-device benchmark:

| Environment | Cold face analysis | SlimSAM refinement | UI 50 ms timer ticks during refinement |
| --- | ---: | ---: | ---: |
| Chromium browser | about 171 ms | about 5,075 ms | 102 |
| iPhone 18 Pro Max simulator, iOS 27, dark | 332 ms | 4,950 ms | 96 |
| iPhone 18 Pro Max simulator, iOS 27, light | 344 ms | 4,937 ms | 95 |
| iPad Pro 11 M5 simulator, iOS 27, light | 383 ms | 5,045 ms | 97 |

Cached browser refinement took approximately 1 ms. This work avoids repeated inference and blocking the UI; it does not claim to reduce a cold inference below five seconds. A forced Worker-construction failure returned the same nine-region classical map unchanged. Physical devices, memory pressure and background/resume must be tested in Stage 3.

## F. Runtime bundling

MediaPipe uses the local Face Landmarker `float16/1` task and classic SIMD CPU JS/WASM. SlimSAM's existing quantized ONNX models and ONNX WASM remain local. No unused GPU/no-SIMD/module MediaPipe variants were added. The face task SHA-256 is checked at build time:

`64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`

Native packaging includes the runtime assets directly. The web public-shell manifest and service worker now explicitly cache these model/worker assets after successful online preparation. Patient media/API responses never enter that shared cache. An unprepared offline first web visit still asks the user to reconnect.

HEIC decoding also needed a local worker: the existing package's default path uses JavaScript compilation and its CSP entry creates a blob worker. A build-time Acorn AST extractor materialises the CSP-compatible decoder at `/vision/heic-worker.js`, with the shared serial RPC adapter. Unexpected dependency packaging fails the build. Browser and both native simulators decoded the synthetic 256×384 HEIC fixture under `worker-src 'self'`.

Model provenance, licenses and notices are bundled under `public/models` and `public/model-notices.txt`. MediaPipe/face and SlimSAM have Apache-2.0 notices; ONNX Runtime has MIT; the pre-existing HEIC decoder dependency is LGPL-3.0 and retains its package license/source notice. Distribution obligations need legal review before App Store release; no licensing clearance is implied.

Primary references: [MediaPipe Web Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js), [SlimSAM model card](https://huggingface.co/Xenova/slimsam-77-uniform), [MediaPipe license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE), [ONNX Runtime license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE).

## G. Dependencies and audit

Next.js updated **16.2.0 → 16.3.8**, within the existing major; Wrangler **4.140.0 → 4.147.0**. Acorn **8.18.0** is now an explicit build-only dependency for the HEIC extractor. Lockfile platform/optional metadata is preserved; no unrelated major upgrade was made.

The [Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) includes the former version; the installed patch is beyond its fixed version.

Final `npm audit --omit=dev`: **0 vulnerabilities**. Full audit: **3 moderate**, all in the dev-only `@capacitor/cli → xcode → uuid` chain, corresponding to [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). No high/critical findings remain. No forced CLI downgrade/major replacement was applied for this build-tool advisory. This is a point-in-time npm audit, not proof of absence of all security flaws.

## H. CSP

Web header and web/native shell meta policies now include `script-src 'self' 'wasm-unsafe-eval'` plus SHA-256 hashes of the exact existing inline appearance/Next bootstrap scripts. `script-src-attr 'none'`, `worker-src 'self'`, restricted connections and existing object/frame/base restrictions apply. There is no general JavaScript `unsafe-eval`, no script `unsafe-inline` and no model-CDN allowlist. Inline **styles** remain necessary for the current UI.

Zod uses its supported `jitless` configuration, skipping even its caught `Function()` capability probe. Strict native testing initially caught that probe; after correction, both native runtime summaries report **zero CSP violations** while boot, appearance, MediaPipe, SlimSAM and HEIC all work. The local test server's `/api/generation-cost` 404 is an intentionally absent API handler, not a production/CSP failure; the full mocked Cloudflare API test passes separately.

## I. iOS Data Protection

The entitlement now requests `NSFileProtectionComplete` (Apple Class A) for application data. Existing WebKit storage roots and temporary export cache files are explicitly migrated to `.complete` at launch and when protected data becomes available; patient cache roots remain excluded from device backups. The already-existing device-only Keychain auth and App Switcher privacy cover remain intact.

This uses [Apple file Data Protection](https://support.apple.com/en-gb/guide/security/secb010e978a/web), **not application-level encryption**. Simulator compilation cannot verify a production provisioning profile, hardware-backed protection or WebKit's attributes on newly-created files. On a signed physical device, Stage 3 must inspect file protection and test unlock/restoration, including pending outbox work. Account cloud sync is separate from backup exclusion and remains present.

## J. Limited UX polish

- Photo-screen menu closes on outside pointer/touch and Escape; listeners are cleaned up.
- Full-arch controls now measure at least 44 CSS points in the browser, including Upper/Lower/Both, restoration and prosthetic gingiva. A later overriding 40-point CSS rule was found and fixed.
- Custom/single/review overlays use invisible 44-point hit regions with nearest-centre resolution where neighbouring regions overlap. Visible outlines remain unchanged. Keyboard review also works for unnumbered regions.
- Normal presets retain a clean photograph; Custom stays interactive, single-tooth stays highlighted, technical overlays remain debug-only. Copy now correctly describes reviewing multi-tooth boundaries and missing selected regions.
- Five illustrative photographic PNGs became quality-95 WebP at the same pixel dimensions. Their original PNGs and the unused app-icon source remain under `assets/photographic-sources`, outside the shipped public tree. Patient photography was not recompressed by this optimisation.

Screenshots checked at iPhone 390×844, iPad landscape 1024×768 and portrait 768×1024. This is limited responsive verification, not an exhaustive physical-device UI audit.

## K. Size

All numbers are raw uncompressed bytes, not App Store download estimates:

| Component | Bytes |
| --- | ---: |
| Final web client | 72,402,040 |
| Final native web content | 72,415,023 |
| Unsigned Debug simulator `.app` | 108,556,727 |
| Face task alone, newly bundled | 3,758,596 |
| Face worker + CPU JS/WASM, newly bundled | 12,234,716 |
| Local HEIC worker, relocated from the existing decoder package | 2,993,905 |
| Existing SlimSAM models and notices | 13,799,721 |
| Existing ONNX worker/runtime | 14,321,505 |
| Cloudflare worker bundle | 808,915 |

The five public photographs shrink **9,449,569 → 1,112,472 bytes**, saving **8,337,097 bytes**. Moving the unused icon source out of public saves another **1,727,088 bytes**. Newly bundled face task/runtime adds **15,993,312 bytes** before notices. HEIC is repackaged from an already-shipped dependency, not a wholly new decoder download. No clean comparable pre-stage total `.app` baseline is available in the already-dirty workspace, so a precise total installed-size delta is not claimed.

## L. Stage 2 file manifest

This workspace already contained extensive user/Stage 1 modifications. The following identifies Stage 2 changes rather than attributing the entire Git diff to this pass.

- Precision: `src/lib/toothMap/{protect,masks,shade}.ts`; `src/app/page.tsx`; `src/components/studio/DesignStudio.tsx`.
- Vision: `src/lib/vision/workerClient.ts`; `src/lib/toothMap/{samWorker,refineWorker,refinementPolicy,detect,sam}.ts`; `src/lib/face/{landmarks,faceWorker}.ts`; `src/components/toothMap/useToothMap.ts`.
- HEIC: `src/lib/heic.ts`, `src/lib/photos.ts`, `scripts/heic-worker.mjs`.
- Security/build: `scripts/{client-secrets,security-policy,verify-production,copy-ort,build-worker,build-native,check-app-store,verify-ios-bundle,offline-shell}.mjs`; `scripts/sites-worker.ts`; `src/server/securityHeaders.ts`; `public/sw.js`.
- Interpreted validation: `src/lib/zod.ts`, `src/lib/generation/schema.ts`, `src/lib/{caseLibrary,validation}.ts`.
- Native: `ios/App/App/{App.entitlements,AppDelegate.swift}`.
- UX: `src/components/AppShell.tsx`, `src/components/toothMap/{ToothMapPanel,ToothMapOverlay}.tsx`, `src/lib/toothMap/hitTargets.ts`, `src/app/{studio,toothmap,surfaces}.css`.
- Asset references: `src/lib/{photos,referenceImages,exampleImages,demoPreviews}.ts`, `src/components/onboarding/OnboardingVisuals.tsx`, `src/app/{globals,onboarding,surfaces}.css`, `scripts/render-widget-art.swift`; five public `.webp` photographs and original sources under `assets/photographic-sources`.
- Bundles/licenses: `public/models/face/*`, `public/models/slimsam/{README.md,LICENSE.txt}`, `public/models/{ONNX-RUNTIME-LICENSE.txt,HEIC-LICENSE.txt}`, `public/model-notices.txt`; generated ignored `public/vision/*` and `public/ort/*`.
- Dependencies/config: `package.json`, `package-lock.json`, `.gitignore`.
- Tests: `tests/{stage2-precision,vision-worker,production-security}.test.ts`, updated `tests/{tooth-map,offline-shell}.test.ts`, photographic URL fixture updates in `tests/{face,generation}.test.ts`.
- Handover: this document. Local runtime harnesses, screenshots and unsigned builds are under ignored `output/`; instrumentation is never included in the normal native/web bundle.

## M. Coverage added

35 tests added beyond the 489-test baseline: 16 precision, 10 worker/refinement, 8 production-security (including HEIC packaging and interpreted validation), and 1 offline runtime test. Three outdated single-tooth-only assertions were updated.

Coverage includes counts 4/6/8/10/Custom, exact shade anatomy, bounded morphology, lower incisal direction, neighbour/unmapped-enamel/gingiva/lip/face preservation, stale/unconfirmed/incomplete/invalid maps, separate alignment/full-arch policy, enlarged hit targets, refinement triggers/cache, cancellation/timeout/failure/stale-worker/account detach, intended public keys/private leaks, exact CSP hashes, HEIC worker packaging and offline runtime allowlisting.

## N–P. Final validation

| Check | Result |
| --- | --- |
| Full test suite | **524/524 pass; 0 failures** |
| Stage 1 cloud sync/private media/outbox/conflict/delete/preferred-design/migration/thumbnail suites | **PASS locally** |
| Account isolation, allowances/refunds, reports/export suites | **PASS** |
| TypeScript | **PASS** |
| ESLint, zero warnings | **PASS** |
| `npm run check:production`, production-style public configuration | **PASS** |
| Private-secret fixture inserted into real client output | **Correctly rejected**, fixture removed |
| Final `npm run build` and production verifier | **PASS** |
| Cloudflare build and mocked local runtime/API/CORS/duplicate test | **PASS**, no deployment |
| Native packaging, Capacitor sync and native bundle verifier | **PASS** |
| Xcode unsigned Debug iOS Simulator build | **BUILD SUCCEEDED** |
| Native runtime: both simulators | Local models, PNG protection, HEIC work; **0 CSP violations** |
| `npm run check:app-store` | **31/34 satisfied**, not submission-ready |

App Store blockers remain: 23 privacy-policy owner/legal items, 17 terms owner/legal items, and a production `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` beginning `appl_` instead of test configuration. The release build guard remains enabled. Server/private keys are not exposed in client code.

## Q. Known limitations

1. Reviewed masks protect pixels, not clinical truth. Classical/SlimSAM outlines need clinician confirmation, particularly crowded, missing, overlapping or poorly-lit teeth. Bright gap expansion can be conservatively refused.
2. Live AI aesthetic quality, seams, tooth length and material fidelity are not proven. No new paid image generation was run. Defaults/influence caps require Stage 3 clinical review.
3. Alignment and Full-arch remain illustrative separate paths with no selected-tooth guarantee. A photo cannot establish bite correction, occlusion or implant suitability.
4. Real-device memory pressure, locked-file protection, HEIC variants, cancellation/background/resume and hardware-dependent timing still need testing. Simulator success is not TestFlight/device certification.
5. Cloud regression is local automated/mocked validation. Stage 1 migrations, private bucket policy and cross-device live sync must be validated on staging before release.
6. Existing onboarding account copy still says patient cases stay on the device; Stage 1 now includes authenticated cloud sync. Align that existing disclosure and outstanding owner/legal documents before any public release.
7. Remaining dev-only dependency advisory and third-party distribution obligations are documented above. No legal/App Store acceptance guarantee is made.

## R. Exact Macro Stage 3 live-generation matrix

Use consented staging fixtures; compare original and decoded final export, review overlays at 100% and 50%, and record treatment/settings, cost, elapsed time, QA result and clinician assessment. Review a full image and a mouth close-up for every result. **Do not start this matrix in Stage 2.**

| Run | Fixture / selection | Treatment | Specific acceptance review |
| --- | --- | --- | --- |
| 1 | Full face, one central incisor | Composite | Only selected tooth changes; incisal length remains conservative; no seam |
| 2 | Full face, 4 upper teeth | Single-shade composite | Adjacent canines/lower teeth/gums unchanged; material looks flat without overlengthening |
| 3 | Full face, 6 upper teeth | Layered composite | Natural secondary anatomy/translucent edges; selected union seamless |
| 4 | Full face, 8 upper teeth | Composite | Premolars fit original smile opening; no extension through lip/gingiva |
| 5 | Full face, 10 upper teeth | Porcelain | Posterior outlines fully reviewed; glazed texture/morphology within allowed region |
| 6 | Close-up, asymmetric noncontiguous Custom selection | Mixed per-tooth intents, including Preserve | Gaps between selected regions and all nonselected teeth stay original |
| 7 | Full face, 6 teeth, Shade only | Whiten | Geometry, original anatomy, lips/gums unchanged; no excessive flattened white appearance |
| 8 | Same fixture/settings as run 7 | Bleach / Shade only | Shade distinct from Whiten; exact enamel geometry remains unchanged |
| 9 | Close-up, 4 teeth | Composite | Inspect conservative expansion and inside feather at full-resolution edge |
| 10 | Same reviewed map as run 9 | Porcelain | More morphology freedom without gingival/adjacent drift; inspect seams |
| 11 | Crowded teeth, reviewed individual numbers | Alignment only | Plausible visual movement; unchanged expression/lip opening; no orthodontic-accuracy claim |
| 12 | Crowded teeth, reviewed map | Composite without alignment | No hidden tooth movement/extra teeth; map corrections respected |
| 13 | Diastema, 4 or Custom teeth | Close gaps / Composite | Gap closure stays inside conservative permitted influence; no stretched incisors; document refused expansion if guard limits it |
| 14 | Missing lateral, corrected map and tooth plan | Relevant restorative concept | Correct numbering and selected visible regions; no automatic invented tooth or gum edits; missing unmapped selection blocked |
| 15 | Upper-only smile, full face | 6-tooth composite | No newly visible lower teeth, mouth opening or expression change |
| 16 | Lower teeth visible, Custom lower selection | Composite | Lower incisal direction correct; upper teeth untouched |
| 17 | Partial-edentulous appropriate fixture | Upper Full-arch zirconia | Separate path, no forced tooth-map precision; lower arch/lips preserved as far as existing safeguards allow |
| 18 | Appropriate Full-arch fixture | Lower / Both; provisional and zirconia | Distinguish restoration/material concepts; no implied implant/bite feasibility |
| 19 | Full face with glasses, hair/background | 8-tooth porcelain | Face/background pixel verification; compare mouth opening and natural facial appearance |
| 20 | Retractor/close-up without detected face | Reviewed Custom map | Exact source alignment, map-driven protection and explicit safe failure when map is unusable |

Repeat representative runs on signed iPhone and iPad in light/dark, portrait/landscape. Test cancel then switch case/account while inference is running; old results must not appear. Check offline prepared launch, fresh unprepared launch, review/confirm/redraw, export/reopen, locked/unlocked restoration, background/resume and repeated inference under memory pressure. Then test authenticated iPhone↔iPad↔web sync, conflicts, deletes, preferred designs and migration against the deployed staging schema/private storage policies. Evaluate guidance-mask off/on on the same fixture before choosing its V1 default.

## Readiness

MULTI-TOOTH PRECISION: READY FOR LIVE TESTING

UI RESPONSIVENESS: READY FOR DEVICE TESTING

RUNTIME MODEL DEPENDENCY: SELF-CONTAINED

SECURITY HARDENING: READY FOR STAGING

CLOUD SYNC REGRESSION: PASS

V1 ENGINEERING RELEASE CANDIDATE:
READY FOR MACRO STAGE 3

**Stop. No deployment authorised for this stage.**
