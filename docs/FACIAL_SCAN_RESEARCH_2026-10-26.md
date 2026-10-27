# SmileCompose facial scanning: evidence and recommended direction

26 October 2026. Research and code inspection only; no scanner implementation, deployment, purchase, patient upload or device installation performed.

## Decision

Prioritise a **TrueDepth-first, textured facial surface**, registered to a separate intraoral scan when the lab needs tooth geometry. Evaluate a maintained native reconstruction SDK against the existing implementation before investing in another custom reconstruction iteration. Keep rear RGB photogrammetry as a secondary, separately validated route; rear LiDAR should provide coarse tracking/scale context rather than the promise of detailed dental geometry.

“Lab usable” needs two independent approvals: a convincing, undistorted facial surface/texture and an adequately verified relationship to the intraoral scan. A photorealistic preview, dense mesh or small internal fitting residual does not establish either by itself. This recommendation concerns facial context for lab communication/design; it does not establish suitability for manufacturing from phone-scanned teeth.

## Current baseline independently checked

- Branch `feature/consultation-companion`, HEAD `6627c8a`, iOS version 1.0/build 19. One existing dirty file: `ios/App/App/CaseMediaPlugin.swift` (144 insertions, 11 deletions at inspection). Preserved.
- The local build-19 archive exists. Its web entry SHA-256 matches `ios/App/App/public/index.html`. This is not proof that the archive is Apple's currently distributed binary or that its executable includes the dirty Swift work.
- A direct read of the GitHub branch tip returned `1fd2bd3`: local HEAD is 11 commits ahead of that branch. No push/fetch/reset performed.
- Current prompt version is `2026-10-16-missing-gap-v23`; mouth-lock version is `2026-10-18-lift-v15`. The October 4 CURRENT report and README contain historical material and cannot establish today's acceptance state.
- Local client configuration points at staging. The public staging cost endpoint reports `gemini-3.1-flash-image`; it does not expose enough information to prove exact deployed commit/schema equivalence. Both production-default and staging strings occur in archived JS; that alone cannot identify which every runtime call uses.
- Fresh checks: 904/904 tests, zero skipped; ESLint; TypeScript; production build; Cloudflare packaging; production artifact checks; unsigned iOS Release compilation all PASS. The tests used `node --import tsx --test tests/*.test.ts` because the sandbox blocked the tsx CLI's IPC pipe. Build checks were local, with no provider invocation. Native compilation used cached packages and a temporary DerivedData directory, without signing/install/upload.
- The legal generator still reports 40 unresolved owner/legal items. This observation is separate from scan engineering and is not a fresh assessment of your published TestFlight access or legal approvals.

## What comparable products actually document

| Product | Published approach | Implication |
| --- | --- | --- |
| Invisalign Outcome Simulator Pro | Wide-smile photograph captured in Practice App, plus upper/lower/bite scans from iTero; in-face simulation is distinct from the dental model view. | Useful capture/registration UX reference, but not evidence of a phone-generated detailed facial surface. |
| Fiscan | Front TrueDepth reconstruction on device; rear capture with still patient and moving helper; rear reconstruction on Mac or cloud; intraoral registration and CAD export. | Closest published example of separating the two acquisition methods. |
| Qlone Dental Pro | Dental facial scanning and compatibility with dental CAD. | Useful output benchmark; its vendor's quality claims do not reveal its proprietary reconstruction or independently validate our app. |
| Structure SDK | TrueDepth support, a Face scanning preset, texture/export facilities and recent maintenance. | Strong candidate for a bounded SDK evaluation, subject to licence, device, offline-operation and output checks. |
| RAYFace | Dedicated dental hardware with a vendor-stated 0.5-second acquisition and dental-data alignment. | A useful quality reference, but phone sweeps do not have its simultaneous capture hardware. |

Sources: [Align quick-start guide](https://assets.ctfassets.net/o8m7afojxkhl/14ypDwiwTyT4r7OuxO5r4V/826cc01590f0175af6c1ac561127df23/-V1-_0719EN-SEA_Invisalign__Outcome_Simulator_Pro_with_Multi-Treatment_Simulations.pdf), [Fiscan](https://fiscan.fireluma.com/), [Qlone Dental Pro](https://www.qlone.pro/dental), [Structure release notes](https://support.structure.io/article/417-structure-sdk-ios-release-notes), [RAYFace manufacturer](https://www.rayamerica.com/rayface).

The open-source [StandardCyborgCocoa](https://github.com/StandardCyborg/StandardCyborgCocoa) provides TrueDepth fusion and recorded-data tooling under MIT. Its original company no longer exists; it is a reference/fallback to evaluate, not a supported commercial dependency by assumption.

## Findings in the actual scanner

The implementation already has raw TrueDepth input, custom distance-field fusion, head registration, photographic texturing, rear Object Capture refinement, PLY/OBJ exports and intraoral point alignment. Replacing this with Apple's generic ARFaceGeometry would be a regression: Apple describes that as a coarse fitted face mesh, not a detailed measured scan. [Apple geometry documentation](https://developer.apple.com/documentation/arkit/arfaceanchor/geometry)

### 1. Live reconstruction has an identifiable expensive stage

`HeadTracker.refresh` calls `volume.surface()` before reducing the result to 25,000 points. `surface()` walks the dense voxel volume. The latest 1 mm frontal bounds allocate roughly 8.4 million cells; reducing the returned point list does not remove the preceding full-volume work. Segmentation, registration and integration share the serial fusion path. `fusing` excludes additional depth work until it finishes.

This establishes a potentially expensive scheduling boundary, **not a measured device bottleneck**. Capture frame times, dropped/accepted depth rates, tracking cost, extraction time, memory and thermal state before choosing an optimisation. A light tracking representation should not require repeatedly extracting the complete export surface. Final meshing/texturing should be scheduled separately from the responsive capture preview.

Relevant code: `CaseMediaPlugin.swift` around lines 1384, 2306, 2496 and 4360.

### 2. Texture frames and geometry poses need a shared accepted identity

`frontFrame` requests `keepFrontView` before the current frame completes `tracker.process`. The photographic sample therefore starts with the prior correction rather than necessarily the finally accepted correction for that frame. Later texture pose refinement exists, so this is a risk to test, not proof of the observed smear.

Retain a bounded approved capture with exact RGB/depth timestamps, calibrations and accepted poses. Verify projected nose/lip/teeth edges on those bytes. Apple's documentation explicitly notes that front depth and colour can have different capture timestamps. The current 50 ms guard must be evaluated against actual device motion rather than treated as proof of synchronisation. [Apple timestamp documentation](https://developer.apple.com/documentation/arkit/arframe/captureddepthdatatimestamp)

Relevant code: `CaseMediaPlugin.swift` around lines 4511–4640. Also verify mirrored/non-mirrored coordinates, depth-to-RGB calibration and rotation on physical devices; no transform defect is established yet.

### 3. Completion currently includes camera-angle coverage

The ring/coverage tracks accepted viewing directions and permits a settled completion route. Seeing enough directions does not prove sharp, complete geometry around the lips, nose or chin. Keep guidance simple, but make acceptance depend on reconstructed surface support, tracking quality and texture sharpness in the required facial regions. Do not force the patient through longer sweeps merely to fill a ring.

### 4. Rear photogrammetry has different failure modes

The rear path requests a reduced-detail Object Capture model, then fits it to the LiDAR surface. It can return nil and preserve the coarser LiDAR result. A successful save must distinguish coarse depth output from completed photographic reconstruction.

Apple recommends rigid, static subjects, consistent lighting/settings and strongly overlapping photographs; reflective or translucent surfaces are difficult. A face maintaining a smile over a long sweep violates those assumptions more easily than a static object. A higher mesh/detail setting alone cannot recover expression consistency or missing observations. [Apple capture guidance](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture)

### 5. Current dental registration is provisional

The code supports manually corresponding points, followed by local surface fitting near the picked anterior region. It warns on a fit above 1 mm but also permits a point-only outcome when refinement fails. A low fit against noisy face-scan tooth surfaces is not an independent accuracy measure. Do not label that relationship verified solely from its displayed average gap.

Keep the actual intraoral scan unchanged. Verify registration using independent anatomical/marker references and lab inspection; evaluate a known scan marker/bite-fork workflow if visible teeth do not provide reliable common geometry. Preserve the transform, units, residual distribution and provenance separately from the meshes.

## Proposed implementation sequence

1. **Benchmark before replacing.** Scan the same consenting subject and a measured static face reference using the current app and a suitable established app on the same supported device. Inspect textured and untextured exports in the intended lab CAD software. Do not upload patient material to a new vendor as part of this research.
2. **Choose one primary acquisition path.** Front TrueDepth with capability checks for actual depth availability. Use a short guided frontal/left/right and modest vertical sweep, with stable expression and diffuse light. Capture neutral and smiling faces separately when both are needed; never fuse changing expressions into one surface. Prefer a clinician-held sweep around a still patient for the initial controlled benchmark; validate a head-turn mode separately.
3. **Evaluate a maintained engine behind a narrow adapter.** Structure's Face preset is the first candidate. Keep existing case/media/export UI and formats. Check real face-tracking behaviour, offline reconstruction, licensing, target devices and memory/thermal behaviour before integrating. The recommendation is an evaluation, not approval to buy or send data.
4. **If retaining the custom engine**, use captured replay evidence to separate lightweight registration from final fusion, fix demonstrated calibration/pose defects, and remove measured hot-path work. GPU acceleration or a sparse representation should follow profiling, not another arbitrary voxel reduction.
5. **Preserve photographic quality separately.** Choose sharp RGB keyframes whose calibrated poses correspond to accepted depth observations. Bake a texture only after reconstruction. Review the mesh with texture disabled: attractive colour can hide distorted geometry. No generated skin/teeth or invented hole filling in lab-critical regions.
6. **Secondary rear route.** Keep the patient stationary and collect sharp overlapping RGB views. Use depth for metric context, and process separately. A coarse result remains clearly labelled and cannot silently qualify as the detailed lab result.
7. **Export a complete lab package.** OBJ + MTL + image texture; coloured PLY where supported; original reference photographs; units/orientation and intraoral transform metadata. Verify scale and materials in the lab's actual exocad/3Shape version. STL alone loses colour/texture.

## Acceptance and limits

Test on the actual supported iPhone and iPad models, including repeated warm-device scans, interruption, restart, cancellation and export/reopen. Record preview responsiveness, accepted depth rate, reconstruction duration, texture sharpness, failures and recoverability. A proposed engineering goal is a short predictable capture with responsive preview; final timing and geometric tolerances must be agreed with the lab and measured, not represented as existing guarantees.

Use repeat scans and independent reference geometry. Inspect whole-face and perioral deviation maps, scale, asymmetry, mesh holes and image-to-geometry alignment. A successful file export or internal registration score is insufficient. Obtain actual lab confirmation that the exported package opens correctly and supports its intended workflow.

Published evidence is mixed. A 29-participant iPhone/Bellus study reported mean surface RMS difference of 0.86 ± 0.31 mm against 3dMD, while cautioning about fine detail. Another study found regional discrepancies exceeding 3 mm. Neither validates SmileCompose or a different device/app version. This supports facial-context use only after our own validation and cautions against treating phone depth as intraoral tooth metrology. [29-participant study](https://pubmed.ncbi.nlm.nih.gov/37180897/), [regional-error study](https://pubmed.ncbi.nlm.nih.gov/36298103/).

**Next concrete step:** a bounded TrueDepth benchmark and profile of the existing build, alongside an SDK feasibility check, with an exported sample reviewed in the lab. Do not spend another iteration changing scan guidance or voxel size without those measurements. No claim of a repaired or lab-validated scanner is made here.
