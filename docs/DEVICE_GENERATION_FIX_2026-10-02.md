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
