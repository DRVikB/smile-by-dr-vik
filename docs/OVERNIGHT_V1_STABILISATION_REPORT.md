## SUNBURST DEVICE ACCEPTANCE FAILURE — 3 October 2026, 20:53–20:55 London

### 1. WHAT WAS ACTUALLY FIXED

**PASS — staging integration, not generation acceptance.** `18efba3` configures the existing OpenAI adapter for `gpt-image-2.5-sunburst`, high-quality PNG Images Edit, same-size source/mask input, alpha-permission conversion and the existing shared post-processing. Gemini remains an explicit disabled rollback; there is no automatic provider fallback. `1b18bb7` corrects upstream API-credit errors to HTTP503 so the client does not misrepresent them as a clinician subscription requirement. Both commits are separate rollback points; earlier provider checkpoint `9ebb832` remains available. No production deployment, push, merge, Apple upload, case deletion, schema or commercial configuration change.

**PASS — diagnostic build configuration correction.** The last installed bundle had no value baked in for `NEXT_PUBLIC_SMILE_QA_DIAGNOSTICS`: its private recorder returned before writing. The retrieved cache ended at the older 19:37 Gemini test. The staging-only local build environment now enables the existing metadata recorder. Rebuilt JavaScript confirms the opt-in check was compiled on. The rebuilt signed Release compiled and was installed over the existing iPhone app without deleting its cases (`device-failure/physical-release-diagnostic.log`, `device-failure/iphone-install-diagnostic.log`). This does not repair either generation and cannot recover missing historical diagnostics. Raw-image capture remains disabled.

### 2. WHAT WAS TESTED — ENVIRONMENT, COMMIT AND EVIDENCE

Branch `release/v1-device-test`; client implementation `18efba3`, final server-only error mapping `1b18bb7`. Matched contract `2026-10-03-sunburst-v1`, pipeline `SC-SUNBURST-V1`. Staging Worker only: `smile-by-dr-vik-staging.drvik.workers.dev`, final version `13ba1d60-4494-4140-9706-73da9f9c9b43`. Supabase staging `wukcqlpuzkzwxmdkotfg`. Owner explicitly confirmed API business terms/DPA and required privacy documentation for staging; that assertion is recorded in `SUBPROCESSORS.md`, not independently audited.

Private, Git-ignored evidence: `output/openai-sunburst-setup-2026-10-03/`. Metadata-only device cache was copied from `Library/Caches/smile-generation-qa.json`; no patient image, auth database or full app container was copied. Staging queries were read-only and restricted to this owner's two requests.

| Test | Evidence / verdict |
| --- | --- |
| Full automated regression | **PASS — 671/671**, zero failures/skips, `release-tests.log`. Mocked providers; no paid calls. |
| TypeScript / ESLint | **PASS**, `release-typecheck.log`, `release-lint.log`. |
| Production-style web build / Capacitor sync / bundle check | **PASS**, `web-build-final.log`, `cap-sync-final.log`, `bundle-verification.log`. Updated metadata-only diagnostic rebuild: `device-failure/diagnostic-build.log`. |
| Cloudflare packaging / staging deployment | **PASS**, `cloudflare-credit-fix.log`, `staging-deploy-final.log`. Production unchanged. |
| Signed physical iPhone Release compile | **PASS**, `physical-release-final.log`, strict signature `signature.log`; bundle `uk.co.drvik.smilecompose`, version1.0/build1. That staging QA build was installed over the existing app. |
| iPhone/iPad simulator fixture | **PASS**, `native-simulator.log`, xcresults under `output/simulator-reliability-2026-10-03/`. Deterministic mocked UI fixtures, not actual Sunburst delivery or cosmetic validation. |
| Local input-mask/post-processing compatibility | **PASS**, approved synthetic source only, `local-mask-receipt.json`: source1092×1440, prepared/mask1092×1456, 478 landmarks, opaque protected corners, 25,613 editable pixels. Local source replay only; not a real provider-output test. |
| Provider model access / staging model endpoint | **PASS — HTTP200**, `access-check.json`, `staging-model.json`. No image call was required for these checks. |
| Owner physical Sunburst test | **FAIL — rejected image; FAIL — cosmetic acceptance of preceding delivered image.** Supplied `IMG_3510.PNG` and `IMG_3508.PNG`/`IMG_3509.PNG`. Both requests used **8**, not the requested6, upper teeth and Porcelain/Auto. No six-tooth device acceptance inferred. |
| Strict shipping preflight | **FAIL — 40 unresolved owner/legal items** (privacy23, terms17), `ios-sync-final.log`. Signed direct-device staging QA is not shipping/TestFlight clearance. No guard weakened. |

Test failure history: initial adapter/mask/contract/required-mask and credit-mapping regressions were RED before GREEN. One TypeScript/build run failed because a new test fixture omitted required `variationId`; the fixture was corrected and checks rerun. Sandbox blocked the `tsx --test` IPC socket, so the same suite ran through `node --import tsx --test tests/*.test.ts`. The earlier intermittent sync-conflict test remains separately documented; these passing runs do not establish its root cause. The diagnostic rebuild audit initially treated the presence of an unused raw-capture module export as activation; this assertion was corrected to inspect the disabled opt-in branch/configuration, with no capture-setting change. Sandbox signature verification could not read the trust store; the same strict verification passed with normal signing-store access. These were verification-environment/assertion failures, not additional provider requests.

### 3. WHAT STILL FAILS — EXACT REQUEST EVIDENCE

| | Displayed but owner rejected | Rejected before display/save |
| --- | --- | --- |
| Request ID | `6c2abe6d-dab2-47ca-baaa-e8ed04931501` | `5078b631-9c73-4b1a-bcb5-700f2cb221f4` |
| Provider | OpenAI `gpt-image-2.5-sunburst` | OpenAI `gpt-image-2.5-sunburst` |
| Provider input | 1536×2048 | 1092×1456 |
| Raw output | 992×1328 PNG, valid image | 992×1328 PNG, valid image |
| HTTP / category | 200 / success | 200 / success |
| Provider latency | 40,335ms | 26,275ms |
| Provider finished, London | 20:53:40 | 20:54:57 |
| Input/output aspect drift | 0.401606% | 0.401606% |
| Server allowance | 64→63; committed | 63→62; committed |

**FAIL — mouth-alignment acceptance, not “no image”.** Request path is physical app → staging `/api/generate-smile` → authenticated reservation → shared handler → OpenAI `/v1/images/edits` → valid PNG returned → `alignPreview` → `lockFaceOutsideLips` → attempted delivery. Provider headers establish prepared dimensions, not independently decoded EXIF. The 0.401606% aspect difference is below3%. The exact screenshot wording is emitted only by `lockFace` when `lockFaceOutsideLips` sets `invalidAlignment`; therefore the failure occurred at **mouth_composite alignment validation**, after provider extraction and canvas aspect validation, before saving the new result. It does not establish a genuine crop/reframe.

For the approved synthetic source, expected source1092×1440 ratio0.758333333, prepared ratio0.75, raw ratio0.746987952. Known8px padding implies cropY7.296703 / cropHeight1313.406593 on the provider canvas, then final1092×1440. These are **calculated expected geometry**, not retrieved execution diagnostics for this failed request. Raw EXIF, actual crop offsets, fitted scale/rotation/residual, detector error versus no-face result and exact categorical rejection are **NOT TESTED / unavailable** because the recorder was disabled. The raw provider result was not retained; visual reframing and replay of this exact output cannot be proved. No framing-guard relaxation is justified.

**FAIL — visible anatomical/cosmetic result.** The supplied before/concept screenshots show a larger visible intraoral opening, reduced lower-tooth display and excessively uniform short-looking crowns. The owner rejects the appearance. The current ordinary V1 permission mask covers the source mouth ROI; its protected exterior is not an anatomical tooth/gum mask. `mouthTransitionMask` uses the outer-lip boundary for stable lip landmarks, or strict original inner opening for detected movement. Neither separately enforces gum, lower-tooth or selected-tooth pixels within that ROI. This establishes a protection limitation; it does **not** prove whether the exact defect first arose in raw provider generation or subsequent fitting/compositing, because raw output and new client alignment diagnostics are unavailable. Prompt text already prohibits changing mouth opening/exposure and untreated teeth. No duplicate preservation prose, new gum segmentation, mask expansion or speculative prompt change was added.

**FAIL — charged failed delivery.** Both reservations are committed; there is no release/refund ledger entry for either. The failed second result cost one generation. No local refund, manual ledger adjustment or client-asserted refund was made. Current provider-success commitment does not establish successful device delivery. Durable authenticated/idempotent result recovery remains deferred and is required before external/paying beta.

### 4. WHAT WAS NOT TESTED / BLOCKED

**NOT TESTED:** exact raw image visual framing; six-tooth physical acceptance; four-treatment Sunburst acceptance; save/force-close/reopen of a usable Sunburst result; Apple sandbox purchase delivery; physical iPad Sunburst generation. The owner attempted two requests; the agent made **0 paid Sunburst calls / 0 retries**. These two owner requests do not grant further agent requests. Earlier agent Gemini budget17 remains exhausted. OpenAI does not supply Gemini's `finishReason` in this Images response contract; none is invented.

**Security/configuration PASS:** key created once for project Default project in organisation Personal, named SmileCompose; server-only `.env.local` mode0600, ignored/untracked. No secret bytes matched tracked source or client/native/signed bundles. Cloudflare encrypted staging secrets set; production was not changed. Provider access URLs and credential names do not enter the packaged client. Camera permission, Photos export permission (`NSPhotoLibraryAddUsageDescription`), privacy manifest and existing capabilities retained. System photo picking does not require a broad library-read entitlement. No formal security-plugin scan claimed.

### 5. SUNBURST OPTIMISATION ADDENDUM — IMPLEMENTED SCOPE AND LIMITS

| Requested item | Current implementation / verdict |
| --- | --- |
| 1–3 Prompt sections/common/treatment deltas | **PASS —** one normalized contract renders TASK / CHANGE / PRESERVE / STYLE / EDIT REGION for Sunburst, rather than a second treatment engine. Canonical Gemini rollback retained. Preserves identity, expression, lips, width/opening, natural margins, untreated teeth, photographed exposure and explicit exceptions. |
| 4 Upper/lower/both rules | V1 Alignment and All-on-X **both visible arches only**. Standard selected teeth retain intended untreated opposite-arch prompt instruction. Historical settings remain readable; no destructive migration. |
| 5 Opposite-arch compositing | **LIMITED —** reviewed Tooth Map/manual protections reused where present. Ordinary V1 without the hidden map does not deterministically preserve the opposite arch inside the mouth. No unsupported guarantee. |
| 6 Gingiva Preserve/Include | **LIMITED —** prompt Preserve by default; Include exception only explicit Full Arch + prosthetic gingiva. Zirconia alone never authorises gums. Ordinary mouth ROI is not a deterministic gingival mask. |
| 7 Aspect/output normalization | **PASS for structural contract —** request source aspect preserved with provider16px sizing; existing padding removal/3% guard/shared mouth alignment retained. The physical mouth-alignment failure remains unresolved. |
| 8 Quality | **PASS —** high default, fixed server configuration; no dynamic quality or hidden second call. |
| 9 Versions | **PASS —** optional backward-compatible generation metadata `SC-SUNBURST-V1`, treatment WHITENING-V1 / VENEERS-V1 / ALIGNMENT-V1 / FULLARCH-V1. No schema migration. |
| 10 Whitening/Veneers | **PASS automated; NOT TESTED complete cosmetic acceptance.** Whitening remains shade-only; veneers permit bounded restorative morphology, surface and shade. No regression acceptance inferred from code tests alone. |
| 11 Alignment/All-on-X | **PASS automated; NOT TESTED Sunburst device acceptance.** Alignment position-only natural character; All-on-X both arches/zirconia, explicit separate prosthetic gingiva setting. Shared hardened pipeline. |
| 12 Hidden V1 functionality | **PASS —** Single Tooth/Tooth Map/Precision remain hidden behind existing flags. No deletion or new advanced controls. |
| 13 Build/verification | **PASS staging QA compile/tests; FAIL shipping preflight and physical generation acceptance.** Details above. |
| 14 Manual tests/limits | Stop further paid testing now. After the confirmed rejection cause is located and a regression fix verified: one approved synthetic six-tooth Veneer test, compare mouth/expression/gums/neighbours/crop → Save → force-close → Reopen; separately test Whitening, both-arch Alignment and both-arch zirconia before any acceptance claim. No automatic retries. |

### 6. EXACT NEXT ACTION FOR ME / RELEASE DECISION

**Do not Generate again or delete the app/cases.** Keep the failed work and timestamps. Metadata-only staging diagnostics are now rebuilt and installed so a future authorised test can retain the exact rejection category. No additional paid test is authorised by this investigation. The current successful-looking but unacceptable concept should not be used as a patient-facing example.

**CORE GENERATION READY FOR TESTFLIGHT: NO.** Build compilation is not delivery/cosmetic acceptance. Small internal TestFlight cannot be called ready while this core failure, charged-result recovery limitation and strict shipping preflight remain unresolved. Before external dentists/paying users: usable four-mode device results, honest anatomical-control limitations, durable charged-result recovery, completed privacy/terms configuration, real Apple sandbox/account checks. No automatic rollback/provider switch or production/Apple upload.

## BOTH-ARCH ALL-ON-X + ALIGNMENT CHECKPOINT — 3 October 2026, evening

### 1. WHAT WAS ACTUALLY FIXED

**PASS — V1 scope simplification**, implementation commit `9ebb832`, rollback point `8b2ec66`, branch `release/v1-device-test`. All-on-X now always selects **both visible arches / zirconia**, removing Upper/Lower and provisional-material controls. Choosing, restoring editable state, generating, request parsing and the prompt contract enforce that same scope. Historical saved records/report settings remain readable and are not migrated or overwritten. Existing explicit prosthetic-gingiva permission remains separate; zirconia alone does not grant gingival changes. Alignment was already both-arch, position-only; its natural shape/shade behaviour is retained. Single Tooth/Tooth Map/Precision remain hidden. No schema, pricing, subscription, segmentation, geometry, model/provider, mask threshold or protection change.

**Not a proven fix for the 19:37 intermittent physical failure:** its first rejection was missing generated landmarks, not the 3% aspect guard. Exact raw result was not retained, so its underlying detector/provider cause remains unknown. No speculative bypass was added. Two new authorised samples now establish successful delivery on that same source photo, with retained raw outputs for further local diagnosis.

### 2. WHAT WAS TESTED — ENVIRONMENT, COMMIT AND EVIDENCE

Tests/builds used the source subsequently committed as `9ebb832`; production source did not change afterward. Private, git-ignored evidence is under `output/all-on-x-alignment-2026-10-03/` and `output/simulator-reliability-2026-10-03/live/<request-id>/`. Test-folder `IMG_3241.jpg` was explicitly authorised by the owner for these two staging requests. The ordinary authenticated disposable staging account was used, with its existing expired QA override temporarily restored then returned to its original expiry; no owner account/ledger or commercial allowance changed. Request harness capped each mode at1, with no retry.

| Check | Verdict / evidence |
| --- | --- |
| All-on-X both / zirconia | **PASS — live provider + native iPhone simulator Safari processing**, request `c374d380-144f-4e76-9416-f9a17bd81ee8`, Google Gemini3.1 Flash Image, contractv8, HTTP200/STOP, one JPEG image, retry0. Source1320×1737, prepared1320×1760, raw896×1200, final1320×1737; 478 source/generated landmarks; protected exterior0 changed pixels. Delivered, saved, SYNCED, exact media reopened after Safari terminate/relaunch. Provider9,391ms; complete harness20,846ms. Disposable allowance11→10, exactly one reserved−1/committed0 pair. |
| Alignment both | **PASS — same environment**, request `f80ff6da-421a-429c-879f-6f0f7d320e50`, HTTP200/STOP one JPEG, retry0, same dimensions; 478/478 landmarks; protected exterior0 changed pixels. Delivered, saved, SYNCED, exact media reopened after relaunch. Provider8,783ms; harness16,091ms. Allowance10→9, one reserved−1/committed0 pair. |
| Native Capacitor UI — iPhone | **PASS**, deterministic mocked provider, actual treatment selection and both-only All-on-X UI assertions; `iphone-fixture-1791054319693.xcresult`. |
| Native Capacitor UI — iPad | **PASS**, same workflow and assertions; `ipad-fixture-1791054400106.xcresult`. |
| New scope regression | **PASS — RED then GREEN**, default/legacy state normalization, ordinary generation parsing, preserved historical settings, actual Studio rendering with no Arch/Restoration selector. `scope-red.log`, `scope-green.log`; final focused32/32. |
| Full suite | **PASS — 664/664**, no failed/skipped; `full-tests-final.log`. Initial full run661/664: three old Upper-only assertions/snapshots expected the superseded scope. Updated only scope expectations, preserving anatomy/protection assertions; no weakening of those checks. |
| TypeScript / ESLint | **PASS**. Initial TypeScript detected three unreachable upper/lower branches after the literal both normalization; removed those obsolete branches. Final type/lint logs pass. |
| Web production build / Capacitor / native bundle verifier | **PASS**, `ios-sync.log`. Staging configuration retained; private metadata QA enabled; raw-image capture disabled; no localhost/native fixture injection in physical bundle. |
| Signed physical-device Release compile | **PASS**, `physical-release.log`; strict deep signature check exit0 (`signature.log`). App `/tmp/smilecompose-physical-release/Build/Products/Release-iphoneos/App.app`, bundle `uk.co.drvik.smilecompose`, version1.0/build1. **NOT INSTALLED** this pass. |
| Cloudflare packaging / matched staging deployment | **PASS**, `cloudflare-package.log`; staged Worker from `9ebb832`, version `e7562979-6dc4-48a4-b800-cbad8379b92f`, tag `9ebb832`, existing contractv8 retained. Staging only; `staging-deploy.log`. The two live requests preceded deployment but used the same unchanged both-arch v8 prompt/provider contract; no extra paid request afterward. Post-deploy account/status and generation-cost HTTP200 (`post-deploy-status.json`). |

**Live provider budget:** exactly **2 additional requests used / 2 authorised**, zero retries; earlier15-request agent budget remains exhausted (cumulative authorised agent QA total17). Historical ledger used19 before this pair is not asserted to equal that agent-budget count: it also includes earlier fixture activity. No further provider requests permitted without separate authorisation.

### 3. WHAT STILL FAILS

**Unresolved — intermittent physical-iPhone returned-image face detection.** Fresh simulator delivery is not proof that request `5535c2e1-b5ae-4ec2-afd0-b0a3b443331c` is repaired. Charged-result delivery/recovery limitation remains: prior failed owner result consumed65→64 and was not refunded; no unsupported refund performed. No durable charged-result recovery added.

### 4. WHAT WAS NOT TESTED / BLOCKED

**NOT TESTED — updated physical iPhone/iPad generation, Apple purchase/sign-in, complete four-treatment cosmetic acceptance.** Whitening/Veneer automated prompt/provider regressions pass unchanged, but no extra live requests for those modes. UI simulator provider is mocked; live processing tests use simulator Safari shared production modules, not the physical Capacitor app. No TestFlight/production upload, push or merge.

### 5. WHAT NEEDS MY VISUAL REVIEW

**HUMAN REVIEW REQUIRED:** private `output/all-on-x-alignment-2026-10-03/visual-review.html` displays Original | Raw provider result | Final protected result for both requests. Both final images visibly contain a complete smile without the prior blank/grey output; their clinical/cosmetic acceptability, untreated anatomy and intended treatment character remain human decisions. Protected-exterior equality is a technical result, not a guarantee of gingival/anatomical accuracy. Native scope screenshot attachments are in each xcresult. Earlier local replay of two retained outputs also passed (`local-replay-receipt.json`) but used an older Upper Full Arch output, so it is not a both-arch acceptance sample.

### 6. EXACT NEXT ACTION FOR ME

In Xcode open `ios/App/App.xcodeproj`, choose **App** and your connected iPhone. Confirm your team under Signing & Capabilities and **Edit Scheme → Run → Build Configuration: Release**, then Run (⌘R) **over the existing app; do not delete the app**. Using the approved original test photo in normal mode (not Demo), test All-on-X once: both arches/zirconia automatically, Generate → compare → Save → force-close → reopen. Separately test Alignment once with both arches automatic. Inspect complete smile, framing, lip/expression/mouth opening, natural tooth character for Alignment and coherent distinct crowns for zirconia. If either fails, stop without retry and record time/request diagnostics.

**Ready for physical-device testing: YES. Release/TestFlight generation acceptance: NOT YET — physical retest required.**

## PHYSICAL ALL-ON-X FAILURE — 3 October 2026, 19:37 London

### WHAT WAS ACTUALLY FIXED

No speculative generation fix. **PASS — owner subsequently confirmed saved drafts now open and work on the physical iPhone.** This confirms the preceding draft-navigation fix's device acceptance, without proving every cloud-recovery scenario.

### WHAT WAS TESTED / EXACT FIRST BROKEN STAGE

Source checkpoint `4a95d55` (production fix `abb3e4b`), branch `release/v1-device-test`. Read-only staging audits and the connected iPhone's bounded private diagnostic cache now correlate the exact request **`5535c2e1-b5ae-4ec2-afd0-b0a3b443331c`** at **19:37:19–19:37:28 BST**. User screenshot `IMG_3506.PNG` shows Full Arch Upper+Lower; ledger records **Full-arch both / zirconia**. Contract v8, Google `gemini-3.1-flash-image`, zero retries, source+prompt, no provider mask/reference.

**PASS — provider and canvas normalization:** HTTP200 / STOP / one valid inline JPEG, no text/thought/other parts; 8,133ms provider latency. Source1320×1737; prepared/provider input1320×1760; raw896×1200, EXIF orientation absent. Prepared ratio0.75; raw0.746666667; drift**0.444444%**, below3%. Source/final ratio0.759930915. Known-padding removal: crop x0/y7.5/w896/h1184.3181818181818; output1320×1737; scaleX1.4732142857142858/scaleY1.4666666666666668. `alignPreview` completed; no aspect rejection. This establishes coordinate normalization, **not raw visual framing accuracy**.

**FAIL — returned-image face detection before mouth compositing:** device record stage=`mouth_composite`, error=`mouth_alignment_rejected`, exact rejection=`generated_landmarks_missing`. Source478 landmarks, generated0, both normalized canvases1320×1737. `planMouthLock` rejects before scale/rotation/residual fitting, editable-mask blending, protected-region verification, quality review or saving the new result. The generic UI framing message does not establish an actual crop defect.

**Comparison evidence:** immediately preceding owner requests `509fa01b-7917-47de-8907-46f199a059e0` (19:36:01 completion) and `85d54593-b337-4ba0-9e6f-fb95e80c8e40` (19:36:41 completion) are standard-path **succeeded**, with source/generated478 landmarks and protected exterior0 changed pixels on the same physical app. This is stronger than simulator-only evidence, but their precise treatment/cosmetic acceptability is not inferred. Existing successful result remains visible in the Studio; rejected All-on-X result does not overwrite it.

Private evidence: `output/iphone-generation-failure-2026-10-03-1937/device-diagnostics.json`. Only the diagnostic file was copied; no app auth database/container or patient photographs. **PASS — existing targeted regressions17/17**, zero failures/skips (`diagnostic-tests.log`), including missing generated landmarks, categorical reporting and privacy filtering. No new source fix/reproduction or full-suite/build rerun claimed for this failure.

### WHAT STILL FAILS / NOT TESTED

**FAIL — All-on-X physical acceptance.** Exact first rejection is proven; the underlying reason the generated image has no usable detection is **NOT ESTABLISHED**. `faceWorker` can return null for no face, or a categorical worker error for model/decode/inference failure; `detectFace` converts either to null. Current record cannot distinguish those causes. No raw output was retained for this request (raw capture disabled); therefore visual crop/face integrity and local replay of this exact response are **NOT TESTED**. Do not infer malformed output or iOS worker failure from zero landmarks alone.

**FAIL — charged delivery:** reservation−1, committed0; allowance**65→64**. No release/refund entry for this request in the current ledger. No manual ledger write/local refund. Recoverable charged-result lifecycle remains deferred. This is an owner-initiated request, not an additional agent QA call; agent provider calls in this investigation**0**, previous QA total15 unchanged.

### NEXT ACTION / RELEASE GATE

**Do not retry this paid request.** Further root-cause proof requires distinguishing detector empty-result from decode/model/worker failures and inspecting/replaying the exact returned image where authorised and retained. Current cache proves the rejection stage but cannot supply that image; no unsupported protection bypass, prompt change or guard relaxation is justified. No production/staging deployment, TestFlight upload or generation architecture change performed. **All-on-X ready for TestFlight: NO.** Saved-draft reopening remains **PASS — owner device confirmation**.

## SAVED DRAFT REOPEN FIX — 3 October 2026, evening

### 1. WHAT WAS ACTUALLY FIXED

**PASS — confirmed navigation defect, not lost media.** The recording shows a Draft opened at approximately 1–2.5 seconds, followed by Home at 3 seconds; the second attempt repeats this. Explicit case reopening restored the draft's saved `screen: "start"`, then closed Cases. The photo/settings were loaded, but the editor was never displayed. `reopenCase` now changes that last-viewed Home state to Design for an unfinished case, or Preview when a result exists. Ordinary app startup still honours its saved screen. Photos, settings, results, asset references and stored cloud cases are not reset or rewritten by this navigation correction.

Recent Cases now labels photo-only work **Draft** instead of **AI concept**. Drafts remain saved and accessible so the clinician can continue designing; completed results retain their existing comparison/export routes. No separate draft section or redesign was added.

Fix commit **`abb3e4b`**, branch `release/v1-device-test`; previous checkpoint **`fc6b61d`** is the rollback reference. User's existing Xcode project/scheme changes are preserved and excluded from the fix. No provider call, backend deployment, schema change, ledger adjustment, case deletion, push or TestFlight upload.

### 2. WHAT WAS TESTED — environment, commit and evidence

Evidence is private and Git-ignored under `output/iphone-case-reopen-2026-10-03/` and `output/simulator-reliability-2026-10-03/`. Code/build checks ran on the working tree subsequently committed as `abb3e4b`; no production-source changes followed the build.

| Check | Verdict / evidence |
| --- | --- |
| Original affected cases, staging read-only | **PASS — metadata/reference/object inspection:** eight recent photo-only drafts have saved screen `start`, no generated entry, and 2–3 acknowledged assets with corresponding private cloud objects. Two older completed cases retain generated entries and four acknowledged objects. This supports the navigation cause; it is not a physical normal-user download test of every original case. No original work modified. |
| Repository regression | **PASS — RED then GREEN:** two assertions reproduced Home restoration; 22/22 repository tests pass after the fix. Second repository fetch verifies actual photo bytes, exact settings/result retention, active working-case persistence and unchanged cached cloud state (`repository-red.log`, `repository-green.log`). |
| Native iPhone regression | **PASS — 2/2**, dedicated iPhone simulator, production-built Capacitor fixture, approved synthetic photo, mocked provider. Pre-fix run failed specifically at “Draft reopening must leave Home.” Final run opens the editor with its photo and Generate action, and opens the prior saved comparison with its image (`iphone-case-reopen-final-1791052357147.xcresult`). |
| Native iPad regression | **PASS — 2/2**, dedicated iPad simulator, same independent draft and saved-comparison checks (`ipad-case-reopen-final-1791052417649.xcresult`). These are simulator results, not physical-device validation. |
| Main iPhone workflow | **PASS**, existing native deterministic SmokeTests after rebuilding the current fixture (`iphone-fixture-1791051866723.xcresult`). No live generation. |
| Full automated suite | **PASS — 661/661**, zero failures/skips (`full-tests.log`). |
| TypeScript / ESLint / diff whitespace | **PASS** (`typecheck.log`, `lint.log`, `git diff --check`). |
| Production web build / Capacitor sync / bundle verifier | **PASS** (`native-build.log`), staging backend and existing native configuration retained. Private metadata QA recorder enabled for this staging bundle; raw-image capture is not enabled. |
| Signed physical iPhone Release compile | **PASS** (`physical-release.log`); signature verification exit 0 (`signature.log`). Bundle `uk.co.drvik.smilecompose`, version1.0/build1. App prepared at `/tmp/smilecompose-physical-release/Build/Products/Release-iphoneos/App.app`. **NOT INSTALLED** on the physical phone during this fix. |

**Test failure history:** first native draft attempt expected the photo-picker action after returning to an already prepared photo; corrected to Continue, then reproduced the actual pre-fix Home defect. First post-fix run opened the editor successfully but expected Generate while the Teeth tab was active; corrected the test to select Review. Its failed Xcode result writer stalled after tests completed and was interrupted before the final serial runs. Final iPhone/iPad runs completed normally. These harness corrections do not weaken the original draft/photograph/navigation assertions. Full-suite passing reruns do not resolve the earlier separately documented intermittent sync-conflict cause.

### 3. WHAT STILL FAILS

**FAIL — physical generation framing/mouth-registration acceptance remains unresolved**, as documented immediately below. This draft fix does not claim to fix generation. No additional live provider requests were used (0 this fix; previous agent QA budget remains exhausted at15). Durable charged-result recovery remains deferred.

### 4. WHAT WAS NOT TESTED / BLOCKED

**NOT TESTED — updated physical iPhone/iPad draft reopening, original-case image download, real Apple purchase or physical Apple sign-in.** Do not infer these from simulator fixtures. Staging backend remains unchanged because this navigation/caption fix requires no API/schema update.

### 5. WHAT NEEDS VISUAL REVIEW

Before reference: owner's local recording `ScreenRecording_10-03-2026 19-04-53_1.MP4`; dense local frames are private. After: approved synthetic `reopened-draft-editor` and `reopened-saved-comparison` screenshots exported to `output/iphone-case-reopen-2026-10-03/native-final-attachments/`; iPad attachments remain in its xcresult. Editor photograph is visibly present after reopening. Cosmetic generation quality is **HUMAN REVIEW REQUIRED**, independent of reopening.

### 6. EXACT NEXT ACTION

Install the current staging Release through Xcode **over the existing app; do not delete the app**. Open a previously affected Recent Case labelled Draft, select its Draft/Reopen design action, and confirm the original photo/settings are available to continue. Force-close/relaunch and reopen it again. Open an older completed case and verify comparison/share remain available. No paid generation is needed to test this fix. Do not upload TestFlight while the physical generation failure remains unresolved.

## PHYSICAL IPHONE FAILURE — 3 October 2026, 19:03 London

**FAIL — physical generation acceptance.** This later owner test supersedes any inferred readiness from the earlier simulator or folder samples. No generation retry, prompt/protection change, deployment, ledger adjustment or release upload was performed during this investigation. Source checkpoint `fc6b61d` (`b058747` scope implementation); installed client revision is not independently established.

### Confirmed evidence

- User reference: `/Users/vik/Downloads/IMG_3504.PNG`, error at approximately 19:03 BST. The selected mode is Full Arch, not the earlier Composite6 scenario. The displayed source includes screenshot chrome; that is an observation, **not an established cause**. No source/raw patient media copied or uploaded.
- **PASS — staging provider evidence:** read-only Supabase audit identifies two requests: `5b381c7b-2c0b-4adf-acc2-85e90ac64455` (19:02:38–19:02:47 BST) and `782bf644-5f0d-492b-8816-6a49c22a8e3d` (19:02:57–19:03:07 BST). Both use `google / gemini-3.1-flash-image`, contract `2026-10-03-treatment-contract-v8`, `full_arch`, Full-arch both / zirconia, source then prompt, no reference image, no mask sent, retry0.
- Both provider responses: HTTP200, STOP, one candidate, one inline JPEG image part, zero text/thought/other parts. Input **1152×2048**; raw output **768×1376**; requested 9:16 / 1K. Provider duration 8,570ms and 9,671ms respectively. Prepared aspect 0.5625; raw aspect 0.558139535; absolute relative drift **0.775194%**, below 3%. Source dimensions, EXIF, exact de-padding crop and on-device decoded dimensions are **NOT YET RETRIEVED**.
- **Failure-stage evidence:** the screenshot's exact text is emitted by `lockFace` in `src/app/page.tsx` only when `lockFaceOutsideLips` returns `invalidAlignment`. This is after `alignPreview` and before compositing/quality/save; the aspect guard in `alignPreview` emits different text. The likely first rejection is therefore **mouth registration / `planMouthLock`**, not provider extraction. The exact sub-rejection (generated landmarks, scale, rotation, residual, outliers or canvas geometry) remains **NOT ESTABLISHED** without the current device record. Raw visual reframing is **NOT TESTED**; dimensions alone cannot establish visual alignment.
- **FAIL — allowance/delivery:** both reservations are committed; each reserved quantity−1 and committed quantity0. Recorded balance after reservation is 68 then67. No release/refund row in the inspected owner/time window. Do not invent a local refund. Existing durable charged-result recovery remains deferred; these are additional owner-initiated requests outside the preceding 15-call QA sample, not agent retries.
- **NOT AVAILABLE — latest private device record:** initial copy attempts failed while locked (CoreDevice7000 / remote11001 / POSIX1). A later copy of only `Library/Caches/smile-generation-qa.json` succeeded after unlock; its latest timestamp is `2026-10-03T15:05:19.988Z` (16:05 BST), with neither of the two 19:03 request IDs. Evidence is private at `output/iphone-generation-failure-2026-10-03-1903/device-diagnostics.json`. No full app container, auth database or photographs retrieved. This stale file cannot establish the latest rejection subtype. The newly prepared staging build explicitly includes the privacy-safe diagnostic recorder; no raw-image capture enabled.
- **PASS — local verification only:** 17/17 existing tests across `mouth-alignment-details`, `generation-geometry-diagnostics`, `mouth-lock-diagnostics`, `generation-diagnostics`; zero failed/skipped. These verify categories, geometry metadata and privacy filtering, **not this physical failure**. No new failing reproduction/fix and no full-suite rerun claimed; production code is unchanged.

### Next action / release gate

**Do not Generate again.** Latest device metadata is unavailable in the stale cache; report missing evidence explicitly rather than blaming masks or weakening registration. Inspect raw output locally only if already retained and its content is authorised. Establish a local failing reproduction before a minimal fix. The saved-draft fix/build above is separate. **Physical generation ready for TestFlight: NO.**

## V1 SCOPE ADDENDUM — 3 October 2026

Scope fix: **b058747** on `release/v1-device-test`; rollback point **c9ff3d2**. This is a UI scope correction, not another generation-hardening implementation. Existing local Xcode display-name/scheme changes remain outside the fix commit. No push, deployment, TestFlight upload, customer case changes or commercial configuration changes.

1. **Alignment — PASS (scope/config):** previously restored by `ef193ab`; now an explicit Treatment radio choice in `src/components/studio/DesignStudio.tsx`. Uses existing `chooseAlignment`, Both visible arches and positions-only state. Teeth/Shape/Shade steps explain that natural character is retained instead of presenting ignored preset/morphology/shade controls.
2. **Full Arch — PASS (scope/config):** explicit **Full Arch / All-on-X** choice in the same selector. Existing shared request, canonical prompt, validation/compositing and repository remain in use.
3. **Treatment UI:** four main choices: Whitening, Veneers, Alignment, Full Arch / All-on-X. Veneers retains the existing single-shade composite, layered composite and porcelain choices and design controls. Choosing Whitening/Veneers clears an active Alignment choice; no silently disabled restoration list. Existing navigation, styling and result experience retained.
4. **Prompt/config:** no prompt, provider, mask, tolerance, timeout, retry or allowance change in this addendum. Contract remains `2026-10-03-treatment-contract-v8`; face transition remains v7. Reuse existing client/server Alignment/Full Arch flags ON, Single Tooth flag OFF. Prosthetic gingival changes still require explicit Full Arch + Include; zirconia alone grants none.
5. **Schema:** none. Veneers is a UI group over existing material values. Existing Full Arch plan and historical case data remain unchanged.
6. **Whitening/Veneers regression — PASS (automated):** full suite **659/659**, zero failed/skipped; TypeScript and ESLint PASS; production web/native build, Capacitor bundle checks and signed iOS Release compilation PASS. Tests cover transitions back from Alignment/Full Arch without retaining their active mode. Existing prompt/protection regressions remain enabled. Cosmetic acceptance is not established by these tests.
7. **Hidden features — PASS:** Custom/Single Tooth, Tooth Map panel, overlays, map warnings and individual controls are behind the existing opt-in single-tooth/precision flag. Normal V1 does not start Tooth Map detection/refinement from remembered display preferences. Retained implementation and reviewed-boundary protections were not deleted. Reopened historical single-tooth cases remain readable; the existing generation gate still restricts new requests.
8. **Full Arch options:** existing Upper / Lower / Both, Zirconia / Provisional and explicit Preserve / Include prosthetic gingiva. These are supported by the existing state/prompt/config; cosmetic and physical-device approval is still required for the intended configurations.
9. **Known limits:** anatomical editing scope within the shared mouth region remains prompt-dependent; no exact gingival/opposite-arch preservation guarantee. Alignment is aesthetic only, not biomechanics. Existing charged-result delivery recovery limitation remains deferred. **Zero new provider requests** in this addendum; the preceding hardening job used all 15 permitted calls. No additional live/device/cosmetic validation claimed.
10. **Manual acceptance:** install the rebuilt Release over the existing app. In normal mode, use authorised QA photos: Alignment must straighten both visible rows while retaining natural shape/shade; Full Arch must show individual anatomy without enlarging the smile, with the correct arch and gingival permission. Test Upper/Lower/Both and Preserve/Include configurations you intend to ship. For each: inspect crop, expression, lips, opening, gums, opposite arch and artefacts; save, compare, share/export, force-close, reopen and verify the same concept/settings. **HUMAN REVIEW REQUIRED** before TestFlight.

### Scope verification evidence and first failures

- `output/v1-scope-addendum-2026-10-03/studio-red.log`: three initial failures reproduce exposed Custom/map UI, the legacy chart and Alignment showing upper restorative presets. `saved-map-red.log` separately reproduces stale map instructions directing users to hidden Edit controls. Nine new scope regressions now PASS (`studio-final.log`), included in `full-tests-final.log`.
- Initial iPhone native test correctly failed at the missing Veneers treatment (`native-red-detail.log`). Later attempts tapped clipped radio coordinates and the first scroll helper overshot above the sticky tabs; screenshots and hierarchy are retained in `diagnostic-attachments`/`native-diagnostic-failure.log`. Fix the **test interaction**, not the production layout: scroll in either direction at slow velocity, stop within the visible dock and assert bounds before tapping. One overlapping runner pair was stopped; it is not counted as a product pass.
- iPhone and iPad native fixture checks PASS after that correction (`native-ui-final.log`; xcresults `iphone-fixture-1791048440983`, `ipad-fixture-1791048531948`). Checks exercise treatment switching, hidden controls, all Full Arch arch choices, Composite fixture delivery, comparison, overlay strength and force-close/reopen; iPad also landscape. These are **SIMULATOR / MOCKED PROVIDER**, not physical-device/live provider evidence. Final-bundle recheck also **PASS** (`native-ui-final-bundle.log`; xcresults `iphone-fixture-1791048730257`, `ipad-fixture-1791048825794`).
- Build/check evidence: `native-build-final.log`, `physical-release-final.log`, `signature-final.log`, `typecheck-final.log`, `lint-final.log`. Private approved synthetic UI screenshots remain in the output directory/xcresults, never committed or sent to design services. Scope screenshots include `iphone-before-Alignment.png`, `iphone-full-arch-scope.png`, `ipad-before-Alignment.png`, `ipad-full-arch-scope.png` and `ipad-ipad-landscape.png` in the same evidence directory.
- Browser inspection of localhost3006 was blocked by a saved browser permission; no workaround attempted. Native app control was unavailable while the Mac was locked. QA used the existing isolated Xcode simulator fixture runner instead.

## CURRENT HANDOVER — 3 October 2026: shared generation hardening, treatment restore and authorised folder coverage

This section supersedes older readiness statements below. Historical failed requests and evidence remain recorded.

### 1. WHAT WAS ACTUALLY FIXED

- **PASS — shared output validation:** retain actual input/raw/final geometry and safe provider part/finish diagnostics; verify decoded lossless final pixels outside the actual editing mask; reject gross uniform/blank editable regions. No provider/model replacement, relaxed aspect guard, changed registration tolerance or new segmentation dependency.
- **PASS — treatment restoration:** Whitening, Composite/Porcelain, Alignment and Full Arch use the same provider/client protection/save path. Normal client and staging server allow Alignment/Full Arch. Single Tooth/Precision/Tooth Map remain hidden by default. Full Arch prompt no longer depends on nonexistent individual crown permissions.
- **PASS — confirmed saved-media defect:** WebKit could read an IndexedDB Blob, then invalidate that same handle when the cache-access update overwrote its asset record. Copy bytes into an independent Blob before that update. Normal owner lease, MIME, outbox/path and assets remain unchanged. No customer cases deleted/reset.
- **PASS — Alignment now Both:** owner clarified that Alignment should always affect both arches. Remove Upper/Lower choices, start Both, normalise editable/regenerated legacy state and incoming generation requests to Both. Historical saved-result preference/report data is not migrated or rewritten. Full Arch keeps its separate arch choices.
- **PASS — confirmed clipped smile transition:** retained Full Arch raw output has a smooth smile; restoring the original through inferred INNER_LIP lines produces visible original-image slices through crown/gingival transitions. A tiny outward feather still left those seams. Following the owner's explicit permission to relax lip protection, stable lips now blend inside the original OUTER_LIP contour, with an inward feather and no outward growth. Detected provider lip movement uses the strict original opening. Same raw output locally reprocessed, saved/synced/reopened; no cosmetic generation retry. Surrounding face pixels remain original; inner lip texture is now allowed to blend. Exact inner-lip pixels and gingival anatomy are **not guaranteed**.

### 2. WHAT WAS TESTED — environment, commits, evidence

Branch `release/v1-device-test`. Production-source checkpoint **`8c3a9b8`**, generation contract **`2026-10-03-treatment-contract-v8`**, mouth lock **`2026-10-03-bounded-lip-transition-v7`**. QA/report commits after this checkpoint do not change production source. User's Xcode display-name/shared Release scheme changes preserved and excluded from our commits.

Matched staging: `https://smile-by-dr-vik-staging.drvik.workers.dev`; Supabase `wukcqlpuzkzwxmdkotfg`; Worker version **`657b4344-c7a5-43c4-9479-264f4f30ed97`**. No production deployment, push, TestFlight or Apple upload. Native bundle `uk.co.drvik.smilecompose`, version **1.0**, build **1**; Apple team **7TPF7LT884**. Private evidence is Git-ignored under `output/simulator-reliability-2026-10-03/`.

| Check | Verdict / actual evidence |
| --- | --- |
| Final full regression | **PASS — 650/650**, no failures/skips (`full-tests-transition-final.log`). Earlier checkpoints 648/648 and 647/647 also passed. |
| Targeted storage regression | **PASS — RED NotFoundError, GREEN**, plus 69 repository/sync tests (`webkit-media-red.log`, `webkit-media-green.log`). |
| Both-arch regression | **PASS — two expected RED assertions, 34 GREEN assertions** (`alignment-both-red.log`, `alignment-both-green.log`). General case settings schema remains backward compatible; normalisation is generation-only. |
| Lip transition regression | **PASS — missing-function RED, 27 GREEN assertions** (`lip-transition-red.log`, `lip-transition-green.log`): inferred inner-boundary pixels stay editable; source outer contour remains protected; moved lips use strict opening. Existing extreme scaling, rotation, residual and outlier rejections retained. |
| TypeScript / ESLint | **PASS** (`typecheck-transition.log`, `lint-transition.log`). An intermediate attempted settings-schema transform narrowed inferred types and failed typecheck; replaced with generation-only normalisation before final tests/build, preserving historical case parsing. |
| Web build / Capacitor / native verifier | **PASS** (`native-transition-final.log`, `bundle-transition-final.log`). Production-style web compilation, bundled staging API/CSP/auth/App Store SDK, no localhost/dev generation bypass in real bundle. |
| Signed iPhone Release / signature | **PASS** (`physical-release-transition-final.log`, `codesign-transition-final.log`). Apple sign-in/Data Protection entitlements, In-App Purchase capability, camera/Photos descriptions and privacy manifest retained. Not an installation or physical generation test. |
| Cloudflare packaging / matched deploy | **PASS** (`cloudflare-transition-final.log`, `staging-deploy-transition-final.log`), staging only. |
| Native iPhone/iPad UI | **PASS — iPhone and iPad** on current 8c3a9b8 (`native-ui-transition-final.log`, `iphone-fixture-1791046006274.xcresult`, `ipad-fixture-1791046073449.xcresult`); full Capacitor UI photo selection, Composite6, Slide touch, Overlay+/−, force-close/reopen; iPad portrait/landscape. Earlier both also passed on 8862367. Dedicated simulators only; deterministic provider fixture in a temporary signed test bundle. No Google requests. |
| Six folder photo imports | **PASS — 6/6**, native iPhone Simulator Safari (`test-folder-imports-command.log`, `test-folder-imports.json`, `iphone-imports-1791044946506.xcresult`), zero provider requests. HEIC decoded/oriented to 1536×2048. Close-up decoded but has zero face landmarks and requires reviewed edit area. |
| Fresh folder Composite requests | **PASS — 2/2**, delivered/saved/SYNCED/exact bytes reopened after Safari termination/relaunch. `IMG_3291.jpg`: 1320×1741 → prepared1320×1760 → raw896×1200 → final1320×1741, request `a5be9671-9e78-4b09-8c11-856b31c170a7`. Historical failing photo `IMG_3241.jpg`: 1320×1737 →1320×1760 →896×1200 →1320×1737, request `0b13c329-0807-482f-82f6-4de422a799fe`. Both HTTP200/STOP/JPEG, zero retries, allowance once each, source/generated478 landmarks, protected exterior0 changed pixels. |
| Folder Alignment historical Upper | **TECHNICAL PASS / VISUAL SCOPE FAIL at that checkpoint**: `69082cd1-0666-44a4-841e-8a3531a72819`, IMG_3291, lower teeth visibly changed despite then-Upper setting. Owner subsequently requested Both-only Alignment. Keep original receipt truthful; do not relabel it Both. Natural anatomy/cosmetic quality needs clinician review. |
| Folder Full Arch | **TECHNICAL PASS / HUMAN REVIEW REQUIRED**: IMG_3297, Upper Zirconia B1, Preserve natural gums, `628e0af2-a36c-4acd-99e8-3d5b6170817d`; 1320×1718 →1320×1760 →896×1200 →1320×1718, HTTP200/STOP/JPEG, 10,540ms provider, zero retries, allowance13→12. Old strict composite had the confirmed seam. Current locally replayed raw result `bb346231-473c-4839-9c8e-2a81bd6245ad` delivered/saved/synced/exact reopened, no provider request/charge; zero protected exterior changes. |
| Final fresh Both Alignment | **TECHNICAL PASS / HUMAN REVIEW REQUIRED — `9471ddf8-5a2d-42a3-8daa-983580f4f0d8`**, IMG_3291, Both Alignment Only, matched v8; source1320×1741/prepared1320×1760/raw896×1200/final1320×1741, HTTP200/STOP/JPEG,9,022ms provider,17,745ms integrated,zero retries,allowance12→11 once; exterior0 changed pixels, saved/SYNCED/exact reopened after Safari relaunch (`test-folder-both-alignment-final.log`, `iphone-live-1791046320459.xcresult`). Both rows appear straighter on local inspection; clinical/cosmetic approval is not automated. |
| Six synthetic provider results | Provider/image/alignment/exterior **PASS 6/6**, HTTP200/STOP, zero retries. Whitening saved/reopened initially; other five initially failed WebKit media readback. After the confirmed cache fix, all six retained outputs locally replayed, saved/synced/exact reopened, including force-close/relaunch. **Replay is not six additional live successes or six refunds.** |
| Physical iPhone/iPad current code | **NOT TESTED**. Earlier physical charged failures below remain true; do not replace them with simulator PASS. |
| Real Apple sandbox purchase / Apple sign-in on current physical build | **NOT TESTED / DEVICE TEST REQUIRED**. RevenueCat commercial settings were not changed. |

Live native Safari tests exercise current client preparation/alignment/compositing, account-isolated repository and normal authenticated staging case/assets API; they are distinct from full native Capacitor UI tests using a captured provider fixture. No privileged access substitutes for the normal case API. Saved-case receipt verifies usable media bytes, not status text alone. Current tests do not prove every older missing customer case has recovered.

**Failure history kept:** first selector assumptions (Other vs Button, Switch vs Button), hardware-keyboard assumption, skipped live scheme environment and zero-result run were QA harness failures, fixed before valid runs. A concurrent simulator UI/live invocation crashed the test runner before any provider request; stopped and reran serially. Commands must run serially. The sync-conflict test passed all current full runs, but its earlier intermittent failure has no newly established root cause; no claim that a rerun fixed it. Initial desktop QA put full image strings into localStorage and exceeded quota after repository save; harness now stores SHA references only. Normal application storage was not changed to address that harness issue.

### 3. WHAT STILL FAILS / limitations

- **FAIL / release blocker for paying external users — durable charged-result recovery.** Server commits allowance after returning a valid provider image. On-device validation, delivery or save can still fail afterward. General recover/redeliver/refund lifecycle is not implemented. No local refunds, ledger edits or unsupported “generation returned” messages. This pass reprocessed retained disposable QA outputs only.
- **HUMAN REVIEW REQUIRED — anatomy/cosmetics.** Pixel preservation outside a mask does not prove mask anatomy, correct natural gums, selected/unselected tooth boundaries or a clinically achievable result. Full Arch Upper/Lower opposite-arch preservation remains prompting-only on the ordinary shared path. Do not advertise deterministic arch isolation.
- **NOT TESTED — original affected customer saved case.** Confirmed WebKit readback failure is fixed. Already-lost local bytes with no cloud backup cannot be promised recovery. No original case deleted/reset/regenerated. Inspect affected case read-only on updated physical build if still unavailable.
- **NOT TESTED — broad clinical scenario matrix.** Live folder coverage includes crowded dentition, historical failing male portrait and compromised/missing dentition. HEIC/close-up imports tested locally. Rotation/spacing/low-display/4-vs8/10/posterior Full Arch/limited display need manual review. No automated “ideal cosmetic outcome” truth.
- **Distribution legal guard remains blocked:** 40 owner/legal markers (23 privacy,17 terms). Development-signed owner Release compiled; this does not waive App Store/legal review or permit a distribution claim.

### 4. EXISTING SYSTEM AND EXACT CHANGE BOUNDARIES

**Orchestrator/provider:** authenticated `handler.ts` validates permissions/features, request claim and allowance reservation; shared `generateSmile` calls the existing Gemini Developer API **`gemini-3.1-flash-image`**, then commits allowance and returns image. Client `requestPreview` prepares source canvas, calls shared `SmileImageService`, removes known padding, validates aspect, detects face/aligns, composites and saves through existing case repository.

**Central prompt:** `contract.ts` normalises render-relevant settings, `prompt.ts`/`imageEditPrompt.ts` render the same contract. No duplicate treatment prompt pipeline. Full Arch reconstruction wording changed at v7; v8 normalises Alignment to Both. Standard Composite/Porcelain/Whitening literal contracts are unchanged. Explicit FullArch+prostheticGingiva Include alone permits selected prosthetic interface changes; Zirconia alone does not. Auto means Preserve/Exclude. Alignment Only retains natural shade/shape and uses positioning permission, not veneers or biomechanical predictions.

**Segmentation/ROI:** bundled on-device MediaPipe478 locates face/lips and stable anchors. Existing dental/SlimSAM refinement remains available only when requested behind precision controls; no normal generation wait/dependency. Ordinary standard, Alignment and Full Arch still share a mouth ROI. No new treatment-specific dental masks. Requested tighter whitening/wider Full Arch-specific masks conflict with available unreviewed segmentation; documented instead of a silent architecture rebuild. Gums and dental arch/tooth scope inside that region rely on prompts. Experimental arch map compositor remains OFF.

**Geometry:** browser-decode/EXIF normalisation, max2048 source preparation without cropping; known provider padding via `generationCanvas/sourceBounds`; raw dimensions/MIME/orientation read before alignment. Track cropX/Y/W/H and scaleX/Y to exact source-sized canvas. Existing ≤3% prepared/raw aspect guard remains. Existing similarity scale0.85–1.18, rotation≤8°, median residual≤max(3px,4%mouth), ≤1 outlier beyondmax(6px,10%mouth) remain unchanged. No stretching to rescue genuine reframing. Same-aspect different resolution and expected rounding/padding tested; genuine mouth-only/crop output remains rejected.

**Mask/composite:** stable original outer lip contour defines bounded smile transition after owner's requested relaxation; inward feather max(1px,0.5%mouth width), growth0. When detected lip movement exceeds existing tolerance, use original inner opening with the same inward feather. Face beyond original outer contour remains source pixels; final lossless PNG is decoded and checked outside actual alpha>0 region. Uniform editable range≤2 is a technical rejection only, not an aesthetic classifier. Neither masks nor prompting guarantee exact gums. Reviewed single-tooth/painted masks still narrow the edit in their retained internal path.

**Retry/accounting:** maximum one retry, only first empty/text-only provider response; same owner request ID/reservation. No cosmetic, protection, safety, timeout or malformed-geometry retry. Duplicate claims and atomic allowance commit/release unchanged. Provider-failure release tests pass. All live requests in this pass had retryCount0.

**Storage/schema/report:** no migrations, enums, products, prices, allowances or report redesign. Staging schema inspected read-only: treatment stored as text/JSONB and existing account-owned asset paths support these modes. Existing state schema1 retained. Media fix only snapshots cache Blob bytes before access write; no ownership loosening or data deletion. Existing labels/reports cover restored treatments; historical preferences stay historical.

**Files:** production commits below contain diagnostics/provider/shared protection tests; availability/client/server flags; `fullArch.ts`, canonical contract; `DesignStudio.tsx`, `page.tsx`, generation schema/version; `cases/sync/coordinator.ts`; `face/lock.ts`, `face/mouthLock.ts`. QA scripts/projects/harness are isolated from production imports; fixture JS is injected only into a temporary simulator app. SDK blanking occurs in that disposable simulator bundle only.

### 5. WHAT NEEDS VISUAL REVIEW

Open private `output/simulator-reliability-2026-10-03/visual-review.html`: Original | raw | final for synthetic/replayed and authorised folder tests. Includes actual source inner/outer contour overlay and same-raw before/after transition crops. The source image itself remains full-frame. Review crowns, gingiva, smile envelope, opposite arch, material appearance, missing tooth handling and any seams. UI screenshots are `iphone-fixture.png`, `ipad-fixture.png`; iPad landscape attachment is inside the xcresult. No identifiable imagery uploaded to a design/analytics service or committed to Git.

### 6. EXACT NEXT ACTION — owner device acceptance before another release decision

1. Open `ios/App/App.xcodeproj` in Xcode. Target **App → Signing & Capabilities**, automatic signing, team **7TPF7LT884**. Choose connected unlocked iPhone; **Product → Scheme → Edit Scheme → Run → Release**; **Product → Run**. Do not Archive/Distribute. Enable Developer Mode/trust this Mac if prompted. Install over existing app; do not delete it.
2. Normal mode, email login; new case with authorised **IMG_3241.jpg**, **Composite6 / Natural or Balanced / Keep or explicit B1**. Generate once. Inspect source frame, crown edges/contacts, lips/expression/mouth opening and exterior face, no grey/blank areas. Save, force-close, reopen and export. If failure, stop, collect request ID/time/path/count/dimensions/HTTP/stage through existing private diagnostics; no repeated retries.
3. **IMG_3291.jpg — Both Alignment Only**, natural shape/shade. Both visible rows may straighten; no veneers, extra teeth, widened opening or orthodontic accuracy claim. Save preferred/reopen.
4. Same clear portrait: **Whitening6 / Whiten**, then **Porcelain6 / B1 / Natural** on separate concepts. Whitening must be colour-only; Porcelain may alter permitted appearance. Review untreated teeth and gum transitions manually. Later inspect 4/8 tooth presets, Natural/Refined/Hollywood and brighter targets without silently overwriting previous results.
5. **IMG_3297.jpg — Upper Full Arch ZirconiaB1 / Preserve gums**; inspect coherent individual crowns, missing-tooth replacement, posterior continuity and lower arch preservation. Then explicit **Include prosthetic gingiva** only if intentionally requested; verify pink interface does not reach lips. Cosmetic acceptability/arch isolation must be reviewed, not inferred from a technical PASS.
6. **IMG_3166 2.HEIC** native photo picker: orientation/full frame; **IMG_3296.jpg** close-up: reviewed Protect edit area required if face cannot be found; no unprotected generation bypass.
7. Saved case offline locally available → compare/export; reconnect/sync; another signed-in device → download/reopen; sign out/account switch → no cross-account case/media. Recheck the original previously unavailable case without deleting or regenerating it.
8. Repeat core Composite save/force-close/reopen and comparison Slide/Overlay gestures on iPad portrait/landscape. Test Apple sign-in/logout separately; one real Apple sandbox subscription/restore is still required to prove RevenueCat event delivery. Never treat configuration as a purchase test.

Repeatable commands: `npm run qa:ios-simulator` builds/syncs and runs deterministic native iPhone/iPad QA with zero Google calls. `npm run qa:ios-live-generation -- --imports-only` checks six authorised folder imports with provider disabled. Explicit paid command is separate; do not run it again after the budget below. Live fixtures require the private disposable staging credentials/evidence; no credentials in Git. Run these commands serially.

### Provider request accounting and rollback

**Final counter: 15 actual provider calls in this pass**: four early synthetic, six treatment synthetic, five authorised folder. Provider budget exhausted; no further calls. All retry0. Six synthetic local replays and one folder replay are zero provider calls. Historical charged 13:07/14:22 failures are retained below, not silently refunded or relabelled.

| Fix / rollback point | Commit |
| --- | --- |
| Baseline before this pass | `341a4726f04cc3dfef148a6a1fcab95999e35bd3` |
| Encoded protection / diagnostics / bounded retry | `04765f7` |
| Restore treatments / Full Arch contractv7 | `ef193ab` |
| WebKit media snapshot fix | `8862367` |
| Both-only Alignment / contractv8 | `f1169dc` |
| Authorised bounded lip transition | `8c3a9b8` |

Separate commits allow scoped revert review; no automatic rollback/reset of shared dirty checkout. No merge/push performed.

**Small internal TestFlight candidate:** owner-led staging testing after current physical core acceptance and existing distribution guard/manual items. This pass prepares/builds; it does not upload or certify TestFlight readiness. **Remain hidden:** Single Tooth/precision/Tooth Map and experimental arch compositor. **Explicitly limited:** Alignment is visual, both arches; Full Arch is a concept, not implant/lab planning; deterministic opposite-arch/gingival protection is not established. **Before external dentists/paying users:** durable charged-result recovery, physical save/reopen/account/purchase evidence, reviewed clinical imagery, original missing-case investigation if still failing, legal/distribution requirements.

---

## 3 October — mouth-alignment diagnostic Release installed; ONE physical retest FAILED

**CORE 6-TOOTH READY FOR TESTFLIGHT: NO.** This is an evidence-gathering build, not a root-cause fix or a release approval. The single authorised physical generation failed at 14:22 BST. Exactly one new device request was recorded; provider retries were zero. The raw provider response and device diagnostic record were retrieved locally. No prompt, protection threshold, request schema, backend, allowance configuration, existing case or commercial configuration was changed. The test consumed one generation through the existing ledger.

### WHAT WAS ACTUALLY IMPLEMENTED

- **PASS:** the existing planner now emits the first actual rejection branch: missing/invalid source landmarks, missing/invalid generated landmarks, insufficient mouth width, out-of-range scale, out-of-range rotation, excessive median residual, or excessive anchor outliers. The existing mouth-lock canvas aspect branch emits `canvas_geometry_invalid`. No fictitious `invalid_transform` or catch-all planner branch was introduced.
- **PASS:** safe counts, mouth widths in the normalized source coordinate system, fitted scale/rotation, residual/allowed residual, outlier/allowed count and source/normalized generated dimensions are recorded where available. Early rejection values not calculated are omitted rather than invented. Diagnostic observers cannot change acceptance or throw into delivery.
- **PASS:** raw decoded dimensions, JPEG/PNG MIME and detectable EXIF orientation are observed immediately after the existing raw decode and **before** aspect validation, padding removal or compositing. No second orientation correction or image decode was added. EXIF is parsed only for the bounded orientation tag; unknown/truncated headers yield `null`. Native EXIF behaviour still needs physical evidence.
- **PASS:** optional **QA-only local synthetic capture** writes Original/Raw before alignment and Final after successful protection to `Library/Caches/smile-qa-synthetic/<request ID>/`. It is off by default, requires native staging, and authorizes only the exact approved synthetic file SHA-256. Prepared source content is then fingerprinted in memory: filename, patient/demo flags and saved metadata cannot authorize capture. A new non-approved import or workspace detach revokes authorization. One request per app session can capture, including concurrent-call protection; errors cannot fail generation. No capture enters normal diagnostics, the repository, outbox, cloud storage or analytics.
- **PASS:** metadata remains in the existing opt-in private `smile-generation-qa.json` allowlist. No photograph, landmark array, patient identifier, clinical note, provider text or token was added.

**Unchanged guards:** 3% aspect drift; mouth width ≥20 px; fit trigger 1.2% of source mouth width; scale 0.85–1.18; rotation ≤8°; median residual ≤max(3 px, 4% mouth width); outliers above max(6 px, 10% mouth width), at most one. Mouth polygon/growth/feather, compositing, selected-region protections, prompt and provider are unchanged.

### WHAT WAS TESTED — environment and evidence

Branch **`release/v1-device-test`**, base **`341a4726f04cc3dfef148a6a1fcab95999e35bd3`**, diagnostic changes currently uncommitted. Existing user Xcode display-name and shared Release scheme changes remain intact. Private Git-ignored evidence: **`output/mouth-alignment-diagnostics-2026-10-03/`**; `build-receipt.json` fingerprints each changed source/test file and records configuration without keys.

| Check | Result / evidence |
| --- | --- |
| Categorical regression red/green | **PASS:** 12 planner/privacy assertions originally failed with missing diagnostics; targeted final **34/34** passed (`red-planner.log`, `targeted-final.log`). Capture tests initially failed with the missing capture module; subsequent tests cover default-off, non-native/production rejection, wrong file/source, workspace revocation, concurrent calls and contained I/O failures. |
| Full regression | **PASS: 634/634**, zero skipped/failing (`full-tests-final.log`). Prior intermediate suite **633/633** also passed. No tests weakened. |
| TypeScript / ESLint | **PASS:** final commands exit 0 (`typecheck-final.log`, `lint-verified.log`). First typecheck found a wrong config export name; corrected to the existing `NATIVE_API_ORIGIN` before build. |
| Production web/native build | **PASS:** `npm run build:native`, staging + diagnostics + synthetic capture flags (`native-build-normal.log`). The restricted build stalled and was stopped; the identical build passed with normal local permissions. |
| Capacitor / native safety checks | **PASS:** sync and `SMILE_RELEASE_BUILD=1 node scripts/verify-ios-bundle.mjs` (`cap-sync.log`, `native-verification.log`). Staging CSP/Supabase, App Store SDK presence, bundled workers, no secret/provider credentials or remote dev server verified. |
| Signed physical Release | **PASS:** `xcodebuild … -configuration Release … build`, deep strict signature verification; signed Apple sign-in and Complete Data Protection; bundle `uk.co.drvik.smilecompose`, version 1.0/build 1 (`xcode-release.log`, signed entitlements). Existing third-party Swift warnings remain. |
| Installation | **PASS:** in-place update installed on connected physical iPhone 17 Pro Max (`device-install.log`). Signed app web entry matches the synced bundle; no app data reset/deletion. |
| Matched staging contract | **PASS:** only client observability changed. Deployed v6 generation request/prompt contract and server gates remain unchanged. Read-only staging pricing returns `gemini-3.1-flash-image`. No Worker deployment needed/performed. |
| Browser, current code, no provider | **PASS:** unchanged padded image, 900×1200 same-aspect output, 896×1200 rounding simulation and the historical output all normalize to 1320×1737, detect 478/478 landmarks and pass mouth locking. Historical fitted scale 0.9236117, rotation −1.7538°, median residual 6.0733 px versus allowed 13.6490, zero outliers (`local-browser-receipt.json`, `local-checks-current.png`). **Desktop in-app browser, not physical validation.** |
| Distortion / framing rejection | **PASS:** genuine scale/rotation/residual/outlier failures and square/reframed canvas remain rejected. Canvas branch verified through the real mouth-lock function with substituted browser boundaries. |
| Physical new-generation / save / reopen | **FAIL:** request `6b937aba-2ba3-424a-beb3-51cc0bba0150` rejected with `generated_landmarks_missing`. Raw captured/retrieved. Save/reopen **NOT TESTED**, because no usable concept was delivered. |

**Recorded unsuccessful checks:** initial `tsx` CLI raw-metadata invocation hit a sandbox IPC `EPERM` and did not run assertions; subsequent `node --import tsx --test` ran successfully. The first refreshed local harness lacked a build-time `process.env` replacement and stopped before processing; supplying the QA-capture-off definition made all four local checks pass. Neither was a provider failure. The production build stall and config-export typecheck failure are retained in private logs, not erased by later passes.

### WHAT STILL FAILS / WHAT WAS NOT TESTED

The 13:07 request remains a confirmed charged, undelivered result. Its raw bytes and exact planner condition were not retained; this instrumentation cannot retroactively recover them. The older request’s precise underlying condition remains **NOT DETERMINED**; do not attribute the new request’s raw image to that older incident. No refund performed. Durable charged-result recovery remains deferred. This diagnostic build is development-signed Release for the owner, not App Store/legal readiness: the existing distribution build guard still requires resolution of 40 owner/legal markers. No TestFlight or Apple upload occurred.

### ONE PHYSICAL RETEST — FAIL; STOP

**Request:** `6b937aba-2ba3-424a-beb3-51cc0bba0150`, provider start **13:22:10.985131 UTC / 14:22:10.985 BST**, finish **13:22:21.289379 UTC**. Source is the approved synthetic fixture, and the on-device capture reports `saved`. The first diagnostic copy timed out; after the user reconnected/unlocked the phone, the QA JSON and only this synthetic request’s Original/Raw files were retrieved successfully. No second generation was requested.

| Required diagnostic | Actual evidence |
| --- | --- |
| Provider image | **YES:** valid JPEG, HTTP 200, STOP; one candidate/one image part, no text/thought/other parts; 10,224 ms, zero retries |
| Source / prepared input | **1092×1440 / 1092×1456**; 8 pixels known request padding above/below |
| Raw dimensions / EXIF | **896×1200 / no orientation tag**; native raw observer and locally inspected file agree |
| Normalized dimensions | **1092×1440** before mouth-lock planning |
| Raw aspect drift | **0.4444444444%**, within unchanged 3% guard; normalized canvas drift 0% |
| Source landmarks / generated landmarks | **478 / 0** |
| Exact first rejection | **`generated_landmarks_missing`**, stage **`mouth_composite`**, error `mouth_alignment_rejected` |
| Mouth width / scale / rotation / median residual / outliers | **N/A:** rejection occurs before mouth-width calculation or transform fitting; no numeric threshold rejected this output |
| Raw visual review | **FAIL:** isolated enlarged/retracted dental close-up within a grey portrait canvas; original full face absent. This is already present in raw bytes, before app padding removal or compositing. |
| Final / mask / save / reopen | **NOT AVAILABLE / NOT TESTED:** rejected before a plan/composite/final save; no final result or invented mask overlay produced |
| Allowance | **CONSUMED once, 71 → 70**: reservation −1 at 13:22:10.870608 UTC, committed quantity 0 at 13:22:21.311869 UTC. No refund/release entries, no manual ledger change. |
| Matched contract | **PASS:** actual receipt confirms standard mode, six selected teeth, Gemini `gemini-3.1-flash-image`, prompt `2026-10-03-treatment-contract-v6`; ledger treatment Single-shade composite / Auto. Zero matched Case Library style references recorded. |

**ROOT CAUSE — confirmed for this retest:** the provider returned mouth-only content instead of a full-face edit. The normalized output therefore has no detectable face landmarks, and the existing safeguard correctly rejects it **before fitting or compositing**. The real raw image rules out a mere aspect-rounding error and provides no basis for loosening scale/rotation/residual thresholds. The initiating reason Gemini chose that content remains unproven; no speculative prompt/provider change was made. This does not prove the same raw content occurred in the older 13:07 request, whose raw result is lost.

**Visual evidence:** private `physical-original.jpg`, `physical-raw.jpg`, `visual-review.html` (Original | Raw | Final unavailable), `physical-request.json`, `physical-summary.json` and `physical-ledger.json`. **HUMAN REVIEW REQUIRED** for raw imagery; no cosmetic acceptance claim. All evidence remains Git-ignored/local and file permissions restricted. Normal QA JSON contains structural metadata only, not either image.

**NEXT ACTION:** keep release paused. Investigate the input/prompt/provider content contract in a separately scoped follow-up using the retained output; do not retry or weaken protection on this evidence-gathering pass. Durable charged-result recovery remains unresolved and must not be described as refunded.

**Provider requests used in this diagnostic pass: 1, zero retries. PHYSICAL RESULT: FAIL. CORE 6-TOOTH READY FOR TESTFLIGHT: NO. STOP.**

---

## 3 October, 13:07 BST — physical iPhone failure: RELEASE STOPPED

**This incident supersedes the readiness verdict below. CORE 6-TOOTH GENERATION READY FOR TESTFLIGHT: NO.** No application fix, prompt change, guard relaxation, generation retry, refund, deployment, installation or upload was performed. Existing Xcode display-name/shared-scheme edits are preserved.

### Exact request — PASS: identified

- **`fc582b9b-564e-4249-9733-99bb71693dc6`**, provider start **12:07:06.710145 UTC / 13:07:06.710 BST**, finish **12:07:19.110703 UTC** on 3 October 2026.
- Staging `POST /api/generate-smile` → GeminiSmileProvider → Google **`gemini-3.1-flash-image`**; prompt **`2026-10-03-treatment-contract-v6`**, standard path, **6 selected teeth**. Ledger treatment: **Single-shade composite / Auto**. Supplied screenshot confirms six upper teeth. No selected FDI array is retained in diagnostics.
- **PROVIDER RETURNED IMAGE: YES.** HTTP **200**, finish **STOP**, one candidate, two response parts: one valid non-thought **image/jpeg**, one text part; zero thought/other parts. Structural image validation succeeded. Provider latency **12,310 ms**; retries **0**. Provider text was neither retrieved nor logged.
- Read-only physical iPhone QA copy confirms **`stage=mouth_composite`, `outcome=failed`, `errorCode=mouth_alignment_rejected`**. Private metadata evidence: `output/iphone-framing-failure-2026-10-03/{device-request.json,provider-audit.json}`. No patient photographs, landmarks, clinical text, credentials or raw provider text in those files.
- This request's cloud case has confirmed source/prepared-photo and thumbnail assets; no generated-result asset was found. Existing case/media were not changed.

### Allowance — CONSUMED; no refund

Reservation **12:07:06.639375 UTC**, quantity **−1**, `balance_after=71`: **72 → 71**. Committed **12:07:19.129574 UTC**, separate commit quantity **0**, result reference **`8d6e4a59-5305-4acd-a240-7a23f0bab9dd`**. Reservation remains **committed**; no refund/release entry for this request. The existing release RPC only transitions `reserved`, not `committed`, and there is no authoritative client-delivery-failure recovery operation. No ledger edits or local refund made. This is a confirmed incident under **durable charged-result recovery: DEFERRED**.

### First rejected stage — established; underlying cause — NOT DETERMINED

Provider extraction and `alignPreview` completed. `lockFaceOutsideLips` then returned `invalidAlignment=true / mouth_alignment_rejected`; `page.tsx` threw the exact screenshot message. The first rejection is **mouth-composite alignment planning, before pixels are composited and before saving**. The 3% aspect guard inside `alignPreview` **did not reject**: it has different copy, and the last recorded stage would have been `align`.

The mouth-lock code groups missing/invalid generated landmarks, invalid source landmarks, insufficient detected mouth width, disallowed similarity-transform scale/rotation, and excessive stable-anchor residuals into this one error. It also checks aspect, but the prior normalization already exports a source-sized JPEG. Current QA records omit the individual rejection condition, detector outcome, fitted transform and residuals. They cannot establish which underlying condition occurred in this request.

### Geometry / orientation

| Stage | Dimensions / aspect | Evidence |
| --- | --- | --- |
| Local prepared source | **1320 × 1737 / 0.7599309154** | iPhone QA + confirmed cloud asset metadata; matching approved test-folder JPEG |
| Temporary prepared request | **1320 × 1760 / 0.75** | iPhone QA + current canvas calculation |
| Provider input | **1320 × 1760 / 0.75** | Staging provider diagnostics |
| Exact raw provider output | **UNKNOWN** | Dimensions/bytes were not retained |
| Intended source crop | **x=0, y=0.00625, width=1, height=0.9869318182**, normalized | Existing request-padding bounds |
| Completed alignPreview canvas | **1320 × 1737 / 0.7599309154** | Current source-sized export; subsequent stage recorded on device |
| Final expected canvas | **1320 × 1737 / 0.7599309154** | Source dimensions |

- Matching local JPEG visually agrees with the supplied screenshot and has **no EXIF orientation tag** (`sips`). Preparation draws decoded pixels into a JPEG canvas, removing source EXIF. This fixture needs no 90° source rotation. Raw provider EXIF and decoded orientation were not retained.
- Padding: **11 pixels top, 12 bottom**, none horizontally, no source scaling at this size. Removal applies the same normalized bounds to raw decoded dimensions. Final mask/landmark coordinates use the original source canvas.
- Prepared/source aspect difference: **1.3068181818%**; inverse source/prepared difference: **1.3241220495%**. These are intentional padding differences, not observed provider drift.
- Actual raw drift: **UNKNOWN, but alignPreview's >3% rejection was not triggered**. Its accepted decoded aspect range is **0.7275–0.7725** against prepared **0.75**. A decoded square result would fail earlier and cannot explain the recorded stage. A content crop within a portrait canvas remains possible.
- Expected aspect after source-sized normalization: **0.7599309154**, drift **0%** relative to the source. No exact raw/de-padded natural aspect or returned-padding integrity can be measured without the lost output.
- Google documents differing output-resolution buckets: this model's **3:4 / 1K** size is **896 × 1200**, **0.4444444444%** drift from exact 3:4. This is a documented size, **not a measured dimension for this request**. [Google image-generation dimensions](https://ai.google.dev/gemini-api/docs/generate-content/image-generation#aspect_ratios_and_image_size)
- Existing normalization handles different resolution and known request padding. It assumes returned content retains the known frame; dimension equality alone does not prove anatomical alignment. No extra crop, stretch, tolerance change or guessed padding recovery added.

### Local no-provider reproduction — PASS, with limits

The user started the prepared loopback-only harness after sandbox listening was denied and automatic approval review could not run the server because of a usage-limit error. No alternative was used to bypass that rejection. Actual browser interaction subsequently ran the current photo preparation, face worker, alignment and mouth lock on approved local content. No provider request, cloud write or patient-photo display in the harness.

| Local scenario | Raw dimensions | Source/generated landmarks | Mouth lock | Aligned median residual |
| --- | --- | --- | --- | --- |
| Unchanged padded canvas | 1320 × 1760 | 478 / 478 | PASS | 0.7644 px |
| Same aspect, smaller resolution | 900 × 1200 | 478 / 478 | PASS | 1.5277 px |
| Documented rounding simulation | 896 × 1200 | 478 / 478 | PASS | 0.9306 px |
| Historical output, different request | 896 × 1200 | 478 / 478 | PASS | 6.0733 px |

All normalized to **1320 × 1737**; allowed median was **13.6490 px**, all had zero excessive anchor outliers. Historical fitted scale **0.9236117**, angle **−1.7538°**. Evidence: private `local-browser-receipt.json`, `local-checks.jpg` and local harness source. These are **desktop in-app browser tests, not iPhone Safari/WebView tests**. They show the known geometry and an older output can succeed; they do not recover or explain the exact failed output. The existing genuine-distortion rejection tests still pass.

### Raw image — unavailable; no speculative fix

**RAW IMAGE VISUALLY REFRAMED: NOT DETERMINED.** Raw response bytes are transient server/client memory, while result persistence runs only after protection succeeds. Neither diagnostic schema saves raw bytes/dimensions, and this cloud case has no generated asset. Original-versus-raw inspection for this exact request is blocked. Historical raw images and documentation must not be substituted as evidence for it.

**ROOT CAUSE:** confirmed client mouth-alignment rejection following a valid provider response; its precise detector/transform cause is not determinable from retained evidence. An exact geometry-mismatch or actual Gemini reframe diagnosis would be invented. **FIX / exact failing regression: NOT IMPLEMENTED** because that cause remains unknown. No passing characterization was labelled a failing regression.

### Verification / stop

- **PASS:** **26/26** targeted tests; **613/613** full tests, no failures; TypeScript and ESLint exit **0**. Logs are private in the incident directory. Source checkpoint **`341a4726f04cc3dfef148a6a1fcab95999e35bd3`**, branch **`release/v1-device-test`**, application source unchanged; earlier app release source **`427c645e74f2f2995486eebbf0d895314df34b5c`**.
- **NOT TESTED:** actual failed raw-image review, real EXIF-rotated iPhone reproduction, production rebuild/matched deployment and physical retry. No release rebuild while the underlying bug is unexplained.
- **New provider calls this investigation: 0.** No retries. No fake refund. No production or staging deployment.
- **Exact next development action:** narrowly instrument categorical landmark outcomes, output geometry and the specific transform-rejection condition; retain raw output locally only under explicit approved-QA capture. No images/landmark arrays/raw errors in general logs. This is a required evidence step, not a root-cause fix or licence to generate repeatedly. User approval needed before any new generation beyond the conditional acceptance run.

**PHYSICAL RETEST: NOT TESTED. CORE 6-TOOTH GENERATION READY FOR TESTFLIGHT: NO.** Keep release paused. The single permitted physical acceptance generation must wait for an evidence-backed fix and regression/build checks.

---

# SmileCompose V1 — focused stabilisation handover

## 3 October — final staging backend gate / internal candidate

**Latest checkpoint; supersedes the deployment/readiness state below.** Scope was narrowed to the owner-led internal candidate. Demo portrait replacements, further UI changes, optional generation modes and billing-lifecycle redesign are deferred. No production deployment, push, TestFlight upload or Apple submission occurred.

### 1. WHAT WAS ACTUALLY FIXED

- **PASS:** Single Tooth, Alignment and Full Arch are hidden in the normal V1 client. A one-tooth selection cannot generate; it explains why. Custom multi-tooth remains available. Existing single-tooth cases retain their historical media/settings and can reopen, but unsupported regeneration is blocked.
- **PASS:** the backend rejects those modes with `403 / mode_unavailable` before request claim, reservation or provider use. Client-supplied `internal: true` cannot bypass this. Explicit server-only internal flags retain the implementation; staging has all three off. An enabled internal flag still requires normal authentication for a real provider.
- Preserved face/mouth protection, prompt contract, data, commercial configuration and schema. No generation/compositing redesign or weakened protection was used to obtain a pass.
- Fix commits: **`7107c59`** (client gates and compatibility regressions; rollback parent `5988312`), **`427c645e74f2f2995486eebbf0d895314df34b5c`** (server gates; rollback parent `7107c59`). Revert client/server gates together when intentionally restoring modes; do not leave them mismatched.

### 2. WHAT WAS TESTED — environment, commit and evidence

**PASS — staging backend gate.** Source candidate `427c645`, branch `release/v1-device-test`; Worker **`0b517052-e4b3-4e53-a2eb-0cfc052dd062`**, tagged with the full source commit. URL: `https://smile-by-dr-vik-staging.drvik.workers.dev`. Previous Worker rollback: `fefc6124-3ba4-4fae-82bb-9949e4fd0d5b`. Supabase **`smilecompose-staging` / `wukcqlpuzkzwxmdkotfg`**: all eight local migrations match the remote list, latest `20261002154000_identity_deletion_audit`. No migration was applied.

Private, Git-ignored evidence: **`output/final-rc-2026-10-03/`**. Logs and receipts contain synthetic fixtures/structural diagnostics; temporary auth keys are not part of the report or Git.

| Gate | Evidence and result |
|---|---|
| Full regression | **PASS: 613/613**, zero skipped (`full-tests-final.log`) |
| Focused mode/contract checks | **PASS: 22/22** (`gates-final.log`); prior red tests failed before gates were implemented |
| TypeScript / ESLint / diff whitespace | **PASS** (`typecheck-final.log`, `lint-final.log`) |
| Production web / Cloudflare packaging | **PASS** (`production-build.log`) |
| Client/backend match | **PASS:** 14 deployed entry JS assets match local bytes; 142 native files match the signed app (`matched-artifacts.json`) |
| Patient case API / private media | **PASS:** normal authenticated user create, queued save/upload, acknowledged revision/assets, fetch and actual binary recovery |
| Case reopen | **PASS:** restart with queued local work; second independent IndexedDB repository downloads cloud-only media; source/result hashes match; restored settings deep-equal; offline cache restart works |
| Account isolation | **PASS:** account B list/read/download denied, direct table/storage ownership enforced, anonymous/private-public access denied. This does not certify the MFA boundary noted below. |
| Delete/tombstone | **PASS:** disposable fixture deletion, idempotent retry, reconnect tombstone and `410` media response |
| Deployed feature gates | **PASS:** four stale-state fixtures (Single Tooth, Alignment, Full Arch Exclude/Include) rejected; allowance unchanged |
| Allowance | **PASS:** final successful generation consumes exactly one; provider-failure reservation release and duplicate/refund accounting regressions pass |
| RevenueCat webhook backend | **PASS:** missing authorization `401`; authenticated unknown-user event `ignored_unknown_user`; same event ID again `duplicate`; monthly/annual/trial mapping and SQL idempotency regressions pass |
| Signed iOS Release | **PASS:** build and strict signature verification; bundle `uk.co.drvik.smilecompose`, **1.0 (1)**, Team `7TPF7LT884` |

The live backend harness recorded **43 passing checks**. It imported the actual client generation service and case repository with separate IndexedDB factories, using the disposable users' normal bearer tokens. Admin access was used only for the authorised disposable isolation-user fixture and its cleanup, not to bypass generation or case/media access. This is a **Node/API repository test**, not physical-device or simulator execution.

#### One final live generation — PASS for backend delivery

- Approved synthetic demo only: `output/stage3-evidence/generation-source.jpg`; no identifiable patient/test-folder photographs uploaded.
- Composite, 6 upper teeth `[13,12,11,21,22,23]`, request **`05be0c24-4550-420e-ba3b-a351cf20f4d5`**.
- Google `gemini-3.1-flash-image`, prompt **`2026-10-03-treatment-contract-v6`**, HTTP app/provider **200/200**, finish **STOP**, **one inline JPEG**, zero text/thought parts, **zero retries**. Provider latency **8.900 s**, service round trip **10.009 s**.
- Prepared input **1092×1456**; returned JPEG **896×1200**. Decodes and visually contains a complete face/smile, not grey/blank corruption. Fine anatomical/cosmetic acceptance remains **HUMAN REVIEW REQUIRED**.
- Allowance **5 included / 3 used / 2 remaining → 5 / 4 / 1**. Normal-user diagnostics show **4 provider starts and 4 finishes total across the five-request budget**, zero provider retries. No further generation calls were made. Four server-gate probes did not reach the provider; the historical malformed fixture also did not.
- Saved case **`4ff2bc36-64be-4c24-a89b-b594e7fef613`** reopens with the identical delivered image on a second repository and its offline restart. Receipt: `final-generation-receipt.json`; owner-readable events: `final-provider-audit.json`; final total: `final-budget.json`.
- This final smoke saves the **backend-delivered image** to verify delivery/persistence. It does **not** exercise or substitute for on-device alignment/compositing. The previous browser Original/Raw/Final pack remains `output/matched-staging-2026-10-03/review.html`; no new protected-final result or physical validation is claimed.

#### Failures, investigation and reruns

1. First `npm test` could not create the test runner's IPC pipe under sandbox restrictions (`EPERM`); it did not run tests. Running with normal local permissions passed **608/608**, then **613/613** after adding five gate checks. No tests weakened.
2. New internal-flag auth test initially got `503` because its fixture used `GEMINI_DATA_TERMS` instead of the existing `SMILE_GEMINI_DATA_TERMS`. Corrected the test fixture; now verifies `401 / auth_required`. No provider call or application change resulted.
3. Earlier contract test edit used unsupported top-level await in the CommonJS test harness; moved its import inside the test. Exact prompt snapshot assertions remain intact.
4. First live case recovery check failed on `JSON.stringify` equality after PostgreSQL JSONB changed key order. Read-only investigation confirmed **deepEqual=true, stringEqual=false, no differing values** (`settings-comparison-investigation.json`). Switched only the private QA assertion to deep value equality; all 43 checks passed. Preserved `backend-first-failure.json/.log`. Both disposable recovery fixtures were tombstoned; the successful generation and prior evidence cases remain.
5. The historical intermittent conflict-test race remains documented in “Intermittent conflict failure and all reruns” below: explicit stale/offline preconditions fixed the fixture race. Today's full suite includes those stronger checks and passed; this does not erase the original failure.

### 3. WHAT STILL FAILS / MUST REMAIN LIMITED

- **Single Tooth: HIDDEN FOR V1.** Raw provider targeting of the opposite central incisor remains a genuine prior failure. Request `a0f32a3f…` selected patient-right FDI 11 (viewer-left for the unmirrored synthetic image); input/raw/final have no EXIF orientation. The prompt specified patient-side FDI but had no spatial target or reviewed boundary. No evidence establishes a deterministic small orientation fix for that request. Git history showed conditional protection, not a reliably validated historical single-tooth path. Front-camera mirroring is a separate unresolved provenance issue. No live single-tooth retest was spent.
- **Alignment / Full Arch: HIDDEN FOR V1**, with internal flags retained. No live validation claim.
- **Durable charged-result recovery: DEFERRED.** A server-success/device-processing failure may still consume allowance without delivering a usable on-device concept. Existing copy does not promise a confirmed refund. Required before external/paying beta; no insecure client-triggered refund added.
- **Security: REVIEW for owner-controlled synthetic testing; unresolved before patient/external beta.** Codex Security scan `939cbc5e-79a6-49cc-8f8a-8d5e5d078b22` found a high-severity MFA boundary gap: direct Supabase owner RLS does not require AAL2 for MFA-enrolled owners, while the app API does. Cross-account ownership passed, but a first-factor session can bypass the additional factor through direct access. A complete RLS/local-cache boundary fix and enrolled-AAL1/AAL2 tests are still needed. No partial schema/security change was improvised.
- The originally reported real saved case cannot be declared repaired: no identified case reference/time was inspected. Disposable recovery tests are evidence for the mechanism, not that specific patient's case.

### 4. WHAT WAS NOT TESTED / BLOCKED

- **NOT TESTED:** physical iPhone/iPad workflow, Apple sign-in/cancel/linking, camera mirroring/orientation matrix, real Apple sandbox purchase and real RevenueCat delivery.
- Browser/simulator interaction and new before/after screenshots were not completed: automatic approval review rejected browser access due to its usage limit. No alternate UI automation was used to bypass that rejection. The unexecuted orientation harness is retained privately as deferred work.
- iOS signed entitlements confirm Apple sign-in and Complete Data Protection; camera/photo-export purpose strings and privacy manifest exist. PHPicker is used for selection. Native bundle uses staging API/Supabase and the App Store `appl_` SDK key, no Test Store key, no remote Capacitor server. Private-key scan passes. An explicit In-App Purchase `SystemCapabilities` marker was **not found** in the Xcode project; StoreKit/RevenueCat is linked, but check the capability and sandbox purchase on device rather than asserting it passed.
- Version **1.0 (1)** is preserved. Whether App Store Connect has already received Build 1 was not available through the connected tools. Confirm before archiving/uploading; increment if already used.
- Public release guard remains intact: `npm run ios:release` still rejects **23 privacy + 17 terms unresolved markers**. The owner-authorised internal candidate was packaged with the production web build plus native sync and development-signed Release compilation; this is not legal/public-release sign-off. Exact marker text is in `legal-pending.json`; owner actions remain in `docs/PROFESSIONAL_REVIEW_REQUIRED.md`. No legal details invented.
- RevenueCat live inspection: App Store app `appb4a1d5eb2d`, both Apple keys configured, `pro` includes monthly/annual App Store products; current `default` offering contains `$rc_monthly` and `$rc_annual`. Apple durations **ONE_MONTH / ONE_YEAR**. Both live store states are **MISSING_METADATA**: `common.localizations={}`, `common.availability.territories={}`, `store_state.privacy_policy_url=null`, `store_state.review_information=null`. These are observed fields, not proof each null independently blocks Apple. Pricing/products/allowances unchanged. Purchasing remains **DEVICE TEST REQUIRED / metadata action required**.

### 5. WHAT NEEDS VISUAL REVIEW

**HUMAN REVIEW REQUIRED:** existing Composite/Whitening protected finals plus the new raw Composite response. Check treatment scope, lip/expression/mouth opening, gingiva, unselected teeth, tooth proportions, seams and shade. Technical byte preservation and prompt instructions do not guarantee anatomical or cosmetic accuracy. Porcelain has contract regression coverage but was **NOT LIVE TESTED** in this request budget.

### 6. EXACT NEXT ACTION

**Backend ready for owner-led internal testing: YES. Overall app verdict: READY FOR PHYSICAL DEVICE ACCEPTANCE.** No upload performed or authorised here.

1. Open `ios/App/App.xcodeproj`, App scheme, your team, **Run configuration Release**, connected unlocked iPhone; **Product → Run**. The matched signed artifact is `/tmp/smile-final-rc-20261003/Build/Products/Release-iphoneos/App.app`.
2. On iPhone: email login → Apple sign-in/cancel → approved synthetic photo → Analyse → 6-tooth Composite → inspect image/Slide/Overlay → Save → force-close → reopen → export preview/report → sign out/in. Stop at the first failure and collect private QA request ID/status/stage.
3. On iPad: same account → same case → images download → compare/export; make one safe metadata change and check it appears on the other device. Switch A→B→A, then open a cached case offline and reconnect.
4. After acceptance, confirm Build 1 is unused and the Xcode purchase capability, then manually **Product → Archive → Distribute App → App Store Connect → Upload**. In App Store Connect, wait for processing and add the owner/internal group. This is a future manual step, not a completed upload. Complete product metadata and perform one Apple sandbox purchase to prove subscription delivery.

**Visible Build 1 scope:** photo capture/import, Smile Analysis, 4/6/8/10 teeth and Custom multi-tooth, Whitening/Composite/Porcelain, comparison/presentation, preferred design, cases/sync, preview/report export. Cosmetic results require clinician review. **Restricted:** Single Tooth, Alignment and Full Arch are internal-only; no real-patient, external-dentist or paying-user readiness claim. Resolve durable delivery recovery, the MFA boundary, physical acceptance, subscription metadata/delivery and legal/privacy review before widening that scope.

---

## 3 October — matched staging deployment and controlled live validation

**Latest handover.** This section supersedes the earlier “implemented locally / not deployed” statements below. Earlier results and failures remain as history.

### 1. WHAT WAS ACTUALLY FIXED / CHANGED

- **PASS:** preserved the existing 56 changed/new source, test and documentation files in checkpoint **`a81080bba32a11e452c75d2adf1799f93c00494b`**, branch **`release/v1-device-test`**. No work discarded, merged or pushed.
- **PASS:** deployed that checkpoint to **staging only**, `https://smile-by-dr-vik-staging.drvik.workers.dev`. Worker version **`fefc6124-3ba4-4fae-82bb-9949e4fd0d5b`**. Production unchanged.
- **PASS:** built and development-signed the matching iOS Release app. No installation, TestFlight upload or Apple submission in this pass.
- **No application fixes during live validation.** Two mistakes in the disposable QA harness were corrected, retaining their first-failure evidence. Neither required a production-code change or a repeated paid generation. See below.

### 2. WHAT WAS TESTED — environment, commit and evidence

All app code used checkpoint `a81080b`. Staging Supabase is **`smilecompose-staging` / `wukcqlpuzkzwxmdkotfg`**, not production. The user expressly authorised one disposable QA account with five temporary generations. Real customer accounts, subscriptions, prices and allowance rules were untouched.

**Environment distinction:** live staging Gemini/API/Supabase; a local browser harness importing the actual photo preparation, generation service, workspace, case repository and sync code. `lockFace` was copied verbatim from this checkpoint into the ignored harness. The harness used a server-side proxy holding the disposable user's normal bearer token, not service-role generation/storage access. Admin access was used only to provision the authorised fixture. This is **not** a physical iPhone or simulator end-to-end result, nor a full production-screen interaction test.

**Content:** only the existing approved synthetic demo portrait, sourced from `output/stage3-evidence/generation-source.jpg` (1092 × 1440; prior approval/provenance recorded in the Stage 3 report). None of the supplied identifiable patient photos was uploaded.

Evidence root (private, Git-ignored): `output/matched-staging-2026-10-03/`.

| Required status | Result | Evidence / qualification |
|---|---|---|
| MATCHED STAGING BACKEND | **PASS** | Deployment receipt; 14 deployed entry JavaScript assets match local build bytes; live diagnostics report contract v6 |
| MATCHED IOS CLIENT | **PASS** | Production web build, Capacitor sync, signed Xcode Release build; 143 packaged web files match; direct-device build only |
| COMPOSITE 6-TOOTH | **REVIEW** | Delivery/compositing/save PASS; cosmetic/anatomical review outstanding |
| WHITENING | **REVIEW** | Delivery/compositing/save PASS; colour-only intent verified, geometry preservation still needs visual review |
| SINGLE TOOTH | **FAIL** | Valid image delivered, but apparent opposite central incisor brightened; targeting acceptance gate failed, clinician confirmation required |
| ALIGNMENT | **NOT RUN** | Stopped after single-tooth finding |
| FULL ARCH PRESERVE | **NOT RUN** | Stopped; Include was also not run |
| ALLOWANCE ACCOUNTING | **PASS** | Five granted → three committed → two remaining; invalid pre-provider fixture consumed none; no refund issued |
| CASE SAVE/REOPEN | **PASS** | Browser close/reopen: identical source/concept, same settings, preferred design, one case; physical force-close still NOT TESTED |
| PROVIDER DIAGNOSTICS | **PASS** | Three started + three finished records, readable through normal authenticated read-own access; safe fields only |

**Build evidence:** `native-build-sync.txt`, `xcode-release.txt`, `native-match.json`, `deploy.txt`, `smoke.json`. Bundle `uk.co.drvik.smilecompose`, version **1.0**, build **1**, automatic signing, Team `7TPF7LT884`. Apple sign-in and Complete Data Protection are present in the signed entitlements. Camera and photo export descriptions and privacy manifest are present; library selection uses PHPicker rather than broad library access. Bundled staging API/Supabase and App Store `appl_` public key verified; Test Store key absent. No remote Capacitor `server.url` configured. The `capacitor://localhost` bundled-app origin is normal, not a development backend. Release compilation and signature verification passed. The first sandboxed signature check could not access normal trust evaluation; the same verification with normal macOS access passed. Distribution/legal release guard remains unchanged; direct-device build is not App Store readiness.

**Checks:** fresh contract/diagnostic/account preflight **57/57 PASS**, and final focused check **57/57 PASS**, zero skipped. The earlier full **597/597**, TypeScript and ESLint passes are retained below; the full suite was not rerun in this deployment-only pass. Production web build/Capacitor and native Release build were rerun. Hosted root/pricing 200; unauthenticated account/cases 401; unsupported generation GET 405; unsigned RevenueCat webhook 401; normal QA account/case-list 200. These are endpoint checks, not a real RevenueCat purchase/webhook-delivery test.

### 3. WHAT STILL FAILS — first genuine product finding

**Single-tooth targeting: FAIL / clinician visual confirmation required.**

Reproduction: approved synthetic full-face photo → select only FDI **11**, `Layered composite`, `Auto`, `Whiten`, Rounded/Natural, intensity 35 → one live request → raw result → current alignment and mouth composite → saved final.

- The outgoing canonical region instruction identifies FDI 11 and explicitly says left/right is the patient's; settings include the matching individual `toothPlans` entry.
- The bright central incisor appears on the **viewer's right**, opposite the requested FDI 11 side. It is visible in the **raw provider image**, and remains in the final image. Source-space colour samples corroborate the visual difference; these are manual review aids, not automated anatomical truth.
- First failing subsystem: **provider interpretation of the selected tooth / unenforced tooth identity in the prompt-only path**, not image extraction or an introduced compositing artefact. The provider's internal reason is unknown.
- The current single-tooth request had **no clinician-reviewed map**. `toothProtection` is absent and only the existing mouth/face composite ran. No clinician confirmation was fabricated. No mask was widened, bypassed or silently substituted.
- **Stopped at three live provider calls**, with no additional paid retries. Alignment and Full Arch were not attempted. No application fix or refund was improvised.
- Recommend limiting precise single-tooth claims to a reviewed-boundary workflow until that path is separately validated. This pass does not prove that reviewed anatomical boundaries are accurate.

The previous `provider_no_image`, grey output and gross crop failures were **not reproduced** in this three-call synthetic sample. That does not establish that they are resolved for every photograph.

### 4. WHAT WAS NOT TESTED / BLOCKED

- Physical iPhone/iPad installation, camera/import flow, force-close, Apple sign-in, purchases and real webhook delivery: **NOT TESTED** here.
- Reviewed single-tooth masking: **NOT TESTED live**; no clinician-reviewed boundary existed for this synthetic fixture. The prompt-only targeting limitation was explicitly disclosed before the call.
- Alignment, Full Arch Preserve and prosthetic gingiva Include: **NOT RUN** after the targeting failure. Their normalised schema/contract tests pass, which is not live outcome evidence.
- Live provider-failure reservation release: **NOT TESTED**, because all three provider calls returned images. Existing no-image/release unit tests passed. No failure was deliberately purchased to manufacture coverage.
- No overnight billing-lifecycle redesign, account repair, production configuration change or new mask was undertaken.

### 5. WHAT NEEDS HUMAN VISUAL REVIEW

Open **`output/matched-staging-2026-10-03/review.html`**. Each successful provider response has Original | Raw provider | Final SmileCompose, full settings and diagnostics. Folders: `01-composite/`, `whitening/`, `single_tooth/`. `review-overview.jpg` is the overview screenshot; `01-composite/reopen-pass.jpg` shows restored media and state.

| Review item | Observed technical result | Human review status |
|---|---|---|
| Grey/blank output, decoding, dimensions | PASS on all three; JPEG raw, lossless PNG final | No obvious full-frame corruption observed |
| Crop and gross mouth location | PASS: known padding undone, original 1092 × 1440 canvas restored | Fine alignment / seam review required |
| Face/expression/lips/mouth opening | Existing mouth/face composite ran; faceLocked true, lipsMoved false | REVIEW: flags alone are not an anatomical guarantee |
| Gingiva / papillae / margins | No new gum mask; prompt requests preservation | REVIEW; preservation is not guaranteed |
| Selected / untreated teeth | FDI 11 apparent targeting mismatch; no reviewed boundary used | FAIL for acceptance pending clinician confirmation |
| Whitening geometry / restorative proportions | Correct exclusive prompt intent | REVIEW; provider appearance is not cosmetic ground truth |
| Texture, translucency, anatomy and aesthetic suitability | Valid images returned | REVIEW on all three |

### 6. EXACT NEXT ACTION

**Review the single-tooth Original / Raw / Final row and confirm the requested tooth versus the visibly brightened tooth.** Keep precise single-tooth editing out of a patient demonstration until the targeting/boundary workflow is verified. No further live calls are needed to inspect these saved outputs.

The matching Xcode project is ready for controlled physical testing after that review:

1. Open `ios/App/App.xcodeproj`; select **App target → Signing & Capabilities → Automatically manage signing → your team** (`7TPF7LT884`).
2. **Product → Scheme → Edit Scheme → Run → Build Configuration: Release**.
3. Select your unlocked, connected iPhone as the run destination. Trust the Mac / enable Developer Mode on the phone if prompted.
4. **Product → Run**. Do not Archive/Distribute or upload TestFlight.

Built artifact: `/tmp/smile-matched-staging-20261003/Build/Products/Release-iphoneos/App.app`. Physical acceptance remains: launch → sign in → approved photo → six-tooth Composite → inspect image → save → force-close → reopen same source/concept/settings/preference. Do not interpret this browser sample as that test having passed.

### Exact live requests, outcome and allowance

| Mode | Request ID | HTTP app/provider | Provider latency | Finish / parts | Remaining |
|---|---|---|---|---|---|
| Composite, 6 | `d5b9fefd-8cab-4e3f-8f60-38999ed029d9` | 200 / 200 | 11.433 s | STOP; 1 inline JPEG, 0 text/thought | 5 → 4 |
| Whitening, 6 | `e9a09998-fd8f-4aae-bb05-ada8e413af4b` | 200 / 200 | 10.024 s | STOP; 1 inline JPEG, 0 text/thought | 4 → 3 |
| Single tooth, 11 | `a0f32a3f-90d6-4b40-ab1c-f226341add2b` | 200 / 200 | 10.680 s | STOP; 1 inline JPEG, 0 text/thought | 3 → 2 |

Each request: source **1092 × 1440** → padded input **1092 × 1456** (3:4; full source retained) → raw **896 × 1200** → final **1092 × 1440**. Model `gemini-3.1-flash-image`, prompt `2026-10-03-treatment-contract-v6`, category `success`, retryCount **0**. Alignment and mouth compositing ran; single-tooth compositing did not. All final media were saved; cosmetic suitability is separate from the successful server delivery charge.

**Total: 3 provider calls / 5 maximum, 0 provider retries, 4 generation-endpoint submissions.** The fourth submission was the harness's malformed single-tooth fixture, UUID `35193499-5735-4be3-88fa-49becc08cd5a`: HTTP 400 at `settingsSchema`, before reservation/provider, no diagnostic start event and no allowance change. Full ledger: `live-ledger.json`. Three committed reservations and three diagnostic pairs confirmed via normal authenticated RLS reads in `postflight.json` / `provider-audit.json`. No secrets or image bytes are in those diagnostics.

### Save/reopen evidence and preserved first failures

- Composite was saved through the real repository/outbox, tab closed, new browser tab opened, and case rehydrated. Original and final data-URL hashes match, settings match, preferred ID matches, case count is one, media status Synced. Evidence `01-composite/reopen.json` and `reopen-pass.jpg`.
- All three cloud cases have one entry, editable draft, matching preferred design and confirmed assets. Normal authenticated GETs returned six source/concept binaries, all matching their stored checksums (`postflight.json`). No service-role shortcut was used to retrieve media.
- **First restart check failed due to QA harness error:** it saved `screen: compare` directly; the app saves comparison state as `design`, and the draft reader rejects `compare`. Corrected the fixture to follow `page.tsx`'s existing mapping; reused the already-generated media; no app code changed and no paid retry. `reopen-first-failure.json` and screenshot retained. Subsequent correct-flow restart PASS does not erase that first test failure.
- **First single-tooth API fixture failed due to QA harness error:** omitted `toothPlans`, violating the existing custom-selection contract. Used the app's `updateToothPlan`/mode helpers and validated all remaining settings locally. Invalid attempt and screenshot retained under `single-tooth-invalid-fixture/`; no production validation was weakened.

### Checkpoints / rollback / fixture handling

- Parent checkpoint: `4a8de132378c8746ed6350aacbedf421fddc6c8d`; preserved pre-checkpoint status and patch in the ignored evidence root.
- Matched application source/client/backend: **`a81080bba32a11e452c75d2adf1799f93c00494b`**. Working tree was clean after packaging. The follow-up documentation-only handover commit does not change the built/deployed application.
- Prior staging Worker rollback version: **`6ec38868-120f-4224-af91-0be7668d58b3`**. New version **`fefc6124-3ba4-4fae-82bb-9949e4fd0d5b`**. No rollback or production operation performed.
- The generation-capable harness was stopped. The review server is read-only and loopback-only. Private evidence is Git-ignored. Temporary administrative key/session files are removed after evidence collection.
- Disposable synthetic QA cases remain for audit; the QA-only allowance expires at **14:27 UTC / 15:27 BST, 3 October 2026**. Existing customer data and commercial settings were not modified.

**No TestFlight upload. No production deployment. No new features. STOP.**

---

## Historical work and earlier checkpoints

## 3 October — generation contract cleanup + provider diagnostics (IMPLEMENTED LOCALLY)

### 1. WHAT WAS ACTUALLY FIXED

**PASS — code/regression checks:** one canonical, versioned image-generation contract now serves the adapters. Explicit Whitening is colour-only; alignment-only no longer inherits restorative or fixed-position shade instructions; Full Arch Preserve/legacy Auto cannot implicitly add pink material; Include has a limited interface exception; Keep forbids intentional shade changes. Current shade has clinician/estimate provenance instead of an assumed A2 fact. References are subordinate to the selected treatment.

**PASS — diagnostics:** every invocation through the generation service emits bounded start/finish metadata correlated with its request ID. The authenticated server writes it through the existing private audit store and returns the safe summary to the existing opt-in on-device QA recorder. No schema, provider, automatic retry, allowance rule or new mask was added.

**Unchanged safeguards:** the pre-existing face/lip/outside-mouth safeguard and reviewed single-tooth compositing remain. This task does not guarantee anatomical mask accuracy or gum preservation. The only mask-rule change makes the new Whitening treatment use the existing exact, colour-only region rule.

### 2. WHAT WAS TESTED — environment, commit and evidence

- Local macOS workspace; branch `release/v1-device-test`, HEAD `4a8de132378c8746ed6350aacbedf421fddc6c8d`, with pre-existing dirty work plus this implementation. No commit, push, deployment, Capacitor sync, Xcode install or TestFlight upload in this pass.
- **PASS:** full offline regression suite **597/597**; TypeScript; ESLint; production web/Sites-worker build; `git diff --check`.
- **PASS:** seven exact snapshots through the real client service → server generation normalizer → Gemini adapter with a synthetic 1×1 PNG and stubbed fetch. This verifies request construction and extraction, not real UI clicks, model obedience or cosmetic appearance.
- **PASS:** final targeted contract/clinical tests **36/36** after the clinical-data wording correction; separate diagnostics/snapshot/iOS-config checks **25/25**. The iOS checks are source/configuration tests, **not a native Release build or device test**.
- Evidence: `output/generation-contract-cleanup/` (git-ignored). `full-final.txt`, `build-verified.txt`, `lint-verified.txt`, `typecheck-verified.txt`, `contract-final.txt`, exact prompts, TDD failures and baseline comparison are retained there. Exact prompt snapshots and synthetic settings are also tracked test fixtures under `tests/fixtures/`.
- The first production build stalled at compile with zero process CPU under sandbox permissions; it was stopped. The identical build with normal local process permissions passed (Next compilation 2.4 seconds). There was no build-configuration workaround or deployment. Existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains. The legal generator reports 40 owner/legal decision items; this task does not resolve legal readiness.
- **0 live provider requests in this pass.** Earlier job-wide request usage is not re-established here; no new allowance was assumed.

### 3. WHAT STILL FAILS

**FAIL / ROOT CAUSE UNKNOWN — historical phone generation:** request `8b90cadf-13af-4add-92de-e868c0bba260` returned application `502 / provider_no_image` before alignment/compositing. The old provider response metadata was not retained, so this change cannot reconstruct its precise cause. Prompt contradictions are fixed; their causal connection to that provider failure remains unproved.

Existing server-success/device-processing-failure recovery and charging limitations from the earlier handover remain outside this task. This implementation only preserves the existing server-side allowance-release path for provider failures. It does not add client-authorised refunds, redelivery or retry.

### 4. WHAT WAS NOT TESTED / BLOCKED

**NOT TESTED:** real Google generation, staging persistence of the newly added diagnostic events, cosmetic/anatomical results, physical iPhone/iPad, simulator, Apple purchases/sign-in, cloud case recovery or a native Release build in this pass. Existing face-protection tests passing is not evidence of perfect gingival segmentation.

**Compatibility:** explicit Whitening and optional/provenance-aware current shade require the matching updated backend schema parser. Do not install this newly built client against the unchanged older staging backend and assume compatibility. No backend has been deployed. Optional custom HTTP integrations now receive the canonical instruction and image input, not a parallel raw settings object; third-party custom HTTP compatibility is not live-tested and is not a V1 processor. OpenAI/custom adapters share the contract, but Gemini receives the detailed response-part/finish/block diagnostics; equivalent fields absent from another adapter remain unavailable rather than invented.

### 5. WHAT NEEDS HUMAN VISUAL REVIEW

**HUMAN REVIEW REQUIRED:** the seven prompt examples below, especially Full Arch Include, the meaning of additive composite constraints, clinical shade confirmation, and preservation versus requested reshaping. Future authorised live tests must separately assess technical image delivery, anatomical edit-region accuracy and cosmetic acceptability. No simulated response can prove those outcomes.

### 6. EXACT NEXT ACTION

Review this contract and approve a later coordinated **staging-only** server/client update if acceptable. Then test one explicitly authorised photo with the new request-correlated diagnostics before spending further generations. Collect request ID and safe QA metadata if it fails; do not copy images, full prompts or tokens into logs. Deployment and installation are deliberately not part of this pass.

### A. Provider diagnostics added

Flow: authenticated `POST /api/generate-smile` → existing reservation → `generateSmile` → selected provider adapter → bounded diagnostic callback → existing `record_security_event` RPC. Owner is the authenticated server user, never a client log field.

Recorded fields: UUID request ID; provider; configured exact model; prompt version `2026-10-03-treatment-contract-v6`; provider HTTP status (separate from app HTTP status); elapsed adapter latency; retry count (zero); treatment mode; active selected-tooth count; input dimensions; requested width/height when explicitly requested; requested aspect ratio/resolution; candidate/part counts, text/inline/thought/other counts, image-part presence, MIME categories, finish reasons, block reason and recognised provider status code.

Gemini requests aspect ratio and size tier rather than an exact width/height pair. Its requested width/height are truthfully `null`, with ratio/tier recorded. Whole-arch/alignment-only selected-tooth counts are `null`, since an arch is selected rather than an exact FDI list. Latency covers the adapter invocation (including authentication/encoding/response reading), not a claim about Google's internal compute time.

Retention/access:

- Server event types: `generation_provider_started`, `generation_provider_finished`. Uses the existing `security_audit_log`, append-only RPC and authenticated read-own RLS. No new table, grants, public endpoint or privileged client write path. Existing account-deletion behaviour removes the user association.
- Server retention follows the existing audit store; no new TTL or retention migration was introduced. Row fields/counts are bounded; total historical row retention is not newly capped by this task.
- Existing staging QA recorder: last 30 requests in native Cache `smile-generation-qa.json`, enabled only by `NEXT_PUBLIC_SMILE_QA_DIAGNOSTICS=1`. Cache can be evicted. Server evidence remains separate.
- Diagnostic writes are best-effort and wait at most one second per event. A failed/hanging audit write cannot indefinitely delay the image or block allowance release. Missing telemetry must not be interpreted as proof that no provider call occurred.
- The safe summary may return to its authenticated caller; the client strips it from the patient-facing generation result and routes it to private QA only. Unknown/free-text fields are discarded. Images, raw bytes, provider explanation text, names, clinical notes, prompts, signed URLs and credentials are never retained in these new records.

Read-only investigation after a later staging deployment: retrieve the caller's own audit rows where `metadata->>requestId` equals the known request UUID and `event_type` is one of the two types above. Join by the same UUID to the private device QA record for the app HTTP status and processing stage. Do not use a broader patient-data export as a diagnostic substitute.

### B. Diagnostic categories

| Category | Evidence, not speculation |
|---|---|
| `blocked` | Explicit provider block/recognised refusal finish reason |
| `transport_error` | Request/auth transport throws without timeout/caller cancellation |
| `http_error` | Provider non-2xx, status and recognised error status retained |
| `malformed_response` | JSON cannot be read or provider's explicit malformed-response finish |
| `malformed_image` | Returned supported image payload fails schema/header-dimension validation |
| `unsupported_mime` | Non-thought inline output is not an accepted PNG/JPEG |
| `empty_response` | No response parts |
| `thought_only` | Only interim thought parts |
| `text_only` | Final parts contain text without a final image |
| `incomplete_response` | Explicit `MAX_TOKENS` finish |
| `timeout` / `cancelled` | Timeout signal / caller cancellation, distinguished |
| `unknown_response` | Unrecognised response/finish structure, without guessing from prose |
| `started` / `success` | Adapter invocation begins / accepted finished image returned |

These are **application diagnostic classifications**, not invented Google SDK enum values. Actual finish/block enums are separately allowlisted from the [Google GenerateContent API](https://ai.google.dev/api/generate-content). `NO_IMAGE` remains a finish reason; the accompanying structure distinguishes empty/text/thought/etc. Unknown enum text is reduced to `unknown` rather than logged verbatim. A valid completed image can still be accepted when a different candidate was incomplete; interim/blocked images are not used as a fallback.

No automatic provider retry was added. Existing error codes remain compatible with the client. Tests distinguish provider HTTP 200 from SmileCompose HTTP 502 and verify one provider call, one release attempt, and normal error propagation despite logger failure. Existing database idempotency remains in place.

### C. Canonical structure and precedence

`settingsSchema → normalizeGenerationContract → renderGenerationContract → provider request`.

Order: preservation/priority → exclusive treatment mode → region → design → optional references → explicit exceptions → output realism. `prompt.ts` and `imageEditPrompt.ts` now delegate to this one renderer. Cache/generation-rules version is updated to avoid reusing a preview made under the prior faulty contract.

Priority is explicit: protected anatomy/restrictions/treatment limits → tooth-specific goals/shades or global design → subordinate notes → material/style. An inactive control is classified and retained in case state, not silently converted into a different treatment.

### D. Treatment-specific rules

| Mode | Allowed | Retained restrictions |
|---|---|---|
| Whitening | Selected colour only; current→target context where known | Positions, dimensions, morphology, edges, texture, spaces, gums; no separate Shade-only toggle needed |
| Composite | Selected goal, morphology, shade, texture, explicit permitted edge/width changes | Additive design; no implied reduction or movement; no automatic extra length |
| Porcelain | Permitted restorative contours, target shade, ceramic finish/translucency | Same anatomy/region/length limits; no automatic whiter/bulkier result |
| Alignment-only | Whole-tooth visual positions, rotations, crowding/spacing in selected arches | Original crowns, shade, texture, visible natural gums, expression; no biomechanics claim; no restorative material directive |
| Single tooth | Selected FDI, goal, shape/shade/texture, permitted length/width/edge | Neighbours contextual only; reviewed boundary compositing unchanged |
| Full Arch Preserve | Visible selected arch restorative design, explicit arc/style | Opposite arch, visible natural gums and smile envelope; no pink material |
| Full Arch Include | Same arch design plus selected prosthetic gum interface | No unconditional freeze of that interface; unrelated tissue, lips, expression, opening and opposite arch still protected |

Existing combined alignment + restoration remains a separate explicit permission: position can change in selected alignment arches; restorative appearance only on selected restorative teeth. It is not an orthodontic plan. Treatment-level constraints still take precedence over incompatible detailed design preferences (for example additive composite cannot promise reduction).

### E. Conflicts removed

- Alignment-only no longer inherits composite/porcelain material or SHADE ONLY fixed-position blocks.
- Reference style cannot override positioning permission, shade, region or anatomy.
- Legacy Full Arch Auto cannot authorise pink material; zirconia alone grants none.
- Include no longer also says all natural gingiva must remain unchanged.
- Full Arch Keep no longer requests a different harmonised/complexion-based shade.
- Old automatic A2 is not a clinician-confirmed current shade.
- Every adapter uses the same final contract, avoiding a short Gemini prompt diverging from a second long builder.
- Shape/texture controls do not grant Whitening geometry changes; review copy and comparison availability explain this. No new visual system or screen redesign.

### F. UI → state → normalised contract → provider

| UI setting | State | Contract / outgoing instruction | Classification / limitation |
|---|---|---|---|
| 4/6/8/10 or Custom | `selectedTeeth`, active `toothPlans` | Actual FDI region; Preserve/Missing excluded | Render-affecting; no automatic selection widening |
| Treatment | `treatment`, `treatmentMode` | Exclusive whitening/restorative/alignment/full-arch rules | Render-affecting |
| Design goal | `designIntent`, tooth intent | Grouped, tooth-scoped goal permissions | Whitening overrides to colour-only; full arch/alignment-only use arch rules |
| Shape / character / texture | `shape`, `character`, `texture` | DESIGN for contour-permitted teeth | Inactive for colour-only/alignment-only; retained in state |
| Intensity | `intensity` | Degree of already permitted change | Cannot unlock extra geometry or shade when Keep |
| Current shade | `currentShade`, `currentShadeSource` | Confirmed/estimated context, never overrides photo | Absent/unproven legacy value excluded |
| Target shade / Keep | `targetShade`, tooth override | Target instructions grouped per FDI, or arch rule | Alignment-only retains original shade; combined mode separate |
| Length / width / edge / per-tooth form | tooth `length`, `width`, `edge`, `shape` | Explicit single-tooth controls, subordinate to goal | Shade-only preserves; gap closure preserves edge length; additive limits retained |
| Tooth condition | tooth `condition` | Missing/Preserve protection, restored shade limitation | Not permission to invent a missing tooth |
| Alignment | `alignment.arches`, `alignment.only` | Selected arch repositioning; combined permissions explicit | Render-affecting, no biomechanical prediction |
| Full Arch | `fullArch.arch/restorationType/prostheticGingiva` | Arch scope, material and explicit interface exception | Zirconia has no independent gingiva permission |
| Smile arc | `smileArc` | Qualitative visible lower-lip/edge preference | Render-affecting with eligible upper contour changes and Full face; otherwise Preserve |
| Facial-style reference | `faceShape` | Explicit non-Auto low-priority style | Render-affecting only with Full face and contour permission; not a biological tooth-size rule |
| Photo type | `shotType` | Close-up forbids hidden facial/lip inference | Render-affecting context, no crop request |
| Bite context | `biteContext` | Not in provider instruction | Clinician-only; occlusion not validated from photo |
| Measured bite | `clinicalData.overbiteMm/overjetMm` | Not in provider instruction | Clinician-only; unsafe to convert mm into pixels |
| Visual constraints | `clinicalData.constraints` | Quoted restrictions; only visual prohibitions, no new permissions | Render-affecting only in this restricted sense; free text is not clinical validation |
| Restorative space | `clinicalData.restorativeSpace` | Limited/uncertain prohibits added edge/posterior height | Conservative restriction only; Assessed does not grant unsupported expansion |
| Patient priorities | `clinicalData.patientPriorities` | Not in provider instruction | Case/report context; explicit design controls/notes direct appearance |
| Design notes | `notes` | Quoted subordinate notes with negations honoured | Render-affecting requests bounded by contract; not diagnostic logging |
| Reference / library | image reference, `libraryStyle`, `caseFeatures` | Authorised image attachments with subordinate style block | Matching metadata/flag not passed as independent anatomy instruction |
| Framing / source bounds | request `framing`, `sourceBounds` | Approximate locator / protect padding; no resizing teeth to fill guide | Render context, not anatomical boundary truth |
| Reviewed edit mask | request `editMask`, server guidance flag | Guidance only when attached; never return mask | Existing reviewed single-tooth enforcement remains device-side |
| Resolution / preview mode | request resolution/generation mode | Provider image config and generation metadata | Transport setting; not an anatomy directive |

The clinical-data panel now explains which fields are case context and which guide rendering. Report/clinician-only fields may still travel to SmileCompose's authenticated case/backend endpoint, but they are excluded from the third-party image-provider instruction/raw settings payload. Existing source photographs and explicitly authorised reference attachments still go to the configured image processor; this is not an all-on-device generation claim.

### G. Full Arch default

New default = `exclude`, UI label **Preserve**. Existing stored `auto` remains intact but normalises/render-selects as Preserve. Only `full_arch` plus explicit `include` permits the selected prosthetic interface. No saved-case migration or overwrite.

### H. Keep shade

Exact rule: “No intentional shade change from the source appearance. Do not whiten or brighten, regardless of intensity, material or reference shade. Photographic colour is not calibrated shade matching.” Applies to Full Arch and ordinary selected teeth. Alignment-only also retains colour. A per-tooth explicit target overrides the global target for that tooth. `TARGET SHADE = Whiten` does not turn Composite/Porcelain into Whitening.

### I. Tests added

- `generation-contract.test.ts`: exclusivity, legacy Auto non-mutation, Keep, explicit Whitening, provenance, 4/6/8/10/Custom FDI membership, per-tooth controls, all rendered design controls, inactive settings, reference/source/mask priority.
- `generation-contract-snapshots.test.ts` + fixtures: all seven exact strings and real client serialization → normalizer → outgoing Gemini text equality.
- `provider-diagnostics.test.ts`: supported/unsupported/MIME/malformed/empty/text/thought/truncated/blocked/unknown results; HTTP versus transport versus timeout/cancellation; no retry; safe allowlist; failing/hanging observer cannot break image delivery.
- Extended account boundary tests: server-owned diagnostic owner, request ID, upstream 200/app 502 distinction, one call/release despite logging failure.
- Extended private QA tests: safe fields only, matching request ID, rejection of cross-request metadata; old geometry/protection tests retained.
- Updated legacy prompt/report expectations only where the required contract intentionally changed; did not remove anatomical/security assertions to obtain a pass.

### J. Results and failure history

**PASS:** 597 tests, 0 failed, 0 skipped, 0 cancelled (~61 seconds). ESLint 0 warnings; TypeScript success; production build success. Latest targeted clinical/contract check 36/36. Seven snapshots exact.

TDD evidence is retained, not overwritten: initial new contract tests failed against old code; initial diagnostic module/snapshot fixtures were absent; never-settling observer test initially failed until bounded logging was implemented; unknown finish enum initially classified incorrectly until changed to `unknown_response`.

First broad run: 522/580 passed, 58 failed (mostly old prompt/provenance/default expectations). Targeted iteration: 199/212 then 212/212. A subsequent full run was **595/596**, exposing that the canonical standard prompt had lost an explicit “Never add or remove teeth” prohibition. That prohibition was restored in the code, not dropped from the test. Latest full suite: **597/597**, including the added hanging-observer regression. First lint run also found two unnecessary regex escapes; fixed and verified clean. The final source-only clinical wording correction was checked with targeted tests, ESLint and the successful final production build/TypeScript.

Source preservation checks confirm face locks, native project/Info.plist, existing timed-generation UI and its tests are byte-for-byte unchanged from this task's pre-existing diff. The working tree remains uncommitted; `preexisting.patch` is an evidence baseline for tracked pre-existing edits, **not permission to reset the workspace**. Some pre-existing untracked diagnostic files were extended, so a blind rollback of all untracked files would lose prior work.

### K. Remaining need for live generation

**NOT TESTED — provider outcome reliability.** These changes improve request consistency and diagnostic evidence; they do not establish that Google will always return an image, obey every instruction or honour exact anatomical boundaries. After explicit staging deployment approval and remaining live-request-budget confirmation, use authorised synthetic/approved content to test all seven modes. Review raw/final result, dimensions/crop, lips/expression/opening, gums, selected/unselected teeth, Keep shade, Include scope and obvious artefacts. No patient images should be sent to additional services for this review.

The historical failure's exact cause remains unknown until comparable new provider evidence exists. **No deployment in this pass. STOP.**

### Final safe example prompts — exact, not summaries

Seven synthetic examples are printed below. No patient content or live generation was used. Full-face baseline uses six upper teeth where applicable, intensity 35, and explicit Reshape for the restorative examples. Single tooth is FDI 11. Full Arch examples select upper zirconia. Dynamic notes, references, padding and reviewed-mask clauses are absent unless present in the fixture; separate tests exercise them. These are exact **instructions**; they are not proof of provider compliance or calibrated shade accuracy.

#### Whitening

```text
PRESERVATION: Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening and non-treatment facial anatomy. Keep eyes, nose, skin, hair, beard and facial hair, background, camera perspective, framing and lighting unchanged. Do not widen the mouth. Do not open the lips further. Keep the same visible upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; if lower teeth are partly visible, do not reveal more of them. Changing the treatment or design never authorises revealing concealed teeth. Retain retractors. Work inside the original smile envelope.

NATURAL SOFT TISSUE IS PROTECTED: Do not edit the gingiva. Retain natural gingival margins, recession, papillae, gingival zeniths, pigmentation, texture and asymmetry. Do not recentre, level or symmetrise the gums, or erase black triangles by adding gum tissue.

RULE PRIORITY: (1) protected anatomy, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades, otherwise global design; (3) notes within those permissions; (4) material and style. Lower-priority preferences never expand permissions. Preserve the photographed bite relationship; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. No photograph establishes occlusal contacts or restorative space.

TREATMENT: WHITENING: dental colour/shade change only. Preserve tooth position, width, length, morphology, incisal edges, surface texture, contacts, spacing and wear, except for separately selected alignment positioning if present. Shape, texture, length and width preferences cannot authorise geometric changes.

REGION: Modify only visible existing selected teeth (FDI: 13, 12, 11, 21, 22, 23). FDI left/right is the patient's. Never add or remove teeth. Preserve untreated teeth in both arches. Skip uncertain teeth. Missing or obscured identities must be skipped; do not invent replacements. Neighbouring teeth are contextual references, not intentional edit targets. Preserve the existing dental midline. Preserve tooth positions, axes, rotations and arch form.

Clinician-confirmed current shade: A3. Context only; do not override visible source appearance. Target shade defines intended output where change is selected.

Shade FDI 13, 12, 11, 21, 22, 23: Gently whiten relative to the photographed shade, retaining warmth, depth and shadows.

Intensity: 35/100 controls only the degree of already permitted change, never a new type of edit.

Use photographed facial proportions and perspective as context only. A face shape does not prescribe one ideal tooth length; do not rotate the incisal plane to match the eyes.

OUTPUT: Return ONE complete edited source photograph at the requested output resolution with the original aspect ratio, framing, scale, rotation and crop. Never return an enlarged mouth, isolated teeth, a close-up crop, collage, mask or reference image. Do not zoom, pan, mirror or move the face. Match natural light, white balance, the shadow the upper lip casts, grain and sharpness with no visible seam. Keep naturally asymmetric detail where the goal permits. Avoid duplicate crowns, notches, floating enamel, sharp mask-like cut-offs, merged contacts or dark slivers. Preserve features already balanced; very little visible change may be appropriate. This is an AI visual concept for clinician discussion, not a diagnosis, predicted or guaranteed clinical result.
```

#### Composite

```text
PRESERVATION: Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening and non-treatment facial anatomy. Keep eyes, nose, skin, hair, beard and facial hair, background, camera perspective, framing and lighting unchanged. Do not widen the mouth. Do not open the lips further. Keep the same visible upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; if lower teeth are partly visible, do not reveal more of them. Changing the treatment or design never authorises revealing concealed teeth. Retain retractors. Work inside the original smile envelope.

NATURAL SOFT TISSUE IS PROTECTED: Do not edit the gingiva. Retain natural gingival margins, recession, papillae, gingival zeniths, pigmentation, texture and asymmetry. Do not recentre, level or symmetrise the gums, or erase black triangles by adding gum tissue.

RULE PRIORITY: (1) protected anatomy, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades, otherwise global design; (3) notes within those permissions; (4) material and style. Lower-priority preferences never expand permissions. Preserve the photographed bite relationship; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. No photograph establishes occlusal contacts or restorative space.

TREATMENT: Layered composite. Layered composite: allow restrained dentine/body/enamel depth, cervical-to-incisal transitions and incisal translucency appropriate to the chosen texture and supplied comparable cases. Do not automatically make this option whiter, longer or better shaped. Keep the design additive; do not simulate hidden reduction or orthodontic movement. Do not invent a particular resin recipe or thickness.

REGION: Modify only visible existing selected teeth (FDI: 13, 12, 11, 21, 22, 23). FDI left/right is the patient's. Never add or remove teeth. Preserve untreated teeth in both arches. Skip uncertain teeth. Missing or obscured identities must be skipped; do not invent replacements. Neighbouring teeth are contextual references, not intentional edit targets. Preserve the existing dental midline. Preserve tooth positions, axes, rotations and arch form.

Shade FDI 13, 12, 11, 21, 22, 23: Clinician-selected target: B1 shade. This is an illustrative shade preference, not calibrated colour prediction.

GOAL SCOPE FDI 13, 12, 11, 21, 22, 23: Apply this entire instruction only to these teeth, not to any other selected tooth. RESHAPE: Permit modest changes to incisal and proximal contours of selected existing teeth, following the requested form and clinician's notes. Keep existing incisal edge positions by default. Extra length requires an explicit clinician request to lengthen the particular tooth; a shape preset, symmetry request or general request to improve the smile is not permission. Choose the smallest supported change within the visible mouth opening and existing arch. Do not expand the whole arch, move roots/axes, level the gums or enlarge all teeth simply to increase intensity. Do not reconstruct missing or heavily broken-down teeth from guesswork. Where feasibility depends on unseen bite, preparation or thickness, choose the smaller visible change and leave clinical feasibility for assessment. END GOAL SCOPE.

TOOTH LENGTH BASELINE: Keep each incisal edge at its original position unless its tooth-specific permission below allows change. Preserve central-to-lateral edge steps and canine cusps. An intact central incisor must not become longer for symmetry, central dominance, a shape preset or a material change. Generic reshaping, brighter shade, ideal proportions or symmetry do not authorise extra length. Lip coverage is not a short-tooth defect. Preserve space below upper edges and lower-tooth visibility; no universal tooth-size ratio applies.

FDI 13, 12, 11, 21, 22, 23: Natural; retain original edge length unless notes explicitly request length for this tooth; shade B1.

CONTOUR AND TEXTURE SCOPE: apply only to FDI 13, 12, 11, 21, 22, 23, within each tooth's goal.

DESIGN: shape Rounded; character Balanced; surface Natural with natural surface character. Apply only to teeth whose goals permit contour changes. Shade-only and preserved teeth retain their own outlines and texture. Retain photographed central-to-lateral proportions, width progression, natural incisal embrasures, canine cusps and individual asymmetry; keep each canine recognisable with a natural cusp and mesial/distal shoulders; never identical copied teeth or a chiclet row.

Intensity: 35/100 controls only the degree of already permitted change, never a new type of edit.

Smile arc preference: Preserve existing. Retain the existing arc except for expressly permitted local changes.

Use photographed facial proportions and perspective as context only. A face shape does not prescribe one ideal tooth length; do not rotate the incisal plane to match the eyes.

Before returning, compare with the original and undo any extra length not expressly allowed by its tooth-specific edge permission.

OUTPUT: Return ONE complete edited source photograph at the requested output resolution with the original aspect ratio, framing, scale, rotation and crop. Never return an enlarged mouth, isolated teeth, a close-up crop, collage, mask or reference image. Do not zoom, pan, mirror or move the face. Match natural light, white balance, the shadow the upper lip casts, grain and sharpness with no visible seam. Keep naturally asymmetric detail where the goal permits. Avoid duplicate crowns, notches, floating enamel, sharp mask-like cut-offs, merged contacts or dark slivers. Preserve features already balanced; very little visible change may be appropriate. This is an AI visual concept for clinician discussion, not a diagnosis, predicted or guaranteed clinical result.
```

#### Porcelain

```text
PRESERVATION: Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening and non-treatment facial anatomy. Keep eyes, nose, skin, hair, beard and facial hair, background, camera perspective, framing and lighting unchanged. Do not widen the mouth. Do not open the lips further. Keep the same visible upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; if lower teeth are partly visible, do not reveal more of them. Changing the treatment or design never authorises revealing concealed teeth. Retain retractors. Work inside the original smile envelope.

NATURAL SOFT TISSUE IS PROTECTED: Do not edit the gingiva. Retain natural gingival margins, recession, papillae, gingival zeniths, pigmentation, texture and asymmetry. Do not recentre, level or symmetrise the gums, or erase black triangles by adding gum tissue.

RULE PRIORITY: (1) protected anatomy, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades, otherwise global design; (3) notes within those permissions; (4) material and style. Lower-priority preferences never expand permissions. Preserve the photographed bite relationship; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. No photograph establishes occlusal contacts or restorative space.

TREATMENT: Porcelain. Porcelain: depict a ceramic restoration with plausible surface finish, light transmission and shade transitions, keeping the selected geometry and shade. Do not make it automatically whiter, bulkier or more symmetrical than composite. Unknown ceramic type, substrate/stump shade, thickness and cement mean the appearance is illustrative, not a material-specific colour prediction. A veneer may change visible contours within the approved goal, but must not imply that root position, bite, preparation needs or gum levels have changed.

REGION: Modify only visible existing selected teeth (FDI: 13, 12, 11, 21, 22, 23). FDI left/right is the patient's. Never add or remove teeth. Preserve untreated teeth in both arches. Skip uncertain teeth. Missing or obscured identities must be skipped; do not invent replacements. Neighbouring teeth are contextual references, not intentional edit targets. Preserve the existing dental midline. Preserve tooth positions, axes, rotations and arch form.

Shade FDI 13, 12, 11, 21, 22, 23: Clinician-selected target: B1 shade. This is an illustrative shade preference, not calibrated colour prediction.

GOAL SCOPE FDI 13, 12, 11, 21, 22, 23: Apply this entire instruction only to these teeth, not to any other selected tooth. RESHAPE: Permit modest changes to incisal and proximal contours of selected existing teeth, following the requested form and clinician's notes. Keep existing incisal edge positions by default. Extra length requires an explicit clinician request to lengthen the particular tooth; a shape preset, symmetry request or general request to improve the smile is not permission. Choose the smallest supported change within the visible mouth opening and existing arch. Do not expand the whole arch, move roots/axes, level the gums or enlarge all teeth simply to increase intensity. Do not reconstruct missing or heavily broken-down teeth from guesswork. Where feasibility depends on unseen bite, preparation or thickness, choose the smaller visible change and leave clinical feasibility for assessment. END GOAL SCOPE.

TOOTH LENGTH BASELINE: Keep each incisal edge at its original position unless its tooth-specific permission below allows change. Preserve central-to-lateral edge steps and canine cusps. An intact central incisor must not become longer for symmetry, central dominance, a shape preset or a material change. Generic reshaping, brighter shade, ideal proportions or symmetry do not authorise extra length. Lip coverage is not a short-tooth defect. Preserve space below upper edges and lower-tooth visibility; no universal tooth-size ratio applies.

FDI 13, 12, 11, 21, 22, 23: Natural; retain original edge length unless notes explicitly request length for this tooth; shade B1.

CONTOUR AND TEXTURE SCOPE: apply only to FDI 13, 12, 11, 21, 22, 23, within each tooth's goal.

DESIGN: shape Rounded; character Balanced; surface Natural with natural surface character. Apply only to teeth whose goals permit contour changes. Shade-only and preserved teeth retain their own outlines and texture. Retain photographed central-to-lateral proportions, width progression, natural incisal embrasures, canine cusps and individual asymmetry; keep each canine recognisable with a natural cusp and mesial/distal shoulders; never identical copied teeth or a chiclet row.

Intensity: 35/100 controls only the degree of already permitted change, never a new type of edit.

Smile arc preference: Preserve existing. Retain the existing arc except for expressly permitted local changes.

Use photographed facial proportions and perspective as context only. A face shape does not prescribe one ideal tooth length; do not rotate the incisal plane to match the eyes.

Before returning, compare with the original and undo any extra length not expressly allowed by its tooth-specific edge permission.

OUTPUT: Return ONE complete edited source photograph at the requested output resolution with the original aspect ratio, framing, scale, rotation and crop. Never return an enlarged mouth, isolated teeth, a close-up crop, collage, mask or reference image. Do not zoom, pan, mirror or move the face. Match natural light, white balance, the shadow the upper lip casts, grain and sharpness with no visible seam. Keep naturally asymmetric detail where the goal permits. Avoid duplicate crowns, notches, floating enamel, sharp mask-like cut-offs, merged contacts or dark slivers. Preserve features already balanced; very little visible change may be appropriate. This is an AI visual concept for clinician discussion, not a diagnosis, predicted or guaranteed clinical result.
```

#### Alignment

```text
PRESERVATION: Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening and non-treatment facial anatomy. Keep eyes, nose, skin, hair, beard and facial hair, background, camera perspective, framing and lighting unchanged. Do not widen the mouth. Do not open the lips further. Keep the same visible upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; if lower teeth are partly visible, do not reveal more of them. Changing the treatment or design never authorises revealing concealed teeth. Retain retractors. Work inside the original smile envelope.

NATURAL SOFT TISSUE IS PROTECTED: Do not edit the gingiva. Retain natural gingival margins, recession, papillae, gingival zeniths, pigmentation, texture and asymmetry. Do not recentre, level or symmetrise the gums, or erase black triangles by adding gum tissue.

RULE PRIORITY: (1) protected anatomy, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades, otherwise global design; (3) notes within those permissions; (4) material and style. Lower-priority preferences never expand permissions. Preserve the photographed bite relationship; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. No photograph establishes occlusal contacts or restorative space.

ORTHODONTIC ALIGNMENT CONCEPT (upper and lower arches (FDI 1x, 2x, 3x and 4x)): ALIGNMENT ONLY: no restorative change is planned. Reposition whole visible teeth within the selected scope to illustrate reduced crowding, overlaps, rotations, tipping and small spaces. Keep the upper dental midline close to its original position; do not recentre it to the face. Keep every tooth present and identifiable; do not add, remove, merge or duplicate teeth, or close a missing-tooth space by drifting neighbours. Each tooth keeps its crown shape, size, incisal edge, wear, texture and shade. Both visible arches may be repositioned within the photographed bite relationship. If movement cannot be shown while retaining the visible natural gingival margins and original smile envelope, retain that feature. This is a visual alignment concept, not a prediction of orthodontic biomechanics, achievable movement, root position, duration or stability.

REGION: only the selected alignment arches. Other teeth are contextual references, not intentional edit targets.

Shade: No intentional shade change from the source appearance. Do not whiten or brighten, regardless of intensity, material or reference shade. Photographic colour is not calibrated shade matching.

Intensity: 35/100 controls only the degree of already permitted change, never a new type of edit.

Use photographed facial proportions and perspective as context only. A face shape does not prescribe one ideal tooth length; do not rotate the incisal plane to match the eyes.

OUTPUT: Return ONE complete edited source photograph at the requested output resolution with the original aspect ratio, framing, scale, rotation and crop. Never return an enlarged mouth, isolated teeth, a close-up crop, collage, mask or reference image. Do not zoom, pan, mirror or move the face. Match natural light, white balance, the shadow the upper lip casts, grain and sharpness with no visible seam. Keep naturally asymmetric detail where the goal permits. Avoid duplicate crowns, notches, floating enamel, sharp mask-like cut-offs, merged contacts or dark slivers. Preserve features already balanced; very little visible change may be appropriate. This is an AI visual concept for clinician discussion, not a diagnosis, predicted or guaranteed clinical result.
```

#### Single tooth

```text
PRESERVATION: Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening and non-treatment facial anatomy. Keep eyes, nose, skin, hair, beard and facial hair, background, camera perspective, framing and lighting unchanged. Do not widen the mouth. Do not open the lips further. Keep the same visible upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; if lower teeth are partly visible, do not reveal more of them. Changing the treatment or design never authorises revealing concealed teeth. Retain retractors. Work inside the original smile envelope.

NATURAL SOFT TISSUE IS PROTECTED: Do not edit the gingiva. Retain natural gingival margins, recession, papillae, gingival zeniths, pigmentation, texture and asymmetry. Do not recentre, level or symmetrise the gums, or erase black triangles by adding gum tissue.

RULE PRIORITY: (1) protected anatomy, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades, otherwise global design; (3) notes within those permissions; (4) material and style. Lower-priority preferences never expand permissions. Preserve the photographed bite relationship; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. No photograph establishes occlusal contacts or restorative space.

TREATMENT: Layered composite. Layered composite: allow restrained dentine/body/enamel depth, cervical-to-incisal transitions and incisal translucency appropriate to the chosen texture and supplied comparable cases. Do not automatically make this option whiter, longer or better shaped. Keep the design additive; do not simulate hidden reduction or orthodontic movement. Do not invent a particular resin recipe or thickness.

REGION: Modify only visible existing selected teeth (FDI: 11). FDI left/right is the patient's. Never add or remove teeth. Preserve untreated teeth in both arches. Skip uncertain teeth. Missing or obscured identities must be skipped; do not invent replacements. Neighbouring teeth are contextual references, not intentional edit targets. Preserve the existing dental midline. Preserve tooth positions, axes, rotations and arch form.

Shade FDI 11: Clinician-selected target: B1 shade. This is an illustrative shade preference, not calibrated colour prediction.

GOAL SCOPE FDI 11: Apply this entire instruction only to these teeth, not to any other selected tooth. RESHAPE: Permit modest changes to incisal and proximal contours of selected existing teeth, following the requested form and clinician's notes. Keep existing incisal edge positions by default. Extra length requires an explicit clinician request to lengthen the particular tooth; a shape preset, symmetry request or general request to improve the smile is not permission. Choose the smallest supported change within the visible mouth opening and existing arch. Do not expand the whole arch, move roots/axes, level the gums or enlarge all teeth simply to increase intensity. Do not reconstruct missing or heavily broken-down teeth from guesswork. Where feasibility depends on unseen bite, preparation or thickness, choose the smaller visible change and leave clinical feasibility for assessment. END GOAL SCOPE.

TOOTH LENGTH BASELINE: Keep each incisal edge at its original position unless its tooth-specific permission below allows change. Preserve central-to-lateral edge steps and canine cusps. An intact central incisor must not become longer for symmetry, central dominance, a shape preset or a material change. Generic reshaping, brighter shade, ideal proportions or symmetry do not authorise extra length. Lip coverage is not a short-tooth defect. Preserve space below upper edges and lower-tooth visibility; no universal tooth-size ratio applies.

FDI 11: Natural; clinician requests slightly longer, within the original mouth opening; shade B1. Design: tooth form soft square (for this tooth only, replacing the global shape preference); slightly wider within its own space, without overlapping or narrowing a neighbour; softly rounded incisal corners.

CONTOUR AND TEXTURE SCOPE: apply only to FDI 11, within each tooth's goal.

DESIGN: shape Rounded; character Balanced; surface Textured with restrained secondary anatomy. Apply only to teeth whose goals permit contour changes. Shade-only and preserved teeth retain their own outlines and texture. Retain photographed central-to-lateral proportions, width progression, natural incisal embrasures, canine cusps and individual asymmetry; keep each canine recognisable with a natural cusp and mesial/distal shoulders; never identical copied teeth or a chiclet row.

Intensity: 35/100 controls only the degree of already permitted change, never a new type of edit.

Smile arc preference: Preserve existing. Retain the existing arc except for expressly permitted local changes.

Use photographed facial proportions and perspective as context only. A face shape does not prescribe one ideal tooth length; do not rotate the incisal plane to match the eyes.

Before returning, compare with the original and undo any extra length not expressly allowed by its tooth-specific edge permission.

OUTPUT: Return ONE complete edited source photograph at the requested output resolution with the original aspect ratio, framing, scale, rotation and crop. Never return an enlarged mouth, isolated teeth, a close-up crop, collage, mask or reference image. Do not zoom, pan, mirror or move the face. Match natural light, white balance, the shadow the upper lip casts, grain and sharpness with no visible seam. Keep naturally asymmetric detail where the goal permits. Avoid duplicate crowns, notches, floating enamel, sharp mask-like cut-offs, merged contacts or dark slivers. Preserve features already balanced; very little visible change may be appropriate. This is an AI visual concept for clinician discussion, not a diagnosis, predicted or guaranteed clinical result.
```

#### Full Arch preserve gingiva

```text
PRESERVATION: Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening and non-treatment facial anatomy. Keep eyes, nose, skin, hair, beard and facial hair, background, camera perspective, framing and lighting unchanged. Do not widen the mouth. Do not open the lips further. Keep the same visible upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; if lower teeth are partly visible, do not reveal more of them. Changing the treatment or design never authorises revealing concealed teeth. Retain retractors. Work inside the original smile envelope.

NATURAL SOFT TISSUE IS PROTECTED: Do not edit the gingiva. Retain natural gingival margins, recession, papillae, gingival zeniths, pigmentation, texture and asymmetry. Do not recentre, level or symmetrise the gums, or erase black triangles by adding gum tissue.

RULE PRIORITY: (1) protected anatomy, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades, otherwise global design; (3) notes within those permissions; (4) material and style. Lower-priority preferences never expand permissions. Preserve the photographed bite relationship; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. No photograph establishes occlusal contacts or restorative space.

TREATMENT: upper full-arch fixed zirconia restorative concept. This is a visual restorative concept only. Reconstruct the visible selected arch as a coherent fixed prosthesis; replace compromised, broken-down, discoloured, irregular, spaced or missing visible teeth only within this selected arch.

Material: zirconia with natural depth, restrained incisal translucency, fine anatomy and realistic polished glaze; no flat opaque denture look. Material does not grant gingival permission.

REGION: visible upper arch. PROTECTED: the lower arch (teeth, gums and spaces) stays as photographed.

Shade: No intentional shade change from the source appearance. Do not whiten or brighten, regardless of intensity, material or reference shade. Photographic colour is not calibrated shade matching.

DESIGN: shape Rounded; character Balanced; surface Natural with natural surface character. Apply only to teeth whose goals permit contour changes. Shade-only and preserved teeth retain their own outlines and texture. Retain photographed central-to-lateral proportions, width progression, natural incisal embrasures, canine cusps and individual asymmetry; keep each canine recognisable with a natural cusp and mesial/distal shoulders; never identical copied teeth or a chiclet row.

Intensity: 35/100 controls only the degree of already permitted change, never a new type of edit.

Smile arc preference: Flatter. Use the visible lower-lip curvature as qualitative context: a flatter lip supports a flatter arc. Apply only within permitted edge changes; if matching the arc requires an unapproved edge change, preserve that edge. Never lengthen premolars merely to fill dark space. If the lip curve is obscured or ambiguous, preserve the original arc.

Use photographed facial proportions and perspective as context only. A face shape does not prescribe one ideal tooth length; do not rotate the incisal plane to match the eyes.

EXPLICIT EXCEPTIONS: Full Arch permits replacement teeth in the selected arch only. Prosthetic gingiva: none; do not add pink prosthetic material. Teeth emerge from the existing natural gum line. Legacy Auto means Preserve/Exclude.

OUTPUT: Return ONE complete edited source photograph at the requested output resolution with the original aspect ratio, framing, scale, rotation and crop. Never return an enlarged mouth, isolated teeth, a close-up crop, collage, mask or reference image. Do not zoom, pan, mirror or move the face. Match natural light, white balance, the shadow the upper lip casts, grain and sharpness with no visible seam. Keep naturally asymmetric detail where the goal permits. Avoid duplicate crowns, notches, floating enamel, sharp mask-like cut-offs, merged contacts or dark slivers. Preserve features already balanced; very little visible change may be appropriate. This is an AI visual concept for clinician discussion, not a diagnosis, predicted or guaranteed clinical result.
```

#### Full Arch include prosthetic gingiva

```text
PRESERVATION: Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening and non-treatment facial anatomy. Keep eyes, nose, skin, hair, beard and facial hair, background, camera perspective, framing and lighting unchanged. Do not widen the mouth. Do not open the lips further. Keep the same visible upper/lower tooth exposure. If only upper teeth are visible, keep the lower teeth hidden; if lower teeth are partly visible, do not reveal more of them. Changing the treatment or design never authorises revealing concealed teeth. Retain retractors. Work inside the original smile envelope.

Preserve natural gingival tissue outside the selected prosthetic interface. Only the explicit interface exception below permits gum redesign.

RULE PRIORITY: (1) protected anatomy, clinician-supplied restrictions and treatment-specific limits; (2) individual tooth goals/shades, otherwise global design; (3) notes within those permissions; (4) material and style. Lower-priority preferences never expand permissions. Preserve the photographed bite relationship; do not invent intrusion, extrusion, jaw opening or correction of overbite/overjet. No photograph establishes occlusal contacts or restorative space.

TREATMENT: upper full-arch fixed zirconia restorative concept. This is a visual restorative concept only. Reconstruct the visible selected arch as a coherent fixed prosthesis; replace compromised, broken-down, discoloured, irregular, spaced or missing visible teeth only within this selected arch.

Material: zirconia with natural depth, restrained incisal translucency, fine anatomy and realistic polished glaze; no flat opaque denture look. Material does not grant gingival permission.

REGION: visible upper arch. PROTECTED: the lower arch (teeth, gums and spaces) stays as photographed.

Shade: Clinician-selected target: B1 shade. This is an illustrative shade preference, not calibrated colour prediction.

DESIGN: shape Rounded; character Balanced; surface Natural with natural surface character. Apply only to teeth whose goals permit contour changes. Shade-only and preserved teeth retain their own outlines and texture. Retain photographed central-to-lateral proportions, width progression, natural incisal embrasures, canine cusps and individual asymmetry; keep each canine recognisable with a natural cusp and mesial/distal shoulders; never identical copied teeth or a chiclet row.

Intensity: 35/100 controls only the degree of already permitted change, never a new type of edit.

Smile arc preference: Follow lower lip. Use the visible lower-lip curvature as qualitative context: a flatter lip supports a flatter arc. Apply only within permitted edge changes; if matching the arc requires an unapproved edge change, preserve that edge. Never lengthen premolars merely to fill dark space. If the lip curve is obscured or ambiguous, preserve the original arc.

Use photographed facial proportions and perspective as context only. A face shape does not prescribe one ideal tooth length; do not rotate the incisal plane to match the eyes.

EXPLICIT EXCEPTION: Full Arch + prosthetic gingiva Include permits redesign of the selected prosthetic interface with natural-looking pink material and papillae. This selected interface may differ from the source gum margin. Preserve all unrelated natural tissue, the opposite arch unless selected, lips, expression and mouth width/opening. Do not extend pink material onto lips or outside the selected interface.

OUTPUT: Return ONE complete edited source photograph at the requested output resolution with the original aspect ratio, framing, scale, rotation and crop. Never return an enlarged mouth, isolated teeth, a close-up crop, collage, mask or reference image. Do not zoom, pan, mirror or move the face. Match natural light, white balance, the shadow the upper lip casts, grain and sharpness with no visible seam. Keep naturally asymmetric detail where the goal permits. Avoid duplicate crowns, notches, floating enamel, sharp mask-like cut-offs, merged contacts or dark slivers. Preserve features already balanced; very little visible change may be appropriate. This is an AI visual concept for clinician discussion, not a diagnosis, predicted or guaranteed clinical result.
```

---

## 3 October — generation prompt and provider-failure audit (READ-ONLY)

### Executive finding

**FAIL — latest recorded generation:** request `8b90cadf-13af-4add-92de-e868c0bba260` failed at the server-response stage with `502 / provider_no_image`, before client alignment or compositing. **The precise upstream cause is NOT DETERMINED.** Changing gum/lip protection cannot be justified as a repair for this particular failure. The exact Google response was not retained in the available evidence.

**PASS — audit evidence:** 100/100 existing targeted tests; 12 exact prompt captures through the real adapter using an offline fetch stub; 14 setting-effect probes; 9 distinct synthetic response structures reproduced the same no-image error. **0 live provider requests.** Read-only staging model/allowance checks only. No application code, prompt, mask, deployment, account or commercial configuration was changed in this audit. Existing uncommitted work is preserved.

**Confirmed prompt defects/mismatches:** current shade is omitted from the current Gemini prompt; alignment-only still gets restorative material and fixed-position instructions; Full Arch defaults pink material to Auto, ignores clinical data/bite/arc preferences, and changes the meaning of the UI's Keep shade choice. These are evidenced prompt/UI mismatches, **not established causes of the latest no-image response**.

**Next action:** review the minimal cleanup proposal in E. Before diagnosing the next no-image request, arrange a privacy-safe, request-correlated provider diagnostic capture; do not spend further generations merely to repeat the same uninformative error. This audit stops before implementation.

### Evidence and scope

- Current branch `release/v1-device-test`; HEAD `4a8de132378c8746ed6350aacbedf421fddc6c8d` plus existing dirty work. The native build has not been rebuilt or installed during this read-only audit.
- Used Superpowers systematic debugging: establish stage → trace the actual adapter → reproduce response classification locally → trace settings through the final request. No architecture change or speculative fix.
- Exact full prompts and settings: [local prompt appendix](../output/generation-prompt-audit-2026-10-03/exact-prompts.md). Machine-readable captures, source hashes, audit harness and probe results are alongside it. This directory is git-ignored and contains no patient images, names, notes, credentials or raw historical provider content.
- The appendix contains **current-code synthetic settings**, captured byte-for-byte from `GeminiSmileProvider`'s outgoing text part with networking disabled. It is not a reconstruction of the failed patient's prompt. The private QA records intentionally do not retain that person's settings, notes, references or raw response.
- Latest available phone evidence remains the file retrieved for the 10:08 investigation. A fresh targeted copy of the same QA file failed with CoreDevice 7000 / remote 11001 / POSIX operation-not-permitted. The reason for that access failure is unconfirmed. No full app container was copied.
- Read-only `GET https://smile-by-dr-vik-staging.drvik.workers.dev/api/generation-cost` reports `gemini-3.1-flash-image`. The first sandboxed attempt failed DNS resolution; the same read-only request with normal network permissions succeeded. No generation was submitted.
- Read-only Supabase inspection was limited to the four already known request IDs and non-patient reservation/ledger fields in `smilecompose-staging` (`wukcqlpuzkzwxmdkotfg`). It is ledger evidence, not an authenticated-user image test.

### A. Latest no-image failure

#### A1. Recorded facts

| Field | Evidence |
|---|---|
| Latest known request | `8b90cadf-13af-4add-92de-e868c0bba260` |
| Phone failure time | 3 October 2026, 10:07:18.998 London (09:07:18.998 UTC) |
| Generation path | `standard`, 8 selected teeth |
| Source / submitted canvas | 1269 × 2048 / 1365 × 2048 |
| App HTTP result | **502**, error code **provider_no_image**, stage **response** |
| Provider/model | Current staging model and two neighbouring successful ledger records: **Google / gemini-3.1-flash-image**. The failed reservation itself has no provider/model metadata; exact historical model attribution is inferred from that configuration and adjacent evidence. |
| Upstream HTTP status | Not retained. In the current Gemini adapter, this error is raised **after `response.ok`**, i.e. upstream 2xx. It does **not** mean Google itself returned HTTP 502. An exact upstream status such as 200 cannot be recovered from this record. |
| Returned parts / finish reason | **NOT RETAINED / UNKNOWN** for this request. No assertion of text-only, safety refusal, token exhaustion or mask interference is supported. |
| Allowance | Server reservation `released` at 09:07:19.004194 UTC; exactly one `generation_refund` ledger entry, quantity +1. |
| Client processing | No `align`, `mouth_composite`, `tooth_composite` or subsequent output stage reached. |

The other recorded failure (`079aae93-781f-40a5-86bc-8aa6d176c496`, 10:06:36) also has `502 / provider_no_image` and one confirmed refund. The two other observed requests completed device processing and have committed Google / `gemini-3.1-flash-image` ledger records. This does not prove their cosmetic quality or durable case saving. Equal dimensions across two records do not establish that they used the same photograph.

#### A2. Actual request path

`DesignStudio → page.requestPreview → prepareGenerationPhoto → generateSmileImage → POST staging /api/generate-smile → Cloudflare serveRequest → handleGenerationRequest → getSmileProvider → generateSmile → GeminiSmileProvider.generate → Google generateContent`

Current configured transport is the Gemini Developer API route, as selected by `SMILE_PROVIDER=gemini` in staging configuration:

`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent`

The code also supports a separate Vertex transport; there is no evidence of a switch to it here. The live model endpoint does not expose transport or a deployed source hash, so current local source and live configuration are not presented as byte-for-byte deployment verification.

The app sends the prepared source image, source bounds, selected settings, resolution, optional reference and optional single-tooth guidance mask. Auth, consent, request deduplication and allowance reservation precede the provider request. The server may add the signed-in clinician's matching style-library images. Gemini receives **image parts plus the built prompt**, not the whole settings object.

Current Gemini payload order:

1. Original prepared source photograph.
2. Optional patient reference photograph.
3. Optional server-selected style references.
4. Optional Tooth Map mask, only when both `SMILE_MASK_GUIDANCE=on` and an `editMask` exist.
5. Final text from **`buildImageEditPrompt`**, not the longer `buildSmileInstruction` used by other adapters.

Configuration: `responseModalities: ["TEXT", "IMAGE"]`; Gemini 3 `thinkingConfig.includeThoughts: false`; nearest supported aspect ratio; requested 512/1K size for the configured priced model. No `maxOutputTokens` override is supplied. These are current implementation facts, not an identified fault in these settings.

For the current standard eight-tooth path, `generationProtectionPlan` rejects multi-tooth guidance, so no per-tooth mask is attached by this path. The clinician-painted protection area is device-local. Normal multi-tooth output uses the original inner-mouth boundary after the provider returns; **there is no broad automatic gum-colour mask in this current path**. The historical request body is unavailable, so this is a code-path finding, not a recovered payload dump.

#### A3. Why no image was extracted

The current extractor:

1. Attempts JSON decoding; decoding failure becomes `null`.
2. Takes `body.candidates` only if it is an array.
3. Considers candidates with missing `finishReason` or `finishReason === "STOP"`.
4. Searches those candidates' parts for the **last non-thought inline PNG/JPEG image with string data**.
5. Requires non-empty image data. If none survives, raises `provider_no_image`, or `image_not_processed` for the adapter's recognised block categories.
6. If data exists but fails the data-URL/type-signature schema, raises the separate `invalid_provider_image` error. That was **not** the recorded error.

The offline reproduction demonstrates the ambiguity:

| Synthetic upstream response (all HTTP 200) | Current adapter outcome |
|---|---|
| Empty candidates | 502 / provider_no_image |
| STOP with text only | Same |
| STOP with only a thought image | Same |
| STOP with unsupported image MIME | Same |
| STOP with an empty image string | Same |
| NO_IMAGE finish | Same |
| MAX_TOKENS candidate containing an image | Same; unfinished candidate is excluded |
| Invalid JSON | Same; decode failure becomes null |
| IMAGE_PROHIBITED_CONTENT finish | Same; current blocked-category list omits this value even though the diagnostic enum recognises it |

Each reproduction made exactly one **stubbed** transport call. None establishes which structure occurred on the phone. Do not accept thought, truncated or blocked images as a workaround.

#### A4. Retry, charging and diagnostic gaps

- No automatic provider retry and no automatic client generation retry. Client timeout 255 seconds; provider timeout 240 seconds. Manual Generate creates a new request ID. The Cloudflare request guard claims an ID for 24 hours and prevents duplicate provider spend on that ID; this is not a result-retrieval mechanism.
- Provider failure calls server `release_generation`. A release failure is caught without confirming a refund to the client. For the **two inspected failures**, refund is independently confirmed in the ledger. The generic UI's cautious allowance wording is therefore appropriate when no receipt is returned.
- The one automatic retry in the handler is a **successful generation's ledger commit**, not another image request. Server-success/client-processing-failure remains the separate unresolved delivery problem documented below.
- `gemini_no_final_image` already logs bounded categories, finish reasons and counts. It does not include the client request ID. It counts text/image parts only after unfinished candidates have been filtered, which can conceal the structural reason an image was rejected.
- Device diagnostics retain request ID/path/dimensions/status/stage, but no provider finish/parts summary. Failed ledger entries have no model metadata. Local staging worker configuration has observability disabled. The available evidence does not contain a historical provider log for this request.
- **Root cause conclusion:** **confirmed failure boundary: provider-response extraction; exact upstream cause NOT DETERMINED.** No evidence that excessive protection caused this no-image failure. No evidence yet that a prompt conflict caused it either.

### B. Exact current prompts, by mode

The [exact prompt appendix](../output/generation-prompt-audit-2026-10-03/exact-prompts.md) contains complete, unabridged final prompt text and validated settings for all seven requested modes, plus single-shade/layered/legacy composite, combined alignment, the optional mask variant and the current Auto-gingiva default. `exact-prompts.json` also records part order, model endpoint, generation config and prompt hashes. The photo stand-in never leaves the process.

Canonical baseline: 8 upper teeth `[14,13,12,11,21,22,23,24]`, Auto goal, Rounded/Balanced, Natural texture, intensity 35, current A2, target Whiten, Full face, face style Auto, existing smile arc, no bite assessment, no notes/clinical data/references. Full source bounds are included; real padding/camera/reference clauses vary with the request.

| Requested mode | Actual state / exact treatment-specific instructions | Appendix fixture |
|---|---|---|
| Whitening | There is **no Whitening treatment enum**. Colour-only requires `designIntent: "Shade only"`, plus `targetShade: "Whiten"` (or another target). Exact shade clause: `Shade: Gently whiten selected teeth, retaining realistic warmth and shadows.` Exact goal begins `SHADE ONLY: Change only the colour of selected teeth.` It goes on to preserve outlines, contacts, gaps, edges, texture and position. The chosen composite/porcelain material line remains present. Choosing Whiten alone only changes shade and **does not** select Shade only. | `whitening` |
| Composite | `treatment: "Single-shade composite"`: `Material: Single-shade composite; one body shade, natural polished depth; no separate enamel/dentine layers or exaggerated translucent edges; additive changes only. Intensity 35/100 controls only permitted changes.` Goal is independently Auto/Repair edges/Close gaps/Reshape/Shade only. | `composite` |
| Layered composite | `Material: Layered composite; restrained body/enamel layering, slight incisal translucency and natural secondary anatomy; additive changes only. Intensity 35/100 controls only permitted changes.` | `layered` |
| Porcelain | `Material: Porcelain; natural ceramic light transmission, fine surface anatomy and realistic glaze; keep the requested shade and geometry. Intensity 35/100 controls only permitted changes.` No automatic extra length or movement permission. | `porcelain` |
| Alignment | `alignment: {arches:"Both", only:true}` internally sets Shade only, target The same and discards per-tooth plans for prompt construction. Exact controlling clause: `ALIGNMENT ONLY: no restorative change is planned. Apart from position, keep every tooth's shape, size, edges, surface texture and shade exactly as photographed.` Ends: `This illustrates a possible alignment for discussion; it does not predict orthodontic movement, duration, root position or stability.` The entire alignment block is in the appendix. | `alignment`; combined mode `alignment-restorative` |
| Single tooth | Active selection contains only FDI 11; same standard preservation block. Representative explicit controls produce `FDI 11: Natural; clinician requests slightly longer, within the original mouth opening; shade B1. Design: tooth form soft square (for this tooth only, replacing the global shape preference); slightly wider within its own space, without overlapping or narrowing a neighbour; softly rounded incisal corners.` Reviewed boundary enforcement is device-side, not guaranteed by this text. | `single-tooth`; guidance flag variant `single-tooth-mask` |
| Full arch without prosthetic gingiva | `treatmentMode:"full_arch"`, `fullArch:{arch:"upper",restorationType:"zirconia",prostheticGingiva:"exclude"}`. Exact clause: `Prosthetic gingiva: none. The restored teeth emerge from the patient's existing gum line; do not add pink prosthetic material.` Reconstructs selected visible arch, protects opposite arch in the prompt, preserves photographed opening. | `full-arch-exclude` |
| Full arch with prosthetic gingiva | Same but `prostheticGingiva:"include"`. Exact clause: `Prosthetic gingiva: include a natural pink prosthetic gingival flange at the cervical area of the restored arch, matched to the patient's gum colour and texture, with natural papillae and a believable transition — never extending onto the lips.` However an earlier unconditional clause forbids changing **all natural gum tissue**, leaving the intended interface exception unclear. | `full-arch-include` |
| Current full-arch default (important) | `prostheticGingiva:"auto"`: `Prosthetic gingiva: only where the visible ridge or tissue within the existing smile would need it for a natural result, add a discreet pink prosthetic gingival flange matching the patient's gum colour; otherwise let the teeth emerge from the existing gum line.` This is independent of whether zirconia or provisional material is selected. | `full-arch-auto` |

### C. UI → state → current provider prompt mapping

“Sent” below means included in the **current constructed provider request**, verified through the adapter. It is not a claim that every optional setting was used in the failed historical request. Settings may reach SmileCompose's backend JSON and still never appear in Google's prompt.

| UI setting / rule | State value | Exact current prompt text or omission | Sent to provider? | Duplicate / conflict / limitation |
|---|---|---|---|---|
| 4/6/8/10, Custom | `selectedTeeth`, active `toothPlans` | `Edit only visible existing selected teeth (FDI: …); preserve untreated teeth in both arches.` | Yes, active FDIs | Full arch intentionally replaces tooth selection with arch selection. Missing/Preserve are excluded by the schema/active-plan logic. |
| Design goal | `designIntent`, per-tooth `intent` | `Only FDI …: AUTO: …`, `SHADE ONLY: …`, `REPAIR EDGES: …`, `CLOSE GAPS: …`, or `RESHAPE: …` | Yes, grouped by resolved goal | Auto is conservative: gaps/wear/dimensions stay by default. Shape/material selection alone is not broad reshaping permission. |
| Treatment | `treatment` | Material clauses in B | Yes standard; replaced by fullArch material in full arch | Still emitted for colour-only and alignment-only; avoid telling those modes to add a new material finish. |
| Shape | `shape` = Square/Rounded/Triangular | `Within permitted contour changes only: shape Rounded, character Balanced, surface Natural.` | Standard only if contour goals exist; full arch always gets morphology | Shape ignored deliberately for Shade only. Full-arch morphology uses square/rounded/tapered words. |
| Character | `character` | `character Balanced` | Same as shape | Subordinate to permitted geometry. |
| Current shade | `currentShade` = A3/A2/A1/B1 | **No reference in current Gemini builder, including full arch.** | **No**, though sent to backend | UI says “Used with a specific target shade.” Older long builder still includes it; current short Gemini builder does not. Reproduced by changing A2→A3 with identical prompt. |
| Target shade | `targetShade` | `Shade: preserve the original colour.` / `Shade: Gently whiten selected teeth, retaining realistic warmth and shadows.` / `Shade: brighter bleached white on selected teeth, retaining depth and shadows.` / `Shade: clinician-selected B1.` | Yes standard | Per-tooth shade can override; priority states this, but global shade is still broad. |
| Keep shade in full arch | `targetShade:"The same"` | `a natural shade harmonised with the patient's complexion (the existing shade is not a constraint for a new prosthesis)` | Yes | **Contradicts the shared Keep UI description.** It allows a new shade. |
| Texture | `texture` = Smooth/Natural/Textured | Standard `surface Natural`; full arch `Surface: natural surface character with plausible light reflection.` or explicit smooth/textured clause | Conditional standard; yes full arch | Alignment-only/Shade only should retain original texture, despite material optics wording. |
| Intensity | `intensity:35` | `Intensity 35/100 controls only permitted changes.` Full arch: `Transformation intensity: 35/100 — how fully idealised the new arch looks, within this envelope.` | Yes | Permission amount only; never authority to open the smile or lengthen intact teeth. |
| Smile arc | `smileArc` | `Smile arc preference: Flatter. Use visible lower-lip curvature as context only, within existing edge permissions; a flatter lip supports a flatter arc.` Followed by no extra length/gum/posterior/bite permission | Only full-face standard with active upper Auto/Reshape | Full arch ignores the state and always requests consonance with lower lip; close-up full arch still receives that global arc/midline instruction. |
| Per-tooth intent, condition | `toothPlans[].intent/condition` | `FDI …: Missing, preserve unchanged.` / `FDI …: Natural, preserve unchanged.`; Restored adds `A shade illustration does not imply this restoration can be whitened.` | Yes standard | Full arch bypasses individual plans intentionally. Alignment-only drops them internally. |
| Per-tooth form, width, edge | `shape`, `width:-1/0/1`, `edge` | `tooth form soft square … replacing the global shape preference`; `slightly wider within its own space, without overlapping or narrowing a neighbour`; `slightly narrower, keeping its contacts natural`; `a level, even incisal edge`; `softly rounded incisal corners` | Non-Shade-only goals | Per-tooth/global shape override is explicit and intentional. Narrower/shorter can compete with composite “additive changes only”; preserve priority rather than silently granting reduction. |
| Per-tooth length | `length:-1/0/1`, resolved goal | `keep edge positions and length unchanged` for preserve policy; otherwise `clinician requests slightly longer, within the original mouth opening` / `clinician requests slightly shorter` / local-repair wording | Conditional | Preserve policy overrides length for Shade only/Close gaps. Length ±1 currently precedes local-repair wording, which competes with repair-only limits. Explicit 0 alone emits no clause and is indistinguishable from unset in the probe. |
| Per-tooth shade | `toothPlans[].targetShade` | `FDI …; shade B1.` (or raw The same/Whiten/Bleach enum) | Yes standard | Intended override; not an independent measured optical prediction. |
| Facial identity | No separate toggle | `Keep the original face, expression, lips, mouth opening, gums, background, lighting and camera framing unchanged.` | Yes all standard modes | Full arch explicitly says `Preserve the exact patient identity`. Short standard prompt implies identity through unchanged face; no need to append a second preservation paragraph. |
| Expression | Invariant | `Keep the original face, expression, … unchanged.` | Yes | Repeated in some full-arch review/envelope blocks. |
| Lip position | Invariant | `… lips … unchanged` and `Keep hidden teeth hidden and the same visible upper/lower tooth exposure; never open the smile or jaw further.` | Yes | Full arch/alignment have explicit lip-position instructions. Prompt intent is not anatomical guarantee. |
| Mouth width | Invariant | **No explicit “mouth width” clause in the short standard branch without alignment.** | Implicit in unchanged lips/face; explicit alignment/full arch | Could make explicit by replacing the existing shared sentence, not adding duplicate blocks. |
| Mouth opening | Invariant | `mouth opening … unchanged`; `never open the smile or jaw further` | Yes | Alignment/full arch repeat this in their scope blocks. |
| Head position | Invariant | **No explicit “head position” clause in the short standard branch.** Same head in view/framing/face are required | Implicit standard; explicit full arch | Same minimal shared-sentence cleanup as mouth width. |
| Natural gingival margins | Invariant standard/alignment | `Retain natural gingival margins, papillae and recession.` Alignment adds `Natural gum tissue and visible margins stay exactly as photographed.` | Yes | Full arch unconditionally freezes all natural gum tissue, even with Include. |
| Untreated teeth | Selection / alignment scope | `preserve untreated teeth in both arches` | Yes | Alignment adds an explicit movement exception for its selected arches; a later reference block again says keep all tooth positions, creating a conflict. Full-arch opposite arch is prompt-protected; arch compositor flag is off. |
| Full-arch permissions | `treatmentMode:"full_arch"` AND `fullArch` | `RESTORED REGION: reconstruct the visible upper dentition … replace compromised, broken-down, discoloured, irregular, spaced or missing visible teeth with a complete, evenly spaced arch.` | Yes, only full-arch branch | This mode allows missing-tooth replacement; standard explicitly does not. |
| Prosthetic gingiva | `fullArch.prostheticGingiva:auto/include/exclude` | Exact clauses in B | Yes, only full-arch branch | **Auto default violates explicit Include-only target.** Zirconia is not itself the condition in code; the default Auto setting creates the unintended permission. |
| Clinical restrictions / measurements | `clinicalData` | `CLINICIAN DATA: Measured overbite: 5 mm.` / `Clinical constraints: …` / `SPACE RESTRICTION: Do not add incisal length or posterior height while restorative space is limited or uncertain.` | Yes standard when object exists; **NO full arch** | Full-arch early return bypasses the entire clinical-data helper. Confirmed by unchanged prompt with clinical restriction added. |
| Bite context | `biteContext` | `Clinician bite context: Deep bite; retain the photographed bite relationship. This photo edit does not simulate bite correction.` | Yes standard if assessed; **NO full arch** | Full arch has generic no-bite-opening text, but the entered context itself is omitted. |
| Facial style reference | `faceShape` | `Optional facial style reference: Square.` | Standard full-face contour goals only; **NO full arch** | Appropriate suppression for close-up/Shade only; full-arch UI still offers this setting. |
| Photo type | `shotType` | `Use only anatomy visible in this close-up; retain retractors and do not infer a facial shape or a hidden lip curve.` | Yes | Full arch close-up still has an earlier unconditional facial-midline/lower-lip arc instruction. |
| Notes | `notes` | `Clinician notes, within the permissions above: … Honour negations; preserve features where instructions conflict.` | Yes when non-empty | UI example “lengthen the laterals slightly” is subordinate to tooth/space restrictions. Full arch also sends notes, but not separate clinical constraints. |
| Reference / clinician style | `referenceImage`, `libraryStyle` + server matches | `Edit only the first image. Keep all identity, gum architecture and tooth positions from the first image; never average arrangements or copy reference anatomy.` | Only when actual reference images exist | “tooth positions” conflicts with enabled alignment. Library images' “material finish only” is narrower than the richer advertised/legacy style guidance. |
| Case features | `caseFeatures` | No direct instruction | No direct Gemini text | Can influence server style matching; it is not transmitted as clinical facts. |
| Protect edit area / reviewed tooth boundary | `photo.editMask`, `photo.toothMap`; optional provider `editMask` | When guidance enabled: `The final image is an edit mask: white permits edits, black protects original pixels. Return the edited first photograph, never the mask.` | Provider guidance only when explicitly configured; painted mask stays local | “The final image” should identify the final **input** image to avoid ambiguity. Reviewed single-tooth compositing remains separate and unchanged. |

#### Conflicts and duplication, prioritised

1. **Full Arch Auto permission:** entering full arch defaults to Auto and can add pink material. Changing zirconia→provisional does not revoke it. The requested permission should depend solely on `full_arch && prostheticGingiva === "include"`.
2. **Full Arch gum exception:** the Include clause asks for a cervical flange/papillae/transition, but an unconditional earlier sentence preserves every natural gum margin/papilla and forbids pink over natural tissue. It does not clearly delimit the selected prosthetic interface exception the owner wants.
3. **Full Arch dropped constraints:** `clinicalData`, `biteContext` and chosen `smileArc` never reach that prompt branch. The UI exposes them. Aesthetic arch/midline rules currently cannot be constrained by those omitted clinician data.
4. **Alignment-only contradictory base:** its internally forced Shade-only goal says to keep tooth positions/contacts/gaps exactly, while the alignment block asks to move teeth and correct spaces. The material clause still asks for restorative optics. The explicit alignment exception mitigates this but leaves unnecessary competing instructions.
5. **Reference + alignment conflict:** the later reference block unconditionally preserves tooth positions. This should prohibit copying reference positions while allowing the already selected alignment scope.
6. **Whitening ambiguity:** Whiten is a shade button, not a colour-only treatment switch. Auto + Whiten can still refine contours. Shade-only + Whiten preserves geometry but still gets material-finish language. The goal's priority resolves the intended hierarchy; the redundant material instruction is unnecessary.
7. **Keep shade mismatch:** full arch permits a newly harmonised shade despite the same “Keep” control saying the current shade stays.
8. **Per-tooth conflicts:** global/per-tooth form and shade have an intended override, not a bug merely because both are present. Repair + length, narrowing/shortening + additive composite, and explicit zero length need narrowly defined precedence if cleaned up; do not broaden permissions silently.
9. **Repeated preservation:** standard base, goal, clinical review (when present), alignment and reference clauses repeat gums/positions. Full arch repeats face/envelope/display preservation at start and end. Consolidate only where equivalent; retain treatment-specific exceptions. Do not just append another rules block.
10. **Two prompt families:** Gemini uses the short image-edit builder; the long builder still has settings such as current shade. Passing tests of the long builder alone does not prove Gemini receives those settings. The shared prompt-version label does not identify this difference by itself.

### D. Missing settings and unsupported implications

- **Missing from the current provider prompt:** current shade in all modes; full-arch clinical restrictions/measurements, bite context, selected smile arc and facial style reference. Full-arch per-tooth plans/standard material are intentionally set aside, not accidental omissions.
- **Not an existing top-level mode:** Whitening. The present app expresses it through Shade only + target shade. No new screen or major feature is proposed.
- **Incomplete explicit preservation wording:** standard mouth width and head position are implicit rather than separately named. Replace the existing compact invariant with an explicit one if a cleanup is approved.
- **Technical enforcement versus prompt intent:** the current full-face mouth compositor restores pixels outside the original inner-mouth boundary after alignment. It does not anatomically identify every gum margin inside that region. Reviewed single-tooth masks add separate boundary enforcement only when available; boundary accuracy still needs clinical review. Multi-tooth, alignment and full arch do not gain reliable unselected-tooth/gum protection merely by saying so in a prompt. The full-arch arch compositor is currently disabled. Close-up inputs without a usable mouth lock or reviewed/painted region retain the existing documented limitation.
- **Missing diagnostic discriminator:** exact provider finish/part structure linked to the request. This is what blocks a confident root-cause fix for the no-image failure.

### E. Recommended minimal cleanup — NOT IMPLEMENTED

1. **First improve evidence for no-image:** use bounded, request-correlated diagnostics for upstream status, provider/model, JSON parse success, finish/block enums, part counts across **all** candidates, accepted final-image count, input/reference/mask count, dimensions and stage. Do not retain generated text, images, notes, signatures, tokens or full request/response bodies. Current logging does not supply the needed historical evidence; changing external logging configuration requires a separate staging action.
2. **One shared preservation rule:** explicitly name face/identity, head position, expression, lips, mouth width/opening and framing in the existing sentence. Normal restorative/whitening and alignment modes preserve natural gingival margins and untreated teeth. Keep the present minimal face/lip/outside-mouth safeguard and reviewed single-tooth protection. Add no broad new gum mask.
3. **Choose goal-specific instructions once:** Shade-only sends colour rules without new material texture/contour requests. Alignment-only sends position-only rules without a contradictory fixed-position Shade-only paragraph or restorative finish. Combined alignment/restoration scopes each permission explicitly. Reference instructions must not copy another person's positions, while preserving the chosen alignment exception.
4. **Full-arch permission gate:** only `treatmentMode === "full_arch" && fullArch.prostheticGingiva === "include"` may permit redesign of the selected prosthetic gingival interface. Zirconia/provisional selection never grants that permission. Default new full-arch choices to Exclude; existing Auto cases need an explicit reviewed choice, without silently rewriting saved cases. Outside that interface, preserve natural tissue and the whole face/lip/opening envelope. Keep standard cases' natural-gum rule unchanged.
5. **Carry existing clinician choices through:** use current shade as clinician-supplied context where a specific target is chosen; honour Keep in full arch or label its different meaning clearly; carry full-arch clinical restrictions/bite context and explicit arc preference without implying biomechanical accuracy. Suppress facial/lip assumptions when the relevant anatomy is not visible. These are corrections to existing settings, not automatic treatment recommendations.
6. **Regression gate before any future implementation:** assert outgoing Gemini text, not only helper strings; cover every mode, Keep vs chosen target, explicit pink Include/Exclude/legacy Auto, current shade, clinical constraints, close-up, alignment + reference, per-tooth overrides and source bounds. Preserve thought/incomplete-image rejection and selected-tooth protection. Prove actual generation and cosmetic quality separately with authorised content and an agreed remaining provider-call budget.

**STOP:** no cleanup has been applied. The no-image failure's exact provider cause remains unresolved. This audit changes only this handover and ignored local evidence; the existing Xcode install package and generation behaviour remain unchanged.

---

## 3 October, 10:08 follow-up — timed steps and confirmed provider failures

- **PASS — requested loading presentation restored:** the existing four-step list, champagne markers and stage indicator now return with paced transitions (2.5 / 6.5 / 12 seconds live; shorter demo timing). The visible stage is capped by the actual request/alignment/compositing progress. Elapsed time cannot mark provider work finished. A batch uses its least advanced concept; stale/cancelled callbacks cannot update a new operation. No additional wait is imposed before displaying a completed result. Existing Reduced Motion styles apply.
- **PASS — real iPhone diagnostic retrieval:** read only `Library/Caches/smile-generation-qa.json`, retained privately at `output/iphone-release-gate/iphone-generation-qa-2026-10-03-1008.json`. Four owner-initiated requests were recorded: two completed on-device processing (10:05:48 and 10:06:57 London), two failed at the server response stage (10:06:36 and 10:07:18). Completion is not proof of cosmetic acceptability or durable case saving.
- **FAIL — missing provider image, distinct from the earlier protection rejection:** failed request IDs `079aae93-781f-40a5-86bc-8aa6d176c496` and `8b90cadf-13af-4add-92de-e868c0bba260` both returned **HTTP 502 / provider_no_image**, stage `response`, standard path, eight selected teeth. Latest source dimensions were 1269 × 2048; submitted canvas 1365 × 2048. These failures occurred before client alignment or lip/mouth compositing. This code means no acceptable completed image was extracted; it does not identify a specific provider finish reason or prove the input photo unsuitable. Historical provider response/log details are not retained (worker observability is disabled); the underlying reason remains unresolved. Provider parsing, generation requests and protection behaviour were not changed.
- **PASS — allowance returned for these exact failures:** read-only Supabase inspection of the four request IDs confirmed both failed reservations `released`, with one `generation_refund` quantity +1 each. The two successful reservations were `committed`. No balance, subscription or schema mutation was made. This evidence does not resolve the separate server-success/client-failure delivery problem.
- **PASS — fresh install package:** production native build, Capacitor sync, TypeScript, ESLint, full **570/570 tests**, bundle/production checks, signed Xcode Release build and deep/strict signature verification. The bundled assets match the new build and private QA diagnostics remain enabled. Branch `release/v1-device-test`, HEAD `4a8de13` plus preserved/current uncommitted work; Xcode's intervening plist/project ordering changes were preserved. Version 1.0 (1), same bundle/team, staging only. Evidence `output/iphone-release-gate/oct03-steps-*`; the initial new progress tests failed because the requested progress module did not yet exist, then targeted 24/24 and full 570/570 passed.
- **NOT TESTED / HUMAN REVIEW REQUIRED:** the restored step layout on the new physical build, and the reason the provider returned no usable final image. No new live provider calls were made by the agent; the four existing user-triggered records above are separately observed evidence, not an increase to the overnight allowance. No deployment, device install or Apple upload.
- **Next action:** run the updated App scheme in Xcode (Run configuration Release) onto the existing iPhone installation. Stop on another generation failure and collect diagnostics rather than repeatedly retrying. Loading presentation is updated; generation reliability is **not claimed fixed**.

---

## 3 October follow-up — iPhone rejection and Xcode install package

- **FAIL / root cause not established:** owner supplied `IMG_3488.PNG`, iPhone at 09:46, 8 upper teeth, Round / Balanced. The displayed message comes from `lockFace` after the provider result is returned and `alignPreview` has completed. The mouth-compositor returned `locked: false` without the separate framing-rejection flag. That narrows the failure to source landmark availability, decode/canvas/compositing or encoding; it does not establish that the photo is unsuitable. No provider result from this request was available for reproduction.
- **NOT TESTED — original device diagnostic:** the iPhone was connected. Read-only retrieval of only `Library/Caches/smile-generation-qa.json` failed with CoreDevice error 7000 (file node could not be retrieved). No patient-data container was downloaded. The preceding local package did not have the explicit QA opt-in baked in; the installed package's diagnostic configuration is unknown.
- **PASS — diagnostic change only:** retained all alignment thresholds, masks and rejection behaviour. Added allowlisted mouth-protection failure categories for decoding, source landmarks, alignment, canvas, compositing and encoding. The existing local QA record now receives the specific category. No raw exception, patient image, note or token is recorded. The failing regression first reported missing `mouth_image_decode_failed`; subsequent targeted tests passed (15/15).
- **PASS — ready for owner-installed direct-device QA:** branch `release/v1-device-test`, HEAD `4a8de13` plus preserved uncommitted work and this narrowly scoped diagnostic change. Version **1.0 (1)**, bundle **uk.co.drvik.smilecompose**, automatic signing team **7TPF7LT884**. Built with `NEXT_PUBLIC_SMILE_QA_DIAGNOSTICS=1 NEXT_PUBLIC_SMILE_DEBUG=0`. Production web/native build, Capacitor sync, TypeScript, ESLint, **567/567 tests**, native/production checks and signed Xcode **Release / iphoneos** build passed. Codesign deep/strict verification passed with normal permissions. Entitlements include Apple sign-in and Complete Data Protection. Camera/photo-save purposes and privacy manifest present. All packaged assets match the freshly built native assets.
- **PASS — staging selection:** executed the bundled `apiUrl` function and confirmed `/api/generate-smile` resolves to `https://smile-by-dr-vik-staging.drvik.workers.dev/api/generate-smile`; staging Supabase and App Store public SDK key are bundled. No remote development server. Initial ad-hoc verification incorrectly expected error codes in the same split JS chunk, then incorrectly rejected an unreachable production fallback string; the corrected check inspects all chunks and executes the actual bundled URL function. No application configuration was changed to satisfy either check.
- Private evidence: `output/iphone-release-gate/oct03-{build,tests,lint,typecheck,cap-sync,production-check,xcode-release}.log`, `oct03-config-check.json`, `oct03-package-verification.json`, and `mouth-diagnostics-red.log`. App: `/tmp/smile-device-consent/Build/Products/Release-iphoneos/App.app`; native package timestamp `2026-10-03T08:52:03.308Z`.
- **NOT TESTED:** this new package's on-device generation and diagnostic-file creation. **No new provider requests**, deployment, physical installation or Apple upload performed. No cases were removed or reset. The previously documented charged-result recovery and legal/distribution gates remain unresolved. The local-only server media-status fix is still not deployed.
- **Next action:** open `ios/App/App.xcodeproj`, choose App scheme → Edit Scheme → Run → Release, select the connected iPhone and Product → Run. Install over the existing app; do not uninstall it. If the next manually authorised test fails, stop and retrieve the private diagnostic file before another paid retry. This build is ready for direct-device investigation; the reported generation failure is **not claimed fixed**.

---

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
