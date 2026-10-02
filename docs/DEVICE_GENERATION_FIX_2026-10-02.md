# Physical device and generation follow-up

## Device installation

Signed Debug build passed after Xcode refreshed provisioning with `-allowProvisioningUpdates -allowProvisioningDeviceRegistration`. The embedded profile includes Sign in with Apple, Complete Data Protection and both physical device IDs. The refreshed app was installed on the physical iPhone and iPad without uninstalling their existing app. iPhone launch passed; the iPad was locked during automatic launch and needs the owner to open it.

The bundle includes the versioned terms/privacy fix, staging backend and RevenueCat Apple public SDK key. Actual acceptance remains an explicit owner action, not inferred by this check. Capacitor bridge logging is disabled because debug bridge responses can contain Keychain session values.

## Grey mouth in generated preview

The Gemini adapter previously selected the first inline image regardless of its `thought` flag. Gemini can return intermediate reasoning images before the completed image; these must not be presented as results. The adapter now excludes thought parts and non-image MIME types and selects the last completed image. A response containing only thoughts is rejected and uses the existing server failure path to release the reserved allowance; it does not trigger an automatic paid retry.

Regression tests cover drafts before and after the final image, thought-only output, and non-image output. This fixes a concrete response-selection defect consistent with the reported grey mouth, but the exact upstream response for that patient was not retained and has not been reconstructed. Existing saved results are unchanged; the clinician must generate a fresh concept. No patient photograph was sent to a provider by this repair.

Source: [Google image-generation documentation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), which instructs clients to skip thought parts.

## Deployment and limits

All 534 tests passed; lint, TypeScript, production web build and focused Gemini tests passed. Staging Worker version `6d7d1e12-49dc-4fd3-8d55-e69075f9593b` contains the parser fix. Native packaging and bundle verification passed; the refreshed signed app was installed on both devices. Hosted smoke checks passed: public legal bundle 200/no-store, unauthenticated account status 401/no-store, invalid generation request 400.

This remains a staging engineering build. Legal review placeholders still correctly block release packaging. Production, Apple distribution archives and TestFlight uploads were not changed. Fresh live generation and physical terms/privacy acceptance require owner verification.

## Quick generation restored and pixel-filter rollback

At the owner's request, mandatory tooth-map review and disabled generation buttons have been removed. Standard presets and single-tooth selection alone no longer start tooth detection. Custom picking, explicit map review and explicitly shown single-tooth guides can request mapping; generation never waits for that mapping or SlimSAM refinement. A valid reviewed map applies precise protection only to single-tooth generation. Ordinary multi-tooth concepts use the original mouth/face boundary lock, avoiding stale multi-tooth outlines clipping a preset result. Full-face protection is still checked before a paid request. AI processing, per-patient consent and allowance checks remain.

A source-colour gum filter was briefly installed during this follow-up. The owner then reported jagged patches across discoloured teeth. Colour alone cannot reliably separate pigmented gums from tooth stains, shadows or warm restorations. The filter was removed from both quick and reviewed-map compositing. The original inner-lip boundary protection remains; gum-preservation instructions remain, but automatic concepts do not guarantee exact gum segmentation. Reviewed single-tooth boundaries must exclude gums. New tests keep warm/brown tooth pixels editable inside an approved boundary while outside pixels stay original. The mouth-lock fingerprint was bumped so earlier filtered results are not reused. Saved results remain unchanged and need a fresh generation.

The prompt retains conservative incisal-edge permissions, original lip opening and lower-tooth exposure. It adds context-based proportions and distinct canine/lateral anatomy without imposing a universal ideal tooth length. Alignment no longer has a gum-moving exception. These instructions require clinician review; they are not proof of clinical feasibility or freedom from AI artifacts.

## Uploaded-image failures: still under investigation

Read-only staging allowance records showed both successful generations and repeated failed requests. Failures returned `image_not_processed` before the adapter update and `provider_no_image` afterwards. The latest safe diagnostic observed one candidate with no finished image; the original upstream payload was not retained. This occurs before client compositing, so removing the pixel filter does not itself resolve it.

Empty output is now separated from a blocked response rather than blaming the photograph. Failed requests release the allowance and never trigger an automatic paid retry. The adapter excludes thought images and incomplete candidates. Diagnostic fields are limited to documented finish enums, structural counts, output resolution and aspect ratio; no patient image, raw provider text or clinical notes are logged. Live validation of the failing upload remains pending.

All 540 tests, lint, TypeScript and production build passed after the filter removal. Staging Worker version `eb1f3d26-e20d-477e-8047-9d08b2e7fda0` contains this update. Native bundle verification and signed Debug build passed; the corrected app was installed on the physical iPhone without uninstalling. Hosted shell and public consent bundle returned 200; unauthenticated account status returned 401. The owner requested finishing with the iPhone; the iPad has not received the final filter removal. Production, TestFlight and legal release gates remain unchanged. No live paid generation was initiated by this repair.

## Simplified image-edit request and live test-folder validation

The follow-up trace confirmed `NO_IMAGE` with no output data; after enabling the documented text+image response format, one attempt returned a completed text-only decline. Both happen before device compositing. This did not establish that the uploaded photograph was unsuitable. No raw explanation was logged.

At the owner's explicit request, six local test-folder images (five JPG and one HEIC converted to JPG) were exercised through actual Gemini calls. All six returned completed images with the detailed prompt. A simple photographic request also succeeded. The comparison was repeated with staging credentials in a temporary authenticated Wrangler remote-development harness: both detailed and simple requests succeeded on the previously reported male-photo fixture. The harness did not deploy an endpoint, use patient cloud storage or alter account allowances. These are paid provider tests directly authorised by the owner, separate from the app's account ledger.

Gemini now uses a shorter photographic-edit prompt: essential face/lip/gum/exposure and edge protections, scoped design goals, distinct material optics, individual tooth permissions, supplied clinical restrictions, explicit alignment and full-arch paths, and references when selected. Repeated global constraints are reduced; the request no longer asks for an impossible exact input pixel size alongside a configured 1K output. It keeps input aspect ratio, framing and scale, with existing padding reversal and mouth lock afterwards. Only a completed non-thought image becomes a result. Text remains categorical diagnostic data only; no provider-generated prose is shown as clinical advice.

The shorter prompt produced completed images for all six fixtures (five direct local-provider tests plus one staging-credential test), in about 8–11 seconds, with reported Gemini cost receipts around $0.0677 each. This validates the test inputs and provider request, not every possible saved design, reference combination or physical upload workflow. The exact app failure with the owner's additional settings/references still needs confirmation after the update. No patient identifiers or raw clinical notes were recorded in diagnostics.

The client reuse-rules version was bumped to avoid reusing concepts made under the previous prompt. The iPhone had already received the colour-filter removal; it became unavailable to Xcode during the subsequent cache-version bundle update. The hosted prompt update does not need a native reinstall for new provider requests. The final native cache-version build will be prepared for the next device connection.

Final verification: all 547 tests passed, as did lint, TypeScript, production build, native bundle verification and the signed generic-iOS Debug build. Staging Worker `abff313a-5bf9-4353-817e-113ee56351e1` is deployed. Hosted shell/consent checks returned 200; unauthenticated account status returned 401. The final cache-version native bundle is ready but has not been installed because the physical iPhone is unavailable. Confirmation from the actual iPhone upload workflow is pending.
