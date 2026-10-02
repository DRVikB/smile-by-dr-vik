# SmileCompose V1 — focused stabilisation handover

Checkpoint: 2–3 October 2026, local Mac QA. **No deployment, push, merge, device install, TestFlight upload or Apple submission in this pass.** This is the single current handover; earlier readiness documents describe earlier builds.

## 1. WHAT WAS ACTUALLY FIXED

- **PASS — saved-case recovery:** automatic presentation-media loading, separate cache availability and cloud/outbox status, visible retry, reconnect/foreground recovery, deduplicated downloads, and sign-in recovery for an expired media session. Local comparison/export stays available during pending or failed upload.
- **PASS — truthful missing-media classification:** a genuinely absent object differs from a storage outage, missing bucket or authorization failure. This server change is local only and has **not** been deployed.
- **PASS — comparison presentation:** analysis opens deliberately, basic guides are the default analysis set, detailed values move into a collapsible panel outside the photograph, and each new result resets analysis visibility. Divider and drag coordinates now use the contained photograph rather than blurred margins.
- **PASS — allowance/loading wording:** removed unconditional “not counted”/“returned” claims and elapsed-time-based fake generation stages/percentages. Removed the tooth chart’s unconditional preservation promise; it now distinguishes AI instructions from confirmed-boundary compositing.
- **PASS — regression reliability:** reproduced the sync-conflict test’s scheduling race and made its stale/offline editing precondition explicit. Added real decoded-image recovery coverage, not only status assertions.

## 2. WHAT WAS TESTED — environment, commit and evidence

- Branch: `release/v1-device-test`. Starting commit: `eacc0c937168a6dcb7fa10beb553fdc2c39cc78e`. Code checkpoint: `33bad84` plus the **preserved, pre-existing uncommitted generation diagnostics** listed below. The build is not represented as a clean commit-only build.
- **PASS:** final Node regression suite **566/566**, TypeScript, ESLint, production web/native packaging, Capacitor sync, native bundle checks, and development-signed **Xcode Release / iphoneos** build. Exact final counts/logs are in `output/v1-ui-audit/evidence/final-*`.
- **PASS:** local PGlite + separate IndexedDB repositories for retry, offline restart, cloud-only media, expired auth, missing object, account isolation, immutable upload IDs, deletion/tombstones and conflicts. A full demo JPEG recovered on another repository and after offline restart decoded to identical pixels.
- **PASS, limited scope:** browser portrait emulation of the sample consultation flow; 13 synthetic case-media states; touch overlay adjustment; Present Mode; preview/report preparation. These occurred before the final viewport/auth/copy refinements. See limitations below.
- **PASS, read-only evidence:** staging Supabase bucket/policies/aggregate object checks; RevenueCat App Store app, offerings, entitlement and product store state; staging webhook aggregate. No commercial configuration was changed.
- Bundle `uk.co.drvik.smilecompose`, version `1.0`, build `1`, team `7TPF7LT884`. Staging backend `https://smile-by-dr-vik-staging.drvik.workers.dev`; Supabase `smilecompose-staging` / `wukcqlpuzkzwxmdkotfg`. Native public SDK key is App Store type; no key values are included here.
- Signed app has Apple sign-in and Complete Data Protection entitlements, camera/photo-save purposes, privacy manifest, no native remote dev-server URL. Packaged web files matched the build byte for byte. See `output/v1-ui-audit/signed-build-verification.json`.

## 3. WHAT STILL FAILS

- **FAIL — recoverable paid delivery:** a server-successful, charged generation can still be lost if device alignment/compositing or subsequent persistence fails. There is no durable server result retrieval/reprocessing path. Copy is corrected; the lifecycle is not repaired.
- **FAIL — broad precision expectation:** quick multi-tooth concepts do not pixel-protect each unselected tooth. A mouth mask does not establish anatomically accurate gum protection. Close-up, alignment and full-arch limitations are detailed below.
- **FAIL — distribution gate:** `SMILE_RELEASE_BUILD=1` correctly rejects the unresolved legal pages: 23 privacy items and 17 terms items. The direct-device development-signed build passing does not override this gate.
- **FAIL — subscription metadata readiness:** both App Store subscription products report `MISSING_METADATA` / `needs_action`. Configured credentials and mappings do not prove a purchase works.

## 4. WHAT WAS NOT TESTED / BLOCKED

- **NOT TESTED — original affected case:** its reference/time has been requested but not supplied. No original case was deleted, reset, repaired or regenerated. Aggregate cloud inspection cannot identify its exact failure.
- **NOT TESTED — current live generation:** **0 new live provider requests in this pass. Total used earlier in the overnight job is UNKNOWN.** No remaining portion of the 15-request cap was assumed; no additional patient images were sent to a service.
- **NOT TESTED — final interactive iPhone/iPad layouts:** browser access was explicitly declined during QA. Inspection stopped; no alternate browser or indirect workaround was used. Simulator interaction was unavailable. No physical-device tests were performed in this pass.
- **NOT TESTED — normal-user live staging recovery:** staging SQL was read-only aggregate inspection. It is not substituted for an owner-authenticated end-to-end download test.
- **NOT TESTED — physical Apple login/linking, inbox email delivery, live purchase/restore, real subscription webhook, Apple revocation/account deletion.** Existing implementation/tests are not evidence of these external outcomes.
- Browser fixture state checks originally used a PNG that matched bytes but failed full decoding. It has been replaced. Those earlier checks count only as UI-state evidence; the later full-JPEG repository test supplies decoded-image evidence.

## 5. WHAT NEEDS VISUAL REVIEW

- **HUMAN REVIEW REQUIRED:** final comparison divider at fit/zoom and after rotation on iPhone and iPad; panel height and touch targets; no mouth obstruction.
- **HUMAN REVIEW REQUIRED:** lips, expression, mouth opening/width, gingiva, tooth proportions, selected boundaries, neighbouring teeth, crop and artefacts for every concept. Gingival preservation is **not guaranteed**.
- Private review pack: `output/v1-ui-audit/generation-review/index.html`. It contains original, historical raw provider result and historical compositor result for six local fixtures. Historical masks were not saved; the fourth panel is explicitly labelled **pixel-difference overlay, not an edit/anatomical mask**. These are not fresh current-build outputs.
- Before/after UI images: `output/v1-ui-audit/05-comparison-before.png`, `06-analysis-before.png`, `11-comparison-after.png`, `12-analysis-basic-after.png`, `13-analysis-details-after.png`. The “after” screenshots establish the panel changes, **not** the later fitted-viewport fix. `15-present-mode.png` and `16-preview-export.png` show the sample patient presentation/export.
- All images and detailed local evidence remain git-ignored. No identifiable screenshot was uploaded to a design service.

## 6. EXACT NEXT ACTION FOR THE OWNER

1. Give the reference or approximate creation time of the case that showed unavailable images. Preserve its existing copies.
2. In Xcode open `ios/App/App.xcodeproj`; select **App → Edit Scheme → Run → Release**. In **Signing & Capabilities**, use **Automatically manage signing**, team **VIKAS BAJAJ / 7TPF7LT884**. Select the connected, unlocked iPhone, then **Product → Run**. Do not Archive/Distribute. Use the same sequence for iPad afterwards. Enable Developer Mode/trust only if the device prompts.
3. Run the short acceptance checklist at the end using approved disposable content. If it fails, stop at that failure and collect the private request/stage diagnostic. Do not delete the case or repeatedly spend generations retrying.

---

## Priority 1 — saved cases must reopen reliably

### Reproduction and root cause

The previous CaseLog made one `readLogMedia` request, converted **every** rejection to `null`, then displayed “The saved images are unavailable on this device.” Its local detail state did not recover when sync completed. Buttons depended on that failed one-shot result. This collapses expired auth, temporary transfer failure and actual absence into one permanent-looking state.

The repository already stores stable asset IDs and a durable upload outbox. It does not persist expiring signed URLs for patient-case media. Case Library summaries already avoid full-resolution downloads. These mechanisms were reused.

Additional confirmed distinctions:

- The storage adapter previously returned `null` for any SDK download error; it now reserves that outcome for missing-object responses.
- Confirmed metadata with absent object bytes now produces `media_missing` / 404; temporary service failures remain retryable.
- Client 401 during download now offers sign-in recovery. It does not describe the case as missing.
- A missing optional editable draft mask does not prevent opening the saved presentation pair.

**The exact original reported case cause is NOT ESTABLISHED.** The reproduced defects explain how failures become unrecoverable-looking, not which upstream failure that particular case encountered.

### Change

`useCaseMedia` loads only the opened version, subscribes to existing repository changes and recovers on reconnect/foreground. `mediaStatus` projects cache, transfer and existing outbox state; it is not another persisted sync system. `retryCase` retains immutable operation/asset IDs and dependencies, and does not silently resolve conflicts or revive deleted cases.

Local bytes permit comparison, analysis and export even while uploads wait/fail. Cloud-only versions show download state. Offline cloud-only versions ask for connectivity. A real missing object explains that recovery is uncertain and advises preserving another device’s copy. Expired sessions have Sign in. Export history now says **Recreate**, because these records retain settings/metadata, not a separately stored PDF/preview asset.

“Saved on this device” is derived from successfully stored media, not an optimistic save click. “Synced” depends on the existing case acknowledgement/outbox sequence: upload/confirmation precedes the metadata mutation referencing those assets. It does not mean all devices have cached the images, nor promise that an object cannot later be removed.

### Test evidence

| Scenario | Result / environment |
|---|---|
| Local and pending upload | PASS — original/concept reads remain usable; comparison/export UI enabled |
| Synced case with no local media | PASS — automatic loading/progress; correct image bytes after transfer; no duplicate case |
| Another repository/device simulation | PASS — full demo JPEG decoded identically after download |
| Restart while offline | PASS — persisted image decoded identically without network |
| Interrupted upload | PASS — new repository on same IDB factory resumes immutable operations |
| Failed upload / Retry | PASS — same case/asset IDs, local media remains usable |
| Failed download / next sync | PASS — retry restores actual media, not just label |
| Offline/reconnect | PASS — repository recovery; browser state/reconnect fixture evidence only |
| Expired user session | PASS — 401 becomes sign-in recovery; valid API session restores media |
| Expired signed link | PASS — patient-case state rejects signed/public/blob URLs; signed-link expiry is not this delivery path |
| Deleted/missing asset | PASS — distinguishes absence from outage; no promise Retry will restore a deleted object |
| Account switch / late work | PASS — scoped repository rejection and cache isolation tests |
| Original real case, real second device | NOT TESTED — needs case identity and device acceptance |

Limits: no full browser/native decode-error recovery policy was added for a blob that exists but cannot decode. Tests now validate a real recovered JPEG, but the original case could still have that separate failure. No schema migration or original-case mutation occurred.

## Priority 2 — current generator and technical protection

### Current-path trace

1. Upload decode handles JPEG/PNG/HEIC; prepared longest dimension is at most 2048, with orientation handled during decoding. Source photo remains uncropped. Provider-compatible padding is separate and removed on return.
2. Request includes prepared image, source bounds, design/selected teeth, consent and authenticated allowance reservation. Optional reference/style inputs follow the existing opt-in path. Account/case identifiers are not forwarded as image-provider input.
3. Gemini extraction selects a non-thought image part and rejects absent/unsupported/header-invalid output. The image schema is not a semantic grey-mouth/blank-region detector.
4. `alignPreview` rejects aspect drift over 3%, reverses known padding and returns prepared-source dimensions. Correct dimensions alone cannot prove correct tooth placement.
5. Mouth compositing aligns to original landmarks and restores outside the inner-lip polygon. A clinician-painted edit mask further restricts allowed changes. A reviewed, matching **single-tooth** map can add tooth-boundary compositing.
6. Only after processing succeeds does the flow log/save the returned concept. Raw server output is not durably retained for later device recovery.

| Supported UI path | Actual protection / limitation |
|---|---|
| Quick 4/6/8/10 and multi-tooth Custom | Selected teeth travel as instructions. Current `generationProtectionPlan` explicitly declines multiple teeth; mouth/face lock applies, not per-tooth pixel enforcement. |
| Single tooth, reviewed matching map | Lossless outside-region restoration and change checks. Anatomy depends on the clinician-confirmed outline; wrong boundaries remain wrong. |
| Single tooth without reviewed map | Quick concept uses mouth/face protection. Do not present it as a precision edit. |
| Whitening/composite/porcelain | Material/shape/length instructions differ; cosmetic conformity is not automatically established by format or mask tests. |
| Alignment | Excluded from tooth-boundary protection; conceptual, requires clinical/visual assessment. |
| Full arch | `FULL_ARCH_ARCH_COMPOSITE` remains false. Opposite-arch preservation inside the mouth is an instruction, not enforced arch compositing. |
| Close-up without detectable full-face anchors or reviewed edit boundary | Can lack the full-face protection gate. Restrict this use during internal testing; it does not support an unconditional facial/gingival precision promise. |

`PRECISION_FOR_MULTIPLE_TEETH` is a retained compatibility export; it is **not evidence** that the live multi-tooth route invokes that protection. No mask, selection, provider or generation mode was changed in this pass.

### Evidence and limitations

- PASS — six approved local inputs: decode/preparation, padding/identity round-trip, finite map coordinates. These are local technical checks, not live provider generations or mask-anatomy validation.
- PASS — six historical output triplets: current aspect tolerance accepts their raw dimensions; all saved final dimensions match originals. Historical final compositing was not rerun on the final build.
- PASS — automated pure mask/geometry/protection, request parsing and provider-response tests in the full suite.
- NOT TESTED — fresh current end-to-end output on the previously failing patient photos; one/4/6/8-tooth cosmetic comparisons; full arch and alignment cosmetic correctness.
- NOT TESTED — historical mask overlay reconstruction. The review pack shows that absence rather than fabricating an anatomical mask.
- HUMAN REVIEW REQUIRED — malformed mouths, grey/blank regions, contour joins, gingiva, proportions and cosmetic appeal. Exact lip-boundary compositing does not guarantee anatomical preservation inside that boundary.

**Provider accounting:** 0 calls in this focused pass. Earlier overnight total unavailable; the 15-total limit was not reset. Historical file count is not a trustworthy request count because it excludes failures/retries.

## Priority 3 — comparison screen

### Reproduction → root cause → change

The sample browser comparison showed simultaneous technical lines and a floating metrics card over the image. The divider used the whole comparison container, including letterboxing. The analysis card and labels competed with the photograph.

Analysis is now deliberate and reset for a new concept. Basic shows eye line, midline and smile arc; Advanced remains available. Details collapse outside the image in the existing panel style. Data is preserved. Present Mode remains minimal. The photograph is measured with a contained rectangle that updates on image load/resize; the zoom frame, range input, divider and drag coordinates share that rectangle. Zoom is clipped within that photo viewport.

### Evidence

- PASS — portrait browser sample screenshots before/after analysis-panel change, overlay +10% touch control, Present Mode and preview preparation.
- PASS — geometry tests cover portrait iPhone, landscape iPad, orientation changes and invalid dimensions; existing zoom/pan tests pass.
- NOT TESTED — final touch/zoom/orientation interaction after viewport fix, iPad final layout and physical devices. No screenshot is represented as verifying a change made after it was captured.
- No redesign, new navigation or component library. No analysis data removed.

## Priority 4 — result loss and allowance honesty

### Reproduction and root cause

The source path confirms the failure window: server reserves allowance → provider returns → server commits reservation → client aligns/composites → client saves. Client errors after the response can discard the only remaining raw result. The server ledger stores reservation/cost metadata, not a retrievable result asset.

Network/timeouts also leave the server outcome uncertain. Nevertheless, previous copy promised “not counted”. Batch confirmation promised every failure was returned. Regression tests failed on those exact claims before the correction.

### Small change and verification

- PASS — uncertain/error paths now ask the clinician to check allowance before retrying; no refund guarantee is invented.
- PASS — generation feedback no longer advances through fake stages or percentages solely because time elapsed.
- PASS — existing provider-failure reservation release, duplicate request guards, idempotent SQL release, account ownership and late-work cancellation tests remain passing.
- NOT TESTED — interrupted/late paid generation on a physical device or live refund outcome. No live generation was used to test this.

### Exact blocker and next engineering scope

**FAIL — no durable result recovery after charged success.** Recovery requires a server-owned result/delivery record tied to the authenticated reservation/request, retained private output, authorized idempotent retrieval, delivery acknowledgement and mutually exclusive refund/redelivery states. Refund eligibility must be server-controlled and atomic. A client failure report is insufficient. This is a billing/delivery lifecycle change and was intentionally not improvised.

A related existing boundary needs review: if both commit attempts fail, the handler can still return the image while its stale reservation may later release. Resolve that together with the lifecycle, not through a new client refund action.

Existing private diagnostics contain bounded request ID, path, tooth count, dimensions, HTTP status and processing stage. They exclude photos, notes, names, emails and tokens. `succeeded` currently denotes processing completion, not a durable case-save acknowledgement. A running record after force-close does not establish the server’s billing outcome.

## Supporting read-only checks

### Supabase

- PASS — staging private `patient-cases` bucket, RLS on case/asset/cleanup tables, registered owner/path policy. Aggregate inspected: 40 confirmed assets, 34 deleted; zero confirmed assets lacking a storage object at inspection time. No names/photos were retrieved.
- PASS — disposable local PGlite tests enforce owner isolation, prohibit forged paths, preserve tombstones and test deletion-cleanup retry. Privileged aggregate inspection is not normal-user validation.
- HUMAN REVIEW REQUIRED — leaked-password protection is disabled in the staging advisor result. No configuration was changed.
- NOT TESTED — original-case access under a real owner session; real account deletion and storage cleanup. No existing user case was modified.

### RevenueCat / Apple

- PASS — App Store app `appb4a1d5eb2d` uses the expected bundle ID; App Store Connect and subscription credentials report configured. `pro`, active `default`, monthly and annual package mappings exist. App Store periods are one month/one year.
- FAIL — monthly `prod939b341094` and annual `proddfaede4902` store state is `MISSING_METADATA`; localized metadata/review information are incomplete. No price, product or allowance changes.
- PASS, configuration only — staging webhook `whintgr253ab15b85` filters sandbox and the App Store app.
- Observed delivery: **one TEST event, `ignored_unknown_user`, sandbox**, last recorded `2026-10-02 16:18:26 UTC`. No real subscription event observed. Purchase/restore: NOT TESTED.
- Existing Test Store annual entry reports a one-month period; App Store annual reports ONE_YEAR. Recorded only; no commercial editing in this pass.
- Native Apple sign-in entitlement: PASS. Actual sign-in/cancellation, relay-email linking and revocation: NOT TESTED. Different sign-in identities must not be silently treated as the same account.
- Branded email templates are prepared in the earlier checkpoint, not confirmed active. SMTP/domain delivery and inbox receipt still require owner/provider verification. Account deletion currently reports Apple/RevenueCat cleanup results; live revocation must be proven before external release.

### Targeted security review

Codex Security patch-risk assessment covers immutable fix commits, authenticated media access, retries, error classification and allowance copy. Ownership, derived-path checks, checksums, workspace cancellation, tombstones and idempotency remain enforced. No client refund authority was added. Assessment is **hold_for_evidence**, not permission to merge or release: original-case and final native evidence remain missing.

The validated JSON/Markdown assessment is stored through the Codex Security plugin, outside the repo. See the evidence manifest in `output/v1-ui-audit/evidence/checkpoint.json` for local assessment references and source hashes. It is a focused review, not a claim of a full penetration test.

## V1 UI / UX FINDINGS

| Screen | Issue | Severity | Reference | Fix / status | Human review |
|---|---|---|---|---|---|
| Saved case | One failed read appears as lost images, leaves core actions disabled | P0 | Reported unavailable-images message; synthetic fixtures | Recovery/status/retry/sign-in applied; original case cause unconfirmed | Original case and second device |
| Comparison | Metrics obscure clinical image | P1 | `06-analysis-before.png` → `12-analysis-basic-after.png` | Details moved outside image; explicit analysis | Final iPhone/iPad |
| Comparison | Divider crosses blurred margins | P2 | supplied physical screenshots; contained-viewport tests | Fitted frame applied | Final zoom/rotation |
| Generation | False allowance-return promise | P1 | red/green allowance tests | Corrected; delivery lifecycle still FAIL | Live interruption |
| Generation | Fake time-based progress | P2 | progress regression | Honest waiting copy | Slow device/network |
| Tooth chart | Unqualified preservation claim | P1 | patient-claims red/green tests | Instructions and confirmed-boundary distinction | Clinical wording review |
| Case export history | “Open” implies a retained file | P1 | actual metadata-only export records | “Recreate”, using saved version/settings | Recreated report/preview |
| Recent cases | Metadata updates can reset carousel position | P2 | source inspection | Preserve position; subtle exception-only sync indicators | Touch swipe |
| Onboarding/review | Obsolete device-only storage copy | P2 | current private-account sync path | Straightforward non-legal wording corrected | Owner copy review |

## Intermittent conflict failure and all reruns

Original preserved failure: `output/iphone-smoke-test/tests.log`, “conflict can explicitly adopt cloud”, about 336 ms: expected `cloud`, received `local`. Earlier passing rechecks did not erase it.

1. Twelve isolated concurrent reruns passed before the fix (`conflict-repro/before-*.log`).
2. Deterministically running the scheduled refresh before the supposed stale edit reproduced the same assertion failure (`forced-refresh.log`). The fixture’s connected second device could adopt the new revision during its 250 ms background kick. Its later edit was therefore not conflicting, and resolve correctly had no conflict to adopt.
3. Conflict fixtures now disconnect after initial sync, queue the stale edit, reconnect and assert `status === conflict` before resolution. Assertions were strengthened; production conflict handling was not changed for this test failure.
4. Twelve post-fix isolated concurrent reruns passed (`after-summary.json`), then the whole sync suite and final regression suite passed.

Other recorded failures:

- First full pass: 557/558; two undefined CSS theme tokens caused the theme-token test to fail. Replaced with existing tokens; targeted theme tests and later full suites passed.
- Auth/allowance focused red tests failed on incorrect copy/state, then passed after their fixes.
- Viewport regression began red (missing geometry implementation); then three geometry cases passed.
- Synthetic PNG full decoding failed; replaced fixture, added full-photo decoded recovery/restart test. Earlier DOM-state checks are not promoted to image proof.
- `npm test` launcher failed on sandbox IPC permission before executing tests. Equivalent `node --import tsx --test tests/*.test.ts` ran the unchanged suite successfully.
- Sandboxed Next build stalled; stopped it and reran the same production/native build with normal permissions. Build passed. Existing legal distribution guard still fails intentionally; no gate was weakened.
- Final `codesign --verify --deep --strict` returned nonzero in the sandbox; the same read-only verification with normal permissions passed. Packaged asset hashes matched.
- Review-pack helper initially failed on CJS top-level await; wrapped its local runner and completed. No provider calls occurred.

## Performance and observed counts — no readiness percentages

Six local inputs prepared/round-tripped with finite coordinate bounds. Mac browser preparation: JPEG 12–33 ms; HEIC about 3.65 s. Local full-face/map pass totals roughly 112–150 ms for JPEG and 3.89 s for HEIC. These are not iPhone, network-generation or clinical-quality timings. Report creation and review opening were observed in the sample UI; no external sharing occurred.

Live generation requests/deliveries: **0 / NOT TESTED** in this pass. Historical triplets reviewed for dimensions: **6/6**. Browser case-state scenarios: **13**, state/action checks only. Original affected cases repaired: **0**. Real purchases/restores: **0**. Real subscription webhooks observed: **0**. No cosmetic corruption rate is inferred from this sample.

## Fix commits and rollback points

| Commit | Scope | Previous rollback point |
|---|---|---|
| `a2f7a48` | Case recovery/status, missing-vs-transient, auth route, conflict/recovery tests | `eacc0c9` |
| `532104f` | Analysis presentation, photo-bounded divider, sync wording | `a2f7a48` |
| `fa68c53` | Honest allowance and generation progress | `532104f` |
| `a6aef07` | Local synthetic/approved-photo QA harnesses | `fa68c53` |
| `33bad84` | Tooth-preservation wording and regression | `a6aef07` |

Rollback is by **selective revert in reverse order**, after preserving the existing dirty work. No rollback was performed. Do not hard-reset this workspace. The pre-existing diagnostics remain uncommitted in `src/app/page.tsx`, `src/services/ai/smileImageService.ts`, `src/services/ai/generationDiagnostics.ts` and `tests/generation-diagnostics.test.ts`; the earlier physical-release document also remains untracked. Their source hashes are retained in the private evidence receipt.

## Shortest physical iPhone / iPad acceptance checklist

Use disposable approved content; follow this on iPhone, then repeat the starred checks on iPad. Stop on the first failure.

1. Launch, email login, accept terms, sign out/in. Test Apple sign-in/cancel separately; confirm account identity.
2. Create case, add photo, analyse, choose 6 teeth. Confirm no crop and that generation is available without waiting for optional Tooth Map refinement.
3. Generate once. Inspect real output, grey/blank regions, alignment, expression, lips, mouth opening, gingiva and neighbouring teeth. **Human review required.**
4. ★ Compare Slide/Overlay, adjust opacity by touch, zoom and rotate. Divider stays within photo; analysis opens/hides; mouth remains unobscured.
5. ★ Save, wait for local success, force-close, reopen offline. Compare and export preview/report from the same saved version.
6. ★ Open the case on the second device: metadata first, images download, comparison/export become usable. Interrupt connectivity and Retry once; no duplicate case. Pending upload must not block local use.
7. Make one reviewed-boundary single-tooth concept, confirm neighbouring areas and save as a second concept. Mark preferred; reopen and check the same preference/settings.
8. Switch A → B → A: no cross-account cases/media. Test background/offline generation only after result-delivery limitations are accepted; record allowance before/after and collect diagnostics on failure.

On failure collect: time, step, app build, network state and the private QA request ID/path/tooth count/dimensions/HTTP status/last stage. Do not send images, notes, tokens or the entire app data container into generic logs. A missing request ID can mean failure before a request was created. Preserve any visible successful result before closing.

## Release boundary — final answer to the three release questions

**What can safely enter a small internal TestFlight test?** The verified local code is a candidate for owner-led direct-device testing first. After device acceptance and the existing distribution/legal gate are resolved, limit a small internal TestFlight to approved test content, case recovery, comparison and clearly labelled concept review. This report does **not** approve an upload now.

**What should remain disabled or explicitly limited?** Keep debug controls and provider bypasses off. Limit unreviewed single-tooth, multi-tooth precision claims, close-ups without reliable protection, alignment and full-arch use to supervised concept evaluation. Do not claim guaranteed gums/adjacent teeth, real bite correction or clinical prediction. Keep live purchase acceptance and automatic client-failure refunds out of scope until verified.

**What must be resolved before external dentists or paying users?** Identify/recover the original case under normal-user auth; complete physical iPhone/iPad tests and clinician visual generation review; implement and verify recoverable paid result delivery with server-controlled idempotency/refunds; complete real purchase/restore/webhook and Apple/email/deletion tests; resolve subscription metadata, legal/privacy owner decisions and distribution checks. No deployment or upload was performed. **STOP.**
