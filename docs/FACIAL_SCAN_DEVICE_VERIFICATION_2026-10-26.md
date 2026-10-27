# Facial scan device verification — 26 October 2026

## Read-only availability checkpoint

Xcode `devicectl` sees two paired physical devices on iOS 27.0.1:

- iPhone 17 Pro Max: SmileCompose 1.0, build 19 installed; developer mode enabled. Initially locked; the subsequent read-only check confirms it is now unlocked (`passcodeRequired=false`).
- iPad Pro 11-inch M5: developer mode enabled. Developer-image preparation and app inventory are blocked by its locked state.

Dedicated **SmileCompose QA iPhone** and **SmileCompose QA iPad** simulators exist on iOS 27.0; both are shut down. These can verify UI, unavailable-sensor behaviour, and deterministic algorithm fixtures. Simulator success cannot validate TrueDepth or LiDAR acquisition, tracking, texture quality or physical scale.

No device app was launched, stopped, installed, deleted or modified for this checkpoint. No case files or patient media were read. Device Hub controls are not exposed in this tool session; Xcode device tools are available.

## Executable policy regression

Run `node scripts/verify-face-scan-capture.mjs` on macOS with Xcode installed. The runner extracts the marked **production** `FaceScanCapturePolicy` definition from `CaseMediaPlugin.swift`, compiles it with the fixture tests and executes the resulting binary. The test does not substitute a second implementation.

The fixtures exercise timestamp synchronisation, duplicate and out-of-order depth delivery, nonfinite/zero/negative values, single photo-job ownership, scan-run reset and late completion callbacks. They do not prove correct sensor calibration, sharp images or anatomical accuracy.

Result: all **15 executable production-policy checks pass**. The first run correctly failed before the production helper existed; the passing run compiled the inserted production definition. Runner ESLint and whitespace checks pass. This policy result is distinct from physical acquisition acceptance.

## Physical front and rear acceptance

Use a consenting test subject or an approved static face reference. Record the device model, OS, exact candidate build, room lighting, sensor route and expression. Keep patient records separate; do not upload a scan to a new external service.

For each front and rear route:

1. Open an existing test case without deleting its media. Confirm sensor availability and use the displayed route-specific guidance.
2. Capture a neutral face and a wide smile as separate scans. Keep the expression unchanged during each sweep. For rear capture, the subject stays still while the operator moves the device.
3. Observe preview responsiveness, accepted depth/photograph progress, tracking-loss feedback and time to completion. Confirm progress stops during poor tracking and resumes after recovery.
4. Interrupt a scan, restart it and change expression/step. Check that a late frame or photo from the old run cannot appear in the new scan. Cancel once without disturbing previously saved scans.
5. Inspect each finished scan with texture off and on: nose/lip silhouette, holes, double surfaces, photographic sharpness and eye/nose/lip edge registration. Verify that coarse geometry and completed photographic reconstruction are clearly distinguished.
6. Save, close and reopen the exact scan. Compare the same expression, mesh and texture. Do not accept an unchanged face template, screenshot or texture alone as a measured scan.
7. Export OBJ + MTL + JPG and coloured PLY. Check material references, units, axes, landmarks and the separate intraoral registration transform. Open the actual package in the intended lab CAD application. A successful share sheet is insufficient.
8. Repeat after warming the device. Compare scan timing and geometry against the same approved reference. Any numerical fit to the app's own noisy surface is an internal diagnostic, not independent lab accuracy.

Human lab review remains required for the intended use. Software tests and successful compilation cannot establish lab-ready tooth or perioral detail.

## Existing QA restrictions

The existing `qa:ios-simulator` and physical-generation UI suites cover photo/design/generation cases, use shared legacy fixtures and reuse the application's bundle identifier. They are not facial-scan acquisition tests and must not be run as proof that either scan route works. The native facial scanner's existing controls include **Start scan**, **Finish**, **Close** and **Check scale**; actual depth acquisition requires physical hardware.
# 27 October follow-up

The earlier unlocked observation is historical. Final signed Xcode Release compilation passed. In-place installation attempts failed: iPhone connection invalidated/peer unreachable; iPad device services unavailable. No updated physical scan, sensor-quality, save/reopen or lab acceptance has run. Reconnection/unlock was requested; no app data was deleted.

