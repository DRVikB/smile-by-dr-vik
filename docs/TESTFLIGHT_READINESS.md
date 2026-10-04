# SmileCompose V1 — owner acceptance handover

## Latest update — combined treatments (4 October 2026)

**PASS — requested treatment controls implemented and installed on the physical iPhone. TestFlight remains HOLD for the existing owner acceptance, legal, distribution-signing and purchase gates.** This section supersedes the older runtime/archive and separate “Include alignment” UI described below.

### What changed

- Whitening, Veneers and Alignment are top-level checkboxes. All seven nonempty combinations are supported; at least one treatment remains selected. The separate Include alignment control is removed.
- All-on-X is exclusive, both visible arches and zirconia. Selecting it clears combined permissions; selecting any standard treatment leaves All-on-X.
- The existing material and Alignment settings are reused. An optional `whitening` field retains combined Whitening in validated generation requests, saved/reopened cases and reports. No database/schema migration, provider switch, geometry/mask change, allowance change or case deletion.
- Combined Whitening follows the existing selected teeth and target/individual shade choices. It does not grant edits to untreated teeth; Keep still means no intentional shade change. Alignment continues to cover both visible arches.

### Evidence and limits

- Source/rollback checkpoint: `ad69f116733b271041401c9536da483d287c82ec` on `release/v1-device-test`; previous checkpoint `a20f910`. Owner Xcode project/scheme changes remain uncommitted and preserved.
- **PASS:** 710/710 Node tests (61.71 s, zero skipped), TypeScript, ESLint, production web build, Capacitor sync, native bundle/config checks and Cloudflare packaging. New behavioral tests cover seven combinations, exclusivity, material/shade retention, both prompt formats and local-restart/second-device binary media recovery.
- **PASS:** iPhone and iPad Release XCTest fixture journeys, including combined selection/review, alignment-only scope, All-on-X exclusivity, comparison interaction, force-close/reopen and iPad landscape. Actual screenshots were inspected. Fixture replay is not a live generation or real authentication/purchase test.
- Failure history retained: seven UI behavioral RED failures and two contract RED failures before implementation; a TypeScript label-parameter error corrected; first native assertion queried a text label as a Button and was corrected to StaticText. Subsequent simulator launch/boot attempts timed out with launchd_sim/session errors during restart; after restart completed, sequential iPhone/iPad tests passed. Failed runner logs remain in the private evidence folder. Archive verification initially rejected filesystem metadata; clearing generated-artifact extended attributes produced strict/deep signature PASS, without changing code or signature requirements.
- **PASS:** matching staging version `8196e3b0-6464-48cc-809c-7e276452a3de`, tag `ad69f11`; public treatment chunk hash matches the archived/installed iOS client. Account/status still returns HTTP401 without authentication. Gemini `gemini-3.1-flash-image`, guidance OFF, existing local safeguards and zero automatic retries retained. No production deployment or Apple upload.
- **PASS:** development-signed Release archive `/Users/vik/Documents/New project/smile/output/treatment-combinations-2026-10-04/SmileCompose.xcarchive`, bundle `uk.co.drvik.smilecompose`, version1.0/build1, installed over existing iPhone app without uninstall/reset. Manifest SHA256 `235937f852724cd3f2deea824ccb2bfca23e102de73d50a4753fd9efb84a384e` covers 184 sorted archived-file digests, not a zip file. Distribution export was not rerun; previous certificate/profile and legal blockers remain.
- **NOT TESTED / HUMAN REVIEW REQUIRED:** fresh physical/live generation quality for treatment combinations, real purchase and physical iPad acceptance. **Zero paid provider requests** during this change. No claim that prompt receipt or simulator replay proves cosmetic quality.

### Exact next owner action

Close and reopen SmileCompose on the iPhone. In Treatment, check Whitening + Veneers + Alignment; choose the existing material and shade; confirm Review shows all selected treatments. Verify All-on-X unticks the others. For the next explicitly authorised live acceptance, inspect the result, save, force-close and reopen, stopping on the first failure. Existing external/paying-beta restrictions, including durable charged-result recovery, remain.

Private evidence: `/Users/vik/Documents/New project/smile/output/treatment-combinations-2026-10-04`. Screenshots: `iphone-combined-treatment-selection.png`, `iphone-combined-treatment-review.png`, `ipad-combined-treatment-selection.png`, `ipad-combined-treatment-review.png`, `ipad-ipad-landscape.png`. Supplied before references: IMG_3517.PNG and IMG_3518.PNG (owner screenshots, no design-service upload).

---

## Previous checkpoint — historical details retained

Updated 4 October 2026 (Europe/London). **HOLD. Nothing has been uploaded to Apple.**

## 1. WHAT WAS ACTUALLY FIXED

- **PASS — one provider call:** `2ba93ec` removes the Gemini empty/text-only automatic second generation. An accepted single Generate dispatch has at most one provider invocation; preflight rejection has zero. No provider fallback.
- **PASS — duplicate taps:** `7ed728c` claims the existing synchronous request lock before asynchronous consent fingerprinting/persistence. Rapid taps cannot enter that preflight twice; cancellation cannot open a stale consent prompt. Both single and explicitly confirmed batch handlers are covered.
- **PASS — close-up recovery and alignment options:** `9421c05` opens the existing Protect edit area tool when face landmarks are unavailable, before a paid call. Include alignment retains the selected bonding/veneer material, shade and teeth. No geometry guard, threshold, prompt, mask or provider was relaxed in this final pass.
- **PASS — honest offer wording:** `3fbe614` removes the static three-day trial promise from signed-out/web plans. Trial text remains conditional on an offer actually returned by the store. This follows native read-only evidence that both App Store products currently have no trial. Prices, products and allowances were not changed.
- **PASS — native export regression:** `fef9a17` adds iPhone/iPad XCTest coverage that prepares the saved preview and report, opens the actual native activity sheet, and cancels without choosing a recipient.

No redesign, new provider, commercial change, schema migration, case reset or user-case deletion. Existing local Xcode project/scheme changes are preserved and excluded from these commits.

## 2. WHAT WAS TESTED — environment, commit and evidence

Branch: `release/v1-device-test`. Starting application checkpoint: `9421c05`; final archived/deployed source: **`fef9a17ad3a215294990585d483d329eb9b1c53b`**. Later report-only changes do not alter the application. The archive also includes the preserved local signing/scheme inputs; it is not represented as a completely clean checkout.

Private, git-ignored evidence: `/Users/vik/Documents/New project/smile/output/testflight-final-2026-10-03/`.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Full Node regression suite | **PASS — 703/703**, zero failed/skipped | `full-suite-paywall.log`; approximately 61.97 s. No live provider calls. |
| TypeScript / ESLint / diff whitespace | **PASS** | `typecheck-paywall.log`, `lint-paywall.log`, `git diff --check`. |
| Production-style web + native / Capacitor sync | **PASS** | `native-sync-candidate.log`; bundled assets/security/config verifier passes. |
| Cloudflare packaging / matched staging | **PASS** | `cloudflare-package-candidate.log`, `staging-deploy-candidate.log`, `staging-version-candidate.json`. |
| iOS Release archive compilation | **PASS** | `archive-candidate.log`; existing development signing. See signing limitation below. |
| iPhone/iPad Release simulator journey | **PASS — fixture/replay only** | `simulator-candidate.log`; actual WKWebView, picker, treatment controls, result processing, comparison/relaunch. |
| iPhone/iPad native preview and PDF share | **PASS — fixture/replay only** | `share-simulator-candidate.log`; native `ActivityListView`, JPEG/PDF file headers, screenshots. No recipient selected. |
| Actual exported consultation PDF | **PASS — local synthetic inspection** | `synthetic-export/consultation-report.pdf`; two A4 pages, before/concept images and retained six-tooth Composite settings, no visible clipping. Both pages rendered/inspected. |
| Normal authenticated staging session / saved media | **PASS** | `staging-auth-media.json`: refresh/status HTTP200; three saved cases, twelve assets HTTP200 and checksum matches. This is read-only reuse of prior authorised QA results. |
| Unauthenticated case / webhook access | **PASS — denied HTTP401** | Same normal HTTP receipt; not privileged access substituted for ownership testing. |
| Store configuration | **PASS for mappings; FAIL metadata completeness** | Provider-native RevenueCat reads, `revenuecat-readonly-summary.json`. Real purchase/restore remains untested. |
| Physical iPhone installation | **PASS** | Final archive installed over existing app; no uninstall/reset. Installation is not generation acceptance. |
| Physical iPhone full Release workflow | **NOT TESTED on this final candidate** | Owner acceptance required. Earlier physical failures remain recorded in the overnight history. |
| Physical iPad | **NOT TESTED** | Dedicated iPad simulator used. |
| Strict legal distribution build | **FAIL** | `distribution-gate-candidate.log`: privacy23 / terms17 unresolved owner/legal items. Guard preserved. |
| App Store distribution export | **FAIL** | `archive-export-candidate.log`: missing distribution certificate/private key and app/widget App Store profiles. No upload attempted. |

Simulator network/auth/entitlement fixtures exist only in a temporary QA bundle. They block external requests and return sync failure rather than falsely acknowledging cloud storage. They are absent from the physical app/archive. A replay tests local processing; it is not fresh Gemini, email, Apple sign-in or StoreKit purchase evidence.

### First failures, reproduction and reruns

**Admission race:** actual page handlers admitted two simultaneous consent preflights while React busy state had not rendered. `action-lock-red.log` recorded four failing assertions; `action-cancel-red.log` recorded stale-consent failures. After the lock fix, all eight new handler regressions and the focused 56-test set passed; final full suite passed. Tests execute the real handler declarations with controlled asynchronous dependencies.

**Trial claim:** actual signed-out/web component rendering promised an offer absent from both products. Both assertions failed in `paywall-copy-red.log`; removing only static claims made `paywall-copy-green.log` pass. Live store-offer rendering remains intact.

**Native share harness:** first attempted the obscured background Share; the second confused the web Copy button with native sharing; the third had a Swift query compile error; the fourth looked for a native Button although iOS27 exposes sharing as cells under `ActivityListView`. Accessibility evidence established those errors. Correct foreground targeting, native container assertions and native dismiss-region targeting pass on both devices. No application share code was weakened.

**Historical intermittent sync-conflict:** original test expected cloud but received local. Twelve passing reruns alone did not explain it. A forced scheduled refresh reproduced the race: device B had already adopted A's revision before its supposed stale edit. Existing strengthened fixtures explicitly disconnect, edit stale state, reconnect and assert conflict before resolving. Twelve post-fix reruns and subsequent suites pass. Production conflict logic was not changed to make this test pass. Original logs remain under `output/iphone-smoke-test/` and the overnight report's conflict section.

Non-blocking warnings remain in upstream Capacitor/RevenueCat Swift optional-to-Any/unused-variable code and the existing Node module-type warning. No dependency update was made for these warnings.

## 3. WHAT STILL FAILS

1. **Distribution readiness:** local development signing works, but App Store signing export does not. App and widget both need valid distribution provisioning under the existing team.
2. **Legal shipping guard:** forty unresolved privacy/terms markers. Owner/professional review is required; automated checks cannot accept agreements or establish legal compliance.
3. **Durable charged-result recovery — DEFERRED:** a valid provider response can commit the reservation before client normalization/compositing/persistence fails. There is no complete durable server-result redelivery/refund protocol. Existing provider-failure reservation release passes; that does not refund a delivered-but-client-rejected image. No manual ledger changes or client-reported automatic refund.
4. **Subscription metadata:** both products report `MISSING_METADATA`. Provider-native reads expose missing review information/privacy-policy URL; the exact remaining App Store Connect checklist needs owner review. No trial offer is configured. Correct annual/monthly mapping is not proof of a successful sandbox purchase.

Historical malformed/reframed raw outputs and failed physical delivery are not declared universally fixed by three later successes. The geometry/protection guards remain enabled. Cosmetic acceptability cannot be established from checksums or unchanged protected pixels.

## 4. WHAT WAS NOT TESTED / BLOCKED

- No new paid requests in this overnight continuation. The specifically authorised comparison is already used; this brief did not replenish it. Four remaining QA credits are not permission to spend them.
- Fresh final-candidate physical iPhone generation/save/reopen, all four treatments' device cosmetic acceptance, real Apple sign-in/link/cancel, real email delivery, sandbox purchase/restore and real RevenueCat delivery: **NOT TESTED**.
- Permission denial/limited library, upgrade behaviour beyond preserving the existing installation, long-running background interruption, actual staging cross-account reads/deletion in this final pass: **NOT TESTED live**. Existing automated coverage is listed separately below.
- One-iPhone/one-iPad/web limits are not a proven device-enforcement policy. No new fingerprinting system was built.
- Google paid-tier/retention/DPA settings, legal transfer evidence, SMTP branding/delivery, Apple agreements/export-compliance answer and version/build uniqueness in App Store Connect: **OWNER REVIEW REQUIRED**. No agreements were accepted.
- Supabase security advisor reports disabled leaked-password protection; owner configuration follow-up. The six no-policy RLS information items are deny-by-default backend tables, not permission to open public policies. No schema/auth configuration was changed.

## 5. WHAT NEEDS HUMAN VISUAL REVIEW

Private review pack: `/Users/vik/Documents/New project/smile/output/gemini-test-folder-2026-10-03/visual-review.html`.

Review original, retained raw output, normalized/final output and mouth comparisons. First two cases include retained Sunburst comparisons on the same original; Sunburst is inactive. Assess expression, lips, mouth opening/width, gingiva, treated/untreated regions, tooth character/proportions, crop, alignment, grey/blank areas and artefacts. **Gingival preservation is not guaranteed.** Pixel protection is distinct from correct anatomical mask boundaries and desirable cosmetic appearance.

Final synthetic UI screenshots are under `iphone-screenshots-candidate/`, `ipad-screenshots-candidate/`, `iphone-export-screenshots-candidate/` and `ipad-export-screenshots-candidate/` in the private evidence folder. Their manifests identify comparison, treatment scope, landscape and native sharing. No identifiable image was uploaded to a design service.

## 6. EXACT NEXT ACTION FOR THE OWNER

**First, test the installed normal-mode Release on the iPhone using approved QA content.** The build is already installed; do not use Demo Mode as live evidence. Stop at the first failure, preserve the case/result and collect private diagnostics. Do not repeatedly tap Generate to work around an error.

### Short physical acceptance checklist

1. Launch, email login, logout/login; Apple sign-in and cancel. Confirm expected account identity.
2. New case → photo → analysis → Veneers/Composite, six upper teeth; generation available without Tooth Map waiting.
3. One owner-authorised Generate → real concept. Inspect framing, lips/expression/opening, gingiva, proportions and untreated teeth. Check allowance once before/after.
4. Slide/Overlay/zoom/rotation; divider stays within image. Open/hide analysis deliberately; mouth remains unobscured.
5. Save → force-close → reopen. Same original, concept, settings and preferred version; reopen locally while offline.
6. Export Smile Preview and Consultation Report; inspect both PDF pages; cancel and reopen share without lost result.
7. Open same saved case on second signed-in device; download usable images, not just a Synced label. Account switch must not expose the previous account.
8. With separately owner-authorised calls, visually check Whitening, Porcelain, standalone Both Alignment, bonding/veneers + Include alignment, and Both/Zirconia Full Arch with Preserve/Include gingiva. Close-ups must receive a reviewed Protect edit area before dispatch.
9. Test sandbox purchase and Restore Purchases on the intended account after Apple product/signing metadata is resolved. Confirm server entitlement and a single grant; do not use a personal real-money purchase.

On failure collect only time/build, request ID, treatment/path/count, source/prepared/raw/final dimensions, HTTP/provider result, last processing stage, network state, duration and allowance status. No photo, patient name/notes, token, signed URL or full app container in general logs. A missing request ID may mean preflight stopped before dispatch. Do not promise a returned credit without a server-confirmed release/refund.

### Xcode install / subsequent owner-led upload

1. Open `ios/App/App.xcodeproj`; select **App** scheme. App and widget target → Signing & Capabilities → Automatically manage signing; existing team **7TPF7LT884**. Select connected unlocked iPhone. Edit Scheme → Run → **Release** → Product → Run. Trust/developer-mode prompts only if iOS requests them.
2. Before distribution, resolve `docs/PROFESSIONAL_REVIEW_REQUIRED.md` and the forty legal markers, then run `npm run ios:release`. This command must pass normally; do not bypass its guard.
3. In Xcode Accounts/Signing, establish the existing team's Apple Distribution certificate/private key and App Store profiles for app and widget. Do not revoke existing certificates. Check Apple agreements and app/product metadata personally.
4. Verify version1.0/build1 is unused in App Store Connect. If used, increment the build and rebuild/archive the accepted source; uniqueness was not verified remotely in this pass.
5. After owner acceptance, select Any iOS Device, Product → Archive. Organizer → Validate/Distribute App → App Store Connect → **TestFlight Internal Only** where available. Owner performs upload; it was not performed here.
6. Wait for processing in App Store Connect, resolve export-compliance/metadata requirements truthfully, then TestFlight → Internal Testing → chosen internal group → add the processed build. Do not invite external testers from this candidate.

Installed Xcode27.0/iOS27 SDK meets Apple's currently published Xcode26/iOS26 minimum; this is not an App Store validation receipt. [Apple upload requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a), [upload processing](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/), [Internal Only workflow](https://developer.apple.com/tutorials/develop-in-swift/test-your-beta-app), [TestFlight groups](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## Final runtime configuration

| Item | Verified candidate |
| --- | --- |
| Staging Worker | `https://smile-by-dr-vik-staging.drvik.workers.dev` |
| Deployed version / tag | `81b45bde-c3de-4359-b4d3-14018438b136` / `fef9a17`, 100% |
| Supabase | `smilecompose-staging`, `wukcqlpuzkzwxmdkotfg`, eu-west-2; private patient-cases/case-library/profile-avatars buckets |
| Image provider/model | Gemini / `gemini-3.1-flash-image` |
| Provider mask guidance | OFF; local segmentation, protection/compositing and geometry validation remain enabled |
| Automatic image retry / provider fallback | ZERO / none |
| Sunburst | Retained inactive; never selected by beta path |
| Treatment flags | Whitening/Veneers ON; Alignment1; FullArch1; SingleTooth0; normal Tooth Map/Precision hidden |
| Scope | Alignment Both. Full Arch Both/Zirconia, Preserve or Include prosthetic gingiva. Zirconia alone does not permit gum redesign. |
| iOS / extension | `uk.co.drvik.smilecompose` / `.widget` |
| Version/build | 1.0 / 1; App Store Connect uniqueness unverified |
| Signing | Existing team7TPF7LT884, development profile; Apple sign-in and Complete Data Protection entitlements present |
| Production | No writes. Before/after deployment43a6731b-c891-4859-8ec0-83832b72e3a3 and versiona513bd76-a5b1-44cc-a7fd-22a5df0ab365 unchanged |

**Scope deviation retained explicitly:** the generic attached brief mentions old Upper/Lower/Both and Provisional controls. The latest implemented owner simplification is Both-only Zirconia; this pass does not silently re-expand those controls. Internal legacy functionality remains, without a V1 claim that all old options are exposed/tested.

## Feature-by-feature evidence

| Feature | Implementation / automated | Simulator or local replay | Recent authorised live Gemini | Cosmetic / physical |
| --- | --- | --- | --- | --- |
| Whitening | **PASS** request/prompt/shape-preservation contracts | Controls covered; treatment-specific new output **NOT TESTED** | **NOT TESTED** in this batch | **HUMAN REVIEW REQUIRED** |
| Veneers Composite | **PASS**, including alignment add-on settings/retention | **PASS** saved synthetic raw replay through processing/display/report | **NOT TESTED** in this batch | Final device flow **NOT TESTED** |
| Veneers Porcelain | **PASS** settings/contracts | **PASS** real output save/read/independent repository | **PASS technical delivery**, three authorised photographs | **HUMAN REVIEW REQUIRED**, not a reliability rate |
| Standalone Alignment | **PASS** Both, optional/ignored morphology, request/prompt/report contracts | **PASS controls**; fresh treatment output **NOT TESTED** here | Earlier authorised run retained in history; not final-candidate proof | **HUMAN REVIEW REQUIRED**; no biomechanics claim |
| Full Arch | **PASS** Both/Zirconia and explicit gingiva permissions | **PASS controls**; fresh treatment output **NOT TESTED** here | Earlier successes/failures retained in history; not final proof | **HUMAN REVIEW REQUIRED** |
| Single Tooth / Tooth Map / Precision | **PASS hidden/server gate regressions** | No normal patient controls | No call | Remain hidden; no precision guarantee |
| Close-up/retracted | **PASS** preflight + reviewed edit-area branch | Six-file local decoding/orientation/preparation evidence retained | IMG_3296 stopped before paid dispatch | Paint-boundary accuracy/clinical suitability **HUMAN REVIEW REQUIRED** |
| Save/drafts/preferred/reopen | **PASS** durable repository/state tests; prior recent-draft fix retained | **PASS** real decoded recovery and simulator relaunch | Three cases/results saved/reopened independently | Final owner offline/upgrade **NOT TESTED** |
| Cloud-only/offline/retry/conflict | **PASS** repository/PGlite/IndexedDB cases and unchanged strong assertions | **PASS** independent repository results; fixtures never falsely report Synced | Read-only three cases/twelve current cloud objects | Physical cross-device **NOT TESTED** |
| Account isolation/deletion/tombstone | **PASS** normal-user permission/mutation tests | Mock/disposable evidence, not owner-data deletion | Final unauthenticated401; no new destructive live test | Apple/email/switch acceptance **NOT TESTED** |
| References / case-reference library | **PASS** authenticated ownership, consent, reference material matching and retrieval tests | New full native reference journey **NOT TESTED** | No new generation | No automatic clinical matching guarantee |
| Share/report | **PASS** saved-result settings and content tests | **PASS** native iPhone/iPad JPEG/PDF handoff and actual PDF inspection | Uses saved validated result; no fresh call | Physical recipient delivery **NOT TESTED** |

## Live provider accounting — no new allowance

The earlier specifically authorised six-upper Porcelain comparison was already completed as part of the six-photo, stop-on-first-failure batch. All three used Rounded/Natural/Balanced, intensity35, Preserve arc, target Whiten, selected13/12/11/21/22/23. Authenticated disposable account only.

| Approved file | Request ID | Source → prepared → raw → final | Result / provider duration / allowance |
| --- | --- | --- | --- |
| IMG_3291.jpg | fa41311e-0889-4832-b673-6a0f812664a6 | 1320×1741 →1320×1760 →896×1200 JPEG →1320×1741 | HTTP200/STOP, one image; 9,176 ms;7→6 |
| IMG_3241.jpg | 69f61253-81b9-4cfe-9cd5-a6edd00b631e | 1320×1737 →1320×1760 →896×1200 JPEG →1320×1737 | HTTP200/STOP, one image;9,269 ms;6→5 |
| IMG_3293.jpg | 91e2264d-69e1-4d9b-b191-f69faac6d46f | 1269×2048 →1365×2048 →848×1264 JPEG →1269×2048 | HTTP200/STOP, one image;8,744 ms;5→4 |
| IMG_3296.jpg | None — preflight | Mouth-only1320×622, no source face landmarks | Stopped before provider/reservation;ZERO charge. Batch stopped. |
| IMG_3297 / HEIC file | None | — | **NOT TESTED live**; not quietly counted as passing |

Recent batch: **three paid invocations, zero retries**. Final overnight continuation: **zero paid invocations**. Earlier separate Gemini/Sunburst/physical attempts and spent authorisations remain in the historical overnight report; no invented lifetime total. The three new reservations are server-confirmed committed. Before expiry, QA used26/included30/remaining4. The final 4 October 08:24 UTC read reports Pro=false and active balance0 because the one-hour override expired, with all twelve owned assets still downloadable. No new generation occurred; this is expiry, not four additional charges. Only the previously authorised exact QA account received its one-hour extension. No owner/commercial allowance change.

Provider adapter and client use one direct HTTP invocation without an automatic generation retry. Backend request claim/reservation remains atomic/idempotent. Outbox retries only saved metadata/media, never generation. Explicitly confirmed three-concept batches intentionally cost three distinct requests; they are not automatic retries. Cancel/timeout is not evidence that the provider performed no billable work.

## Subscription / security evidence and limits

RevenueCat App Store app/bundle, `pro` entitlement, current `default` offering, `$rc_monthly`/`$rc_annual` packages and SKU mappings verified read-only. App Store/subscription API credential validations return VALID. Monthly£29.99/50 and annual£299.99/600 agree with code and store descriptions. Both current store states are `MISSING_METADATA`, trial_offer null; no three-day promise remains in static UI. No remote product, price, allowance, webhook or credential change.

Sandbox webhook is configured for this App Store app and staging `/api/webhooks/revenuecat`. HTTP401 without authorization; duplicate-event, unknown-user, plan mapping and sandbox grant-isolation tests pass. **Real Apple sandbox purchase/restore/delivery: DEVICE TEST REQUIRED.**

Built bundle checks find correct staging/SDK config, no server secrets, dev URL or simulator unlock route. Apple sign-in, Data Protection, Keychain/app-group and permissions/privacy manifests are checked; In-App Purchase behavior still needs StoreKit/device evidence. Photos picker and camera purpose strings are present. Existing consent persistence precedes transmission. Storage and transport protections are not end-to-end encryption; server processes photographs. Export-compliance declaration is retained, not accepted as a legal determination.

Codex Security bounded immutable assessment of admission-lock patch9421c05→7ed728c: moderate impact/low likelihood, existing controls retained, human review recommended. Artifacts under `/Users/vik/.codex/state/plugins/codex-security/scans/smile/artifacts-f92995f035793e762d5ac3f271d0f1691c568cb0738de18fdbdccdcc130e4fa3/artifacts/generation-action-lock-risk.json` and `.md`. This is a patch assessment, not a complete penetration test. No merge was performed.

## Archive receipt / rollback

Current archive: `/Users/vik/Documents/New project/smile/output/testflight-final-2026-10-03/SmileCompose-fef9a17.xcarchive`.

`archive-receipt-candidate.json` records exact source, staging version, native file matches and SHA256 manifest. Manifest SHA256: `337f9efc5bf87a462ba05f12fee2cf0eaa4db286f6c95bd49d72e40237c76f72` (200 archived files). The manifest digest covers sorted archived-file digests; it is **not** a nonexistent zip checksum. Deep/strict local code-sign verification passes. Development profile has get-task-allow=true; successful archive compilation does not make it App Store distributable. Export failure is preserved, not retried through a guard bypass.

Rollback points: `2ba93ec`→preceding checkpoint for one-call change; `9421c05`→`2ba93ec` for alignment/close-up UX; `7ed728c`→`9421c05` for admission lock; `3fbe614`→`7ed728c` for offer wording; `fef9a17`→`3fbe614` for native-test-only change. Use selective reverts after preserving local work. No hard reset, rollback, push or merge was performed.

## Draft internal TestFlight notes — owner approval required

**Beta description:** SmileCompose creates dental appearance concepts from a clinician-selected photograph for consultation discussion. This owner-led staging build includes Whitening, Composite/Porcelain Veneers, illustrative Both Alignment and Both/Zirconia Full Arch. Concepts are not clinical treatment plans or guaranteed results.

**What to test:** approved-content generation once, image integrity, treatment/settings retention, save/force-close/reopen, account isolation, download/offline recovery, comparison and native preview/report sharing. Separately test Apple/email login and Apple sandbox purchase/restore.

**Known limitations:** cosmetic quality requires clinician review; close-ups require a reviewed edit area; unsupported precision controls stay hidden; device/purchase acceptance outstanding; charged-result recovery incomplete. Never use this beta for treatment feasibility, occlusion, implant planning or manufacture.

## Release decision

**What can safely enter a small internal TestFlight test?** No upload yet. After legal/signing gates and representative physical acceptance, this staging-only candidate can be considered for a small owner-led approved-content test, with the limitations above. Unverified aesthetics must remain explicitly under review.

**What should remain disabled or limited?** Sunburst/provider fallback, Single Tooth, Tooth Map and Precision remain unavailable in normal V1. Full Arch remains Both/Zirconia; close-up editing requires reviewed boundaries. No broad precision, gingival-preservation or cosmetic-reliability claim.

**What must be resolved before external dentists or paying users?** Durable charged-result delivery/recovery; all-treatment physical/cosmetic acceptance; confirmed Apple/email access and sandbox subscription delivery; final legal/privacy/provider-retention evidence and App Store metadata/signing. **HOLD** remains the honest outcome until these gates are resolved.
