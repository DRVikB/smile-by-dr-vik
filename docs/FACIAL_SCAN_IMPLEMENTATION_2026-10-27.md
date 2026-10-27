# Front and rear facial scan improvements

Started 26 October; verification checkpoint 27 October 2026.

## Status

Implementation and signed Xcode build complete. **Physical installation and scan-quality acceptance are pending.** The first device-target build could not prepare the iPhone. The subsequent generic iOS build signed successfully. In-place installation then failed: iPhone connection invalidated/peer unreachable; iPad device services unavailable. No successful install, launch, new physical scan, reopen or lab acceptance is claimed.

The owner was asked only to reconnect/unlock the physical iPhone; technical preparation is complete. This does not change the currently distributed TestFlight binary. No upload, backend deployment, paid image generation, SDK purchase or third-party face upload occurred.

## Implemented

### Both capture options

- Supported devices offer Front / Face ID and Rear / camera + LiDAR within the existing scanner audience. Rear is no longer suppressed by the unrelated Labs flag. The overall admin-preview audience is unchanged.
- Front capability checks require actual TrueDepth hardware, not face-tracking support alone. A scan/countdown waits for measured depth.
- Front and rear retain different instructions: patient head turns in front mode; patient stays still while clinician moves the camera in rear mode.
- Switching camera cancels countdown/old capture callbacks and blocks Start until the new session is ready. Sensor-specific masks are cleared when switching to rear.

### Measured tracking performance

- Live tracking target refresh no longer traverses the full dense volume. A bounded spatial index selects actual current fused-surface zero crossings and normals.
- Full final meshing, the existing voxel choices, ICP/movement/expression rejection thresholds and user pre-existing changes remain intact.
- Synthetic Mac replay: dense extraction 6.084 ms versus bounded refresh 2.294 ms in the final root run, about 62% lower. The agent's separate run measured approximately 64% lower; integration overhead was approximately +0.316 ms in its separate-run comparison. These are component benchmarks, **not an iPhone frame-rate improvement or a clinical accuracy result**.

### Accepted photographs and capture lifetime

- Front textures now use the exact accepted depth frame and its final corrected pose/intrinsics. They are no longer selected before tracking acceptance.
- Rear photographs use accepted RGB, depth and pose from one frame. Removed the later still-frame/old-depth substitution. This intentionally uses accepted camera-frame pixels rather than claiming that a later high-resolution still was independently validated.
- Camera buffers are copied before asynchronous encoding/writing. Every photo-write path completes once, including failure, so acquisition does not remain permanently busy.
- A capture-run identity and photo ticket prevent a late callback from unlocking/appending into a restarted capture. Repeated/out-of-order front depth samples are rejected with the existing 50 ms synchronisation bound preserved.
- Finish drains the last photograph. Close invalidates pending callbacks; a late mesh rebuild cannot revive the closing scanner.
- Rear automatic completion waits for the minimum photographic input when reconstruction is supported. Unsupported/unavailable photographic capture can still complete as explicitly coarse geometry.

### Output, relaunch and lab registration

- Interrupted in-memory rear jobs become `interrupted` on relaunch rather than spinning forever. Same-process active jobs remain pending. Failed/completed reconstruction status remains explicit.
- Detailed reconstruction writes a separate mesh and keeps the original coarse geometry.
- Intraoral export uses the actual selected expression. Independent or legacy expressions without shared-frame evidence no longer inherit an unrelated transform.
- Alignment is blocked while reconstruction is pending. If a legacy pending result already had an alignment, successful geometry replacement retires it and requires re-registration. Old files/metadata remain private history and are excluded from active sharing. New registrations use unique derivative filenames.
- Lab notes/viewer identify coarse/failed/interrupted results and fitting residuals honestly. Removed numerical accuracy claims for unrelated published scanner implementations. Actual measurement and cosmetic approval remain with clinician/lab.

## Verification

| Check | Result |
| --- | --- |
| Existing full web regression suite plus metadata regressions | 906 passed; 0 failed/skipped |
| Compiled production Swift capture policy | 15 assertions passed |
| Production tracking/fusion/HeadTracker synthetic replay | 71 assertions passed |
| Production photo storage, relaunch and export lifecycle | 25 assertions passed |
| TypeScript / ESLint / diff whitespace | Passed |
| Production web + native assets / native bundle verification | Passed |
| Cloudflare packaging / production artifact checks | Passed; no deployment |
| Final signed iOS Release through Xcode | Passed |
| Physical installation | Failed connectivity; not installed |
| Real front/rear scans, accepted texture/geometry, export/reopen | Not tested |

Native tests execute extracted current production Swift, not a duplicate reconstruction implementation. Sensor/scene UI dependencies are stubbed only where Mac execution cannot provide them. Synthetic depth, pixels and temporary files test the production algorithms/codecs/export functions; they cannot simulate actual subject motion, sensor calibration, illumination, glasses, facial hair, thermal load or mouth anatomy. Baseline failures and repair evidence are retained under ignored output paths.

Commands:

```sh
node --import tsx --test tests/*.test.ts
npm run test:face-scans
npm run lint
npm run typecheck
npm run build:native
```

The final build receipt and source/binary hashes are in `output/facial-scan-improvements-2026-10-26/build-receipt.json`. Native build/install logs are beside it. Reproducible synthetic performance evidence is also under `output/facial-scan-tracking-2026-10-26/`.

## Preservation and rollback

Original user changes and case data are preserved. HEAD remains `6627c8a`; no commit/reset/push was performed. The initial dirty Swift file and diff were saved in ignored `output/facial-scan-improvements-2026-10-26/CaseMediaPlugin.before.swift` and `pre-existing-working.diff`. Any rollback must restore only this task's changes against that checkpoint, not reset to HEAD (which would discard the owner's earlier modifications). No build-number bump or TestFlight replacement was performed.

## Remaining physical acceptance

Reconnect/unlock the iPhone; install the prepared signed app over the existing bundle ID. Capture one Front and one Rear scan of a consenting test subject in diffuse light. Inspect textured and plain geometry views for double surfaces, facial distortion, sharp lip/teeth boundaries and missing regions. Save, terminate/reopen and verify both records and any reconstructed detail status. Open the actual OBJ/MTL/texture and PLY in the lab CAD software, verify units and intraoral alignment, including a known independent expression that must stay unregistered. Repeat on iPad before claiming iPad sensor acceptance.

If either capture fails, preserve the exact existing native output/diagnostics and investigate that boundary; a passing synthetic benchmark must not be presented as a physical scan-quality pass.
