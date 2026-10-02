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
