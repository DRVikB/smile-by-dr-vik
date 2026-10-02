# Recent cases, reopened exports and AI concept wording

Implemented locally, 1 October 2026. No deployment or paid generation was performed for this pass.

- The hub lists every active local case in pages of three, with native horizontal scrolling and scroll snapping, previous/next controls and keyboard paging. Case grouping, activity ordering and favourite cover selection are retained.
- Reopened saved comparisons have Export & share. The existing image/PDF, reviewed consultation report and reveal-video exports work inside the full-screen dialog; closing the sheet returns to the existing comparison. Background comparison controls are inert while the export sheet is open.
- Saved exports use that version's original photo, generated image and recorded preferences. Older versions without preferences do not invent a design or treatment description. Export history refreshes after closing the sheet.
- Interface notices and export footers state that the AI concept follows the clinician's chosen design, is a visual guide for discussion, is not a treatment plan and does not guarantee the final clinical outcome. The after-image tag reads AI concept. Demo imagery stays identified separately.

## Verification

- 400 unit tests passed, including all cases remaining reachable, favourite cover/activity ordering, saved export preferences and legacy cases, and consistent disclosure wording.
- Lint, TypeScript and production build passed. Native iOS bundle built, synced and passed verification.
- WebKit tested at 375×667, 393×852, 768×1024, 1024×768, 852×393 and 1440×900. Seven synthetic cases were reachable in three pages, with no page-level horizontal overflow. Native horizontal wheel scrolling and keyboard paging reached later pages; final-page next control disabled correctly.
- Saved comparison opened its export sheet, created and downloaded a preview JPG/PDF and a consultation report PDF. Closing exports refreshed the saved export history. Overlay changes remained usable on reopened cases.
- The recorded video completed in WebKit on the production build. Its download fallback produced a playable MP4; an AVFoundation extraction at 4.8 seconds confirmed the after-image AI concept tag and clinician-guide/non-guarantee wording in the pixels. Physical iOS share-sheet integration and finger-swipe behaviour still need a device check.
- All test photos were fictional bundled demo assets. Case storage remains local; no new cloud storage or AI calls were added.

Screenshots and downloaded sample exports are in ignored output/playwright and .playwright-cli directories.
