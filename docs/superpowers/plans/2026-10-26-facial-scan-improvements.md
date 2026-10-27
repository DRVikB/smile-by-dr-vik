# Front and Rear Facial Scan Improvements Implementation Plan

**Goal:** Improve both native capture paths without replacing measured anatomy, changing saved cases or claiming clinical acceptance from software tests.

**Architecture:** Retain ARKit/TrueDepth and rear RGB/LiDAR reconstruction. Make live tracking bounded, bind photographs to accepted frame poses, isolate asynchronous scan work by capture identity, and keep detailed/coarse output provenance explicit. No new commercial SDK dependency in this pass.

**Spec:** `docs/FACIAL_SCAN_RESEARCH_2026-10-26.md` and owner's instruction to implement improvements in both front/back paths.

**Constraints:** Preserve the existing dirty Swift changes and cases. No provider invocation, production deployment, TestFlight upload, new vendor upload or purchase. Physical quality remains unverified until actual scans and lab exports are inspected.

## Tasks

- [x] Preserve a private working-source checkpoint before edits.
- [x] Reproduce expensive full-volume live surface extraction using synthetic depth and the actual production functions; replace it with bounded measured-surface tracking and compare geometry/timing.
- [x] Add executable capture-policy tests: exact RGB/depth timing, accepted pose, single pending capture, stale completion after cancellation/restart/sensor switch.
- [x] Apply capture policy to both paths; front textures only from accepted frames, rear photographs retain their own frame/pose and never inherit unrelated old depth.
- [x] Repair concrete rear asynchronous failure paths and retain truthful detail/failure metadata. Keep both supported sensor options available to the existing feature audience.
- [x] Test synthetic geometry, capture lifecycle and export/reopen where possible; compile actual native app and run complete existing tests, typecheck, lint and build once stable.
- [ ] Use connected device tools for in-place verification where possible. Ask only for unavoidable physical action. Do not claim sensor quality from simulator/mock data.
- [x] Review changes against the preserved user checkpoint, record evidence/limitations and leave a concrete next physical acceptance action.

27 October: signed Xcode Release built successfully; in-place install attempted on both connected devices but failed because device connectivity/services were unavailable. Physical scan and lab acceptance remain pending, not passed. See `docs/FACIAL_SCAN_IMPLEMENTATION_2026-10-27.md`.

## Review focus

Cancelled capture callbacks cannot mutate a new scan; loss of depth does not stall indefinitely; encoding failure releases pending work; insufficient rear photographs stay identified as coarse output; apparent texture quality never substitutes for geometry/registration acceptance.
