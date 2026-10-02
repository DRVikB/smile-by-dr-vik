# SmileCompose V1 — internal TestFlight acceptance

Prepared 2 October 2026. **Not executed on physical devices.** Run only after Stage 3 staging configuration, signing and final bundle blockers are resolved. Use synthetic/adult-consented approved fixtures; automated tests must never use real identifiable patient photos. Use two disposable staging accounts A/B. Internal test notes/screenshots should not contain patient identifiers or tokens.

Record build, RC SHA, device/OS/orientation, staging project/backend, fixture ID, result (`PASS`, `REVIEW`, `FAIL`) and notes for every step. Confirm no device connects to production. Review the [Stage 3 handover](STAGING_TESTFLIGHT_STAGE3_2026-10-02.md) before beginning.

## First install

1. Install the correct internal build through TestFlight on iPhone and iPad. Confirm app name/icon, version/build and readable startup branding/status-bar safe area. Test clean install separately from upgrade; do not delete unsynced clinical work to obtain a clean install.
2. Complete onboarding with test identity. Read privacy/AI notices; no patient processing or cloud sync should happen under misleading device-only promises. Bundled demo is labelled and uses no real AI/allowance.
3. Create/sign in to A using configured staging auth. Verify email confirmation, password reset and Sign in with Apple if configured; check profile preferred name. Logout/login and cold launch must restore only the correct account.
4. Open subscription settings: StoreKit localized prices, monthly/annual plans, Restore Purchases, Redeem Code and account deletion notice. TestFlight uses sandbox; a Test Store key is not the App Store SDK key. Record actual entitlement and starting generation balance.

## Core case

5. Create a case. Confirm adult-patient/upload authority before selection. Upload a synthetic image; optional patient reference should use test initials, not a full identity. Confirm remove/change/reset controls clear the intended photo/state without unintended deletion of other cases.
6. Test back camera (default) and front camera; preview and captured orientation/mirroring should agree. Test camera denial/re-enable, portrait and landscape. Accept the final chosen image, then verify the full original framing is retained with blurred fill where necessary.
7. Import JPEG, PNG, HEIC, very tall, very wide and close-up fixtures. Avoid artificial file names containing identifiers. Confirm orientation, no unwanted crop/stretch and a clear error for unsupported/oversized files.
8. Run Smile Analysis on the photo. Review alignment/lip line estimates as visual guides, not diagnosis. Confirm temporary analysis failure leaves the original safe and no stale other-case/account analysis appears.
9. Choose six teeth. Review Tooth Map numbering and actual boundaries (including gums, neighbours and overlaps); refine/redraw as needed and explicitly confirm it. Missing/stale/invalid selected regions must block precision generation, not silently allow a whole-mouth edit.
10. Choose layered composite/shade/shape and record options/cost estimate. Confirm the per-case AI-processing notice before live Generate. Generate **one** approved fixture first; check usable progress, cancellation/background behaviour and output alignment. Record starting/ending allowance, elapsed time and request reference without secrets.
11. Review Before/Concept, slide and overlay. Adjust overlay 0–100% by touch, pinch/zoom, inspect full photo and mouth at 100%. No facial/expression/mouth-opening/crop change or newly visible lower teeth should appear in a precision upper-only result.
12. Select Preferred Smile, save the case and check saved treatment/options/analysis/map. Close/background/force-close and reopen: recover the same UUID/photo/design/preferred version. Reopen from Cases/recent list; export options remain accessible.

## Precision and treatment review

13. Run a selected single central incisor after correcting/confirming its map. Only that permitted region should change, and it must not become implausibly long. Check adjacent/lower teeth, lip/gum pixels and seams.
14. Repeat reviewed **4, 6, 8 and 10** tooth selections. Record each separately. Do not assume posterior visibility or automatically add teeth where none were visible.
15. Test asymmetric/noncontiguous **Custom**, mixed per-tooth Preserve/Refine, and a lower-arch selection. Unselected gaps/neighbours and opposite arch must stay original; insufficient map/visibility should fail safely.
16. **Whitening / Shade only:** compare Same, Whiten and Bleach. Preserve original tooth geometry, surface anatomy, gingiva and lips. Change enamel shade without changing teeth size/opening or producing flat overwhite rectangles.
17. **Composite:** compare single shade (flatter/uniform material) and layered (modest translucency/secondary anatomy) with the same fixture/settings where possible. Keep dimensions conservative and preserve patient individuality.
18. **Porcelain:** inspect glaze, texture, surface anatomy and optical layering. It should be distinct from composite without lengthening incisors or expanding through lips/gums. Evaluate flat/curved lip-line cases without forcing a universal arc.
19. **Alignment concept:** review crowding/diastema fixtures. This is an illustration, not a 3D occlusal prediction. Never imply deep-bite correction or treatment feasibility solely from the photo; clinician context must be reviewed.
20. **Full arch:** review upper/lower/both and zirconia/provisional appearance on appropriate approved fixtures. Distinguish it from porcelain; verify lip/expression safeguards. Do not claim selected-tooth pixel protection or implant/bite feasibility for this separate pathway.
21. Review missing-lateral, crowding, close-up/retractor and upper-only smile fixtures. No invented lower-teeth exposure, mouth widening, gum reshaping, hidden movement or default excessive length. Use the full Stage 2 visual matrix if the first small batch passes; avoid repeatedly generating failed cases without fixing the cause.

## Cross-device sync

22. A on **iPhone → iPad**: create/save a case. UUID, original, concepts, reference, name, settings, Tooth Map, analysis/review and Preferred Smile should agree. List should fetch thumbnails cheaply; open fetches full media on demand.
23. A on **iPad → staging web**: edit a design/map/preferred version; verify revision increases once and same UUID/state arrives on web. Reopen and export there.
24. A on **web → iPhone**: edit case and verify update on phone. Refresh web and relaunch native app; no broken route, duplicate case or lost export media.
25. **Offline:** cache/open a case, airplane mode, edit; confirm pending state. Force-close and reopen still offline; edits/images/outbox survive. Reconnect; upload/sync succeeds once. A never-opened/evicted image may require network and should explain this.
26. **Conflict:** open same revision on two sessions; save one, then the stale other. Expect 409 and a visible conflict. Verify original local work remains; choose cloud or preserve local as a separate stable case explicitly, with no accidental overwrite.
27. **Delete:** move to Recently Deleted and restore on another signed-in device. Then permanently delete a disposable case; tombstone propagates, private objects are removed/retried, and reconnecting offline edits cannot silently resurrect it.
28. **Account switch:** sign out A and in B on a device with A's cached/pending work. B cannot see/open A's drafts, cases, thumbnails, assets or outbox. A's delayed request/model result must not write into B's cache. Sign back into A; only A's permitted work returns.
29. **Remote owner checks:** operator uses A/B tokens internally to verify A's case/asset access, B denial, private public-path denial, temporary signed access/expiry, checksum/retry and forged path rejection. Never paste tokens in notes/chat or use production cases.

## Patient output

30. Present Mode/Smile Preview: photo and comparison controls fit iPhone and iPad; AI concept/clinician visual-guide wording is clear. Dismissing presentation returns to the same case/preferences.
31. Consultation Report: before AND after, logo, selected preferences/material/shade/shape/teeth, relevant clinician notes and AI-concept disclaimer match the chosen version. Export image/PDF where supported; inspect full-size output, not just thumbnail.
32. Share Sheet: share/save image/PDF; cancel and retry without losing state. Save or send reveal video if supported. Denied Photos-add permission should give a clear recovery path. No automatic send to a third party or unintended permanent export.
33. Open an older synced case after cold launch, select a saved version and repeat report/image/share exports; all options and source/concept images must remain available.

## Account, balance and failures

34. Successful generation consumes one allowance. Double-tap/replay same request must not consume twice. Compare both device balances after sync. A separate deliberate new generation legitimately consumes another allowance.
35. Use a controlled isolated provider-failure test: reservation refunded, one failure entry, source/selections safe. Reconnect/retry and concurrent tests should use stubs where possible to avoid unnecessary AI spend; verify real staging ledger counters separately.
36. Toggle offline before Generate: clear connectivity error, no paid provider call, no lost case. Background/cancel/switch case/account while inference/generation runs; stale results must not attach to a new case/account. A completed in-flight provider request can still incur cost; do not assume cancellation is a refund.
37. Sign out/in and Restore Purchases; sandbox subscription/expiry and allowance remain correct across devices. Do not use real purchase credentials or fake entitlement toggles in the beta.
38. Deny camera/photo-add permissions, cancel picker/share, upload invalid media and exhaust a **disposable** test allowance. Each path must give a recoverable error, preserve valid existing work and prevent unauthorized/free generations.

## Device/privacy

39. Repeat key capture/design/map/compare/export/hub/settings flows on **iPhone**, **iPad portrait**, **iPad landscape**, Safari, and the intended installed native beta. Test light/dark, keyboard open/close, larger text, rotation, safe areas and long menus; no hidden primary actions or crowding over the smile.
40. Background app: App Switcher snapshot must conceal patient photos. Lock/unlock and reopen: no crash/lost outbox. Operator checks WebKit/cache file protection and backup exclusion on hardware; simulator compilation is not evidence of these properties. Session persistence should use the device-only Keychain.
41. Repeated analysis/map work and long case lists: monitor responsiveness/memory, ensure serial worker cancellation/reuse, no duplicate overlays/stale image, no runaway AI retries. Record time-to-ready and any crashes rather than assuming a simulator timing target holds on hardware.
42. Delete disposable test account and its private cases/assets/library/profile. Verify cloud cleanup and revocation path when Apple credentials are configured. Clarify that account deletion does not cancel the App Store subscription; device-only clearing is not cloud case deletion.

## Per-generation record

Copy for every paid test; record before generating to avoid uncontrolled repeats:

| Field | Value |
| --- | --- |
| Fixture/test ID (no patient identifier) | |
| RC SHA / app version / build | |
| Device / OS / orientation | |
| Treatment / material / shade / shape / intensity | |
| Selected teeth / map reviewed / guidance mode | |
| Clinician context (test data only) | |
| AI provider/model / prompt version | |
| Estimated cost / allowance before → after | |
| Elapsed time / request reference (no credentials) | |
| Selected change / neighbours preserved | |
| Gums / lips / expression / mouth width & opening preserved | |
| Crop/head alignment / seams / tooth length | |
| Material fidelity / lip-line harmony / visual appeal | |
| Result: PASS / REVIEW / FAIL | |
| Notes and next action | |

**PASS** = expected function and visually acceptable concept after clinician review; not a prediction of final treatment. **REVIEW** = uncertainty/limitation needing clinician or engineering assessment. **FAIL** = unauthorized change, state/privacy loss, incorrect accounting, unusable UI or unacceptable visual result. Stop and investigate failed precision/privacy/accounting tests before expanding the beta.
