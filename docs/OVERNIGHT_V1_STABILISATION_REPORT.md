# SmileCompose V1 — focused stabilisation handover

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
