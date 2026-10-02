# SmileCompose implementation check — 1 October 2026

## Result

The focused implementation pass is complete locally. Production and native Debug builds pass. Nothing was pushed or deployed. This check supersedes the earlier audit's build-failure findings for this working tree; it does not resolve every release issue in that audit.

## Follow-up: original smile opening

The supplied before/after screenshots exposed an overly permissive face-lock boundary. The lock now uses the original inner-lip opening, blends inward and saves lossless PNG; lip corners no longer influence alignment. Explicit prompt rules prohibit revealing hidden lower teeth, including Both-arch and alignment selections. Old lip-inclusive results are excluded from automatic reuse. Full-face cases without automatic or manual protection cannot submit a paid request; an unprotectable returned result is withheld, without automatic regeneration. Existing saved images are unchanged.

Local WebKit processing of the supplied screenshots confirmed zero changed RGB pixels outside the detected original opening, with edits retained inside. No AI upload was made. Landmark boundaries remain approximate, and tooth visibility within the opening still needs clinician review. Updated checks: **397/397 tests, lint, TypeScript, production build, Cloudflare packaging and native bundle verification passed**. Logs use the `output/playwright/mouth-preservation-*` prefix.

## Fixes

- Fixed the overlay's references to removed template properties, preserving the existing tooth-template edit.
- Kept normal 4/6/8/10, alignment and full-arch generation independent of tooth masks and visual templates. Existing prompts already include facial/lip preservation and structured full-arch instructions; these were retained.
- Moved existing SlimSAM refinement into a cancellable worker to keep inference off the interface thread. Mapping runs when needed for selection/review, rather than automatically for normal presets. No model or dependency was added.
- Fixed stale detection results, photo-change state resets, sparse-map single-tooth selection, and manual Add a tooth interaction.
- Fixed tooth mapping when editing an already-generated preview: the original photo is now shown for selection and boundary review.
- Kept smooth templates for planning and selection; actual mask contours appear for technical review and single-tooth editing. Auto/Show/Hide and optional guides remain separate from generation.
- Added touch boundary redrawing and required explicit clinician confirmation before single-tooth generation. Corrections invalidate confirmation; unreviewed or empty usable boundaries cannot start a paid request.
- Preserved concave mask boundaries instead of replacing them with convex envelopes. Single-tooth output uses lossless PNG, with a zero-tolerance RGB check of the encoded protected area.
- Photos open completely contained, with blurred padding. Fit photo restores the original framing; deliberate zoom remains available for inspection.
- Excluded generated build/test output from TypeScript's source scan, so native dependency checkouts do not break web builds.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 394/394 passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, including Worker packaging |
| Cloudflare Worker packaging | Passed |
| Native bundle verification / Capacitor sync | Passed |
| Xcode Debug build for iOS Simulator | BUILD SUCCEEDED |

WebKit checks covered normal eight-tooth demo generation, all three material variations, touch overlay adjustment, Custom selection of 11, touch boundary redrawing/confirmation, generation disabled until reviewed, optional proportion guides, Hide suppressing guides, Full-arch Both/Zirconia demo flow, refresh recovery and saved comparison reopening. Representative sizes: 375×667, 390×844, 844×390, 820×1180, 1180×820 and 1440×900. No horizontal page overflow occurred in the saved comparison matrix. Screenshots and logs are in ignored `output/playwright/`.

Six supplied JPEG/HEIC test photos loaded and were processed locally. Worker inference took approximately 4 seconds in this desktop WebKit environment; this is not an iPad performance measurement. A hostile all-white candidate tested the final single-tooth protection on a supplied photo: the encoded PNG had zero RGB changes outside the allowed region. No patient photograph was uploaded to an AI provider and no paid generation was run.

## Remaining limits

Automatic mapping can still confuse touching upper/lower teeth or numbering; review/redraw is required before precise editing. This pass verifies software behavior, not clinical accuracy or live image quality. The three live output comparisons still require authorised provider processing and clinician assessment. Full-arch remains an illustrative restorative concept, not a prediction of surgery or bite correction.

Physical iPhone/iPad camera, installed standalone UI and signed native integrations were not tested. Legal/release configuration, capabilities, production backend alignment and unrelated defects documented in `INDEPENDENT_APP_AUDIT_2026-10-01.md` remain separate work. Subscriptions, credits, authentication, reports, cloud sync and case-library behavior were not modified.
