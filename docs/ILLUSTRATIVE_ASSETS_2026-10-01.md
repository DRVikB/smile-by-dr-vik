# SmileCompose illustrative assets — 1 October 2026

Created with the built-in image-generation tool. The two new portraits are fictional illustrative samples, not patient photographs, clinical outcomes, or treatment references. Patient images and generation behaviour are unchanged.

## Assets

- `public/examples/portrait-man-v1-{384,768,1024}.webp`
- `public/examples/portrait-woman-v1-{384,768,1024}.webp`
- `public/examples/smile-detail-v1-{480,960,1536}.webp`: refined illustrative smile close-up.
- `public/examples/demo-portrait-{before,after}-v1.webp`: full-resolution copies of the original registered demo PNGs, encoded as WebP.

Original generated PNGs are retained under Codex generated_images and copied to ignored `output/imagegen/`. Responsive portrait copies use WebP quality 94; smile detail uses quality 95; demo copies quality 96. No upscaling. Existing assets remain available.

## Final prompts

### Man

Use case: photo-natural. Asset type: premium SmileCompose dentistry app illustrative sample photograph, not a clinical result or advertisement. Primary request: an exceptionally clear natural photographic portrait of a fictional 45-year-old man with medium olive skin, short salt-and-pepper hair and light stubble, smiling comfortably with realistic proportionate upper teeth visible, individual enamel texture and subtle natural variation. Composition: one single portrait, front-facing head and shoulders with entire hair and chin in frame, centered, plenty of breathing room around face for responsive mobile and tablet layouts. Studio background softly out of focus in warm taupe. Soft large window light, editorial portrait photography, premium but candid, crisp eyes and smile, authentic skin pores, warm neutral palette. Wearing simple charcoal crew-neck. No text, logos, watermarks, UI, dental instruments, exaggerated veneers, teeth unnaturally long or plastic beauty filters. Portrait orientation at highest available detail.

### Woman

Use case: photo-natural. Asset type: premium SmileCompose dentistry app illustrative sample photograph, not a clinical result or advertisement. Primary request: an exceptionally clear natural photographic portrait of a fictional 32-year-old Black woman with deep warm brown skin, shoulder-length natural curls and understated small gold earrings, smiling comfortably with realistic proportionate upper teeth visible, individual enamel texture and subtle natural variation. Composition: one single portrait, front-facing head and shoulders with entire hair and chin in frame, centered, plenty of breathing room around face for responsive mobile and tablet layouts. Studio background softly out of focus in warm ivory. Soft large window light, editorial portrait photography, premium but candid, crisp eyes and smile, authentic skin pores, warm neutral palette. Wearing a simple cream linen top. No text, logos, watermarks, UI, dental instruments, exaggerated veneers, teeth unnaturally long or plastic beauty filters. Portrait orientation at highest available detail.

### Smile detail

Use case: identity-preserve. Asset type: high-resolution illustrative smile-detail photograph for the SmileCompose sample-design card. Input image: the existing fictional sample smile, supplied as a small reference. Primary request: create a beautifully clear premium editorial dental smile close-up matching the reference framing, proportions, lips, natural tooth shapes, subtle enamel translucency and warm skin tone. Improve photographic detail and natural texture for crisp tablet display. Keep the same relaxed mouth opening, incisal edge lengths, visible tooth count, upper/lower visibility, gum contour and proportions. Do not lengthen teeth, expose extra lower teeth, open the lips, brighten to bleached white or add plastic veneers. Landscape composition, smile centered with nose base and chin margin, entire lips inside frame. Soft diffused daylight, authentic pores, polished photographic quality. No text, logos, watermarks, UI, borders. This is a fictional illustration, not a real clinical outcome.

## Presentation

The new portraits appear in the onboarding account imagery, capture illustration and decorative photo-picker mosaic. The before/after reveal and all three demo material results retain the same demo person. Illustrative galleries are labelled; the sample library preview no longer claims these are the clinician’s finished cases. Full-bleed onboarding portraits use full frames on phones as well as tablets. Responsive sources serve smaller images for thumbnails and larger images for hero panels. The demo variations sheet displays one shared illustration disclosure instead of repeating a long paragraph under every photo. All assets are bundled locally with web and native builds; they add no per-case AI requests.

## Verification

- WebKit: photo-picker images load without horizontal overflow at 375×667, 393×852, 852×393, 768×1024, 1024×768 and 1440×900.
- Visually checked welcome/account, workflow cards, photo picker, material comparisons and the isolated library illustration component. Phone and tablet screenshots are in ignored `output/playwright/visual-*.png`.
- Three-material demo preparation and selection succeeded without paid AI calls.
- Lint, TypeScript, final production build and native bundle/sync verification passed. All new sample assets are present in the native bundle.
- These are browser layout checks and bundle checks, not a claim of physical iPhone/iPad testing. Changes remain local and undeployed.

## Onboarding comparison refresh — 4 October 2026

Supersedes the v1 portrait pair for the shared full-portrait onboarding reveal and decorative photo-picker mosaic. The original v1 files remain intact. Compact smile-detail visuals and live/demo generation inputs are unchanged.

- Before: `public/examples/demo-portrait-before-v2.webp`
- Concept: `public/examples/demo-portrait-after-v2.webp`
- Both: 1086×1448, WebP quality 96, no resizing or upscaling.
- Created using the built-in image-generation tool: a new fictional brunette portrait, followed by a dental concept edit of that portrait. This is illustrative content, not a patient photograph or evidence of the app's generation quality. The matched pair is visually registered, not certified pixel-identical outside the mouth.
- Before shows darker yellow enamel, crowding and uneven incisal edges. Concept shows noticeably brighter white enamel and more even anterior teeth. Cosmetic approval remains with the owner.
- Five asset-generation calls, including three discarded alternatives. No SmileCompose provider requests or account allowance consumed.

### Selected Before prompt

Use case: photorealistic-natural. Asset: premium high-quality onboarding BEFORE photograph for a fictional dentistry app smile comparison. Create a brand-new convincing real photographic head-and-shoulders portrait of a fictional woman about 32, with warm olive skin, expressive brown eyes, long gently wavy dark brown hair with subtle warm highlights, little gold hoop earrings and a black sleeveless top. Front-facing, friendly natural smile, teeth clearly visible, soft warm taupe studio background. Portrait format ideally 1536x2048 or highest available. Entire head, shoulders and chin inside frame with comfortable margins. DSLR editorial studio photograph, 85mm portrait perspective, fine authentic skin detail with smooth tonal transitions, natural asymmetries, crisp eyes and hair. Avoid all embossed/engraved artificial skin patterns, waxy skin, excessive tiny wrinkles, AI gloss and oversharpening. BEFORE DENTITION IS ESSENTIAL: teeth clearly darker and moderately yellow with mild staining, visible moderate upper front crowding with a rotated lateral incisor on each side and a slightly overlapping incisor; incisal edges modestly uneven. Realistic pleasant untreated smile, without grotesque deformity, decay or missing teeth. Smile full and visible enough that a later brighter aligned dental concept is immediately distinguishable. Normal healthy pink gums, individual natural tooth anatomy and texture. Soft diffused daylight, premium warm neutral colour balance. No perfect white teeth in this before image. No text, no UI, no split screen, no borders, no watermark. One standalone portrait. Fictional illustrative content, not a patient.

### Selected Concept prompt

Use case: identity-preserve. Edit target: this newly created fictional woman BEFORE portrait. Make a matched CONCEPT AFTER image by editing ONLY the visible dental region inside her current lips. Keep the photograph otherwise identical: exact subject identity, face, gaze, expression, head angle, hair, skin texture and every non-dental detail, background, lighting, earrings, clothing, crop and resolution 1086x1448. No facial retouching, zoom, reframing, head movement or changing mouth opening/width/lip contours. Change the currently darker yellow, uneven/crowded/rotated upper teeth into a beautifully bright white, straight, refined natural smile. Correct visible crowding and rotations, align individual teeth along a coherent natural arch, balance edge heights, shape attractive softly rounded-square incisors with realistic tooth proportions and embrasures. Very bright white/bleach enamel with believable depth, gentle translucent incisal edges, fine texture and natural reflections; do NOT use flat plastic veneer shapes or oversized teeth. Preserve healthy natural pink gum contours and current visible tooth count, smile scale and lips. The BEFORE vs CONCEPT contrast must be clearly visible: yellow/uneven to bright white/elegantly aligned, but without changing her expression. Lower teeth only as already visible. No split image, no letters, no UI, borders or watermarks. Single standalone AFTER portrait, same canvas. Illustrative fictional dental concept, not a real outcome.

### Verification for this refresh

- Running app: both v2 files decode at 1086×1448.
- Browser viewport checks: 393×852 phone and 1194×834 tablet landscape; the whole smile remains visible and the phone has no horizontal overflow.
- Screenshots: ignored `output/playwright/onboarding-v2-iphone.png` and `output/playwright/onboarding-v2-ipad-landscape.png`.
- Uses the existing welcome/subscription hero reveal and animation; no onboarding flow, pricing or subscription changes.
- Lint, TypeScript, production build and native packaging: PASS. Both native assets match the source WebP SHA-256 hashes. Initial build failed loading the existing Turbopack persistence cache (`invalid digit found in string`); preserving that cache in ignored output and rebuilding with a fresh cache passed. No application-code workaround was needed.
- Browser checks are not physical-device acceptance. No installation, deployment or Apple upload performed for this refresh.


## Subscription portrait and launch navigation — 4 October 2026

The subscription step now uses the owner's explicitly supplied and approved likeness; Welcome retains the fictional brunette pair above. This is an AI-edited illustrative comparison, not a claim about the owner's actual untreated teeth or a clinical treatment outcome.

- Input reference: owner-supplied portrait, BE3E794C-7D20-4ABD-996D-E0CED267B26C.jpg.
- Before: public/examples/subscription-male-before-v1.webp.
- Concept: public/examples/subscription-male-after-v1.webp.
- Both 1086×1448, WebP quality 96, no resizing/upscaling. Two built-in asset-generation calls; zero SmileCompose provider requests or allowance consumption.
- Before shows darker enamel and modest uneven edges; Concept shows noticeably whiter, more even incisors. Similar crop/expression, not guaranteed pixel-identical outside the teeth. Human cosmetic review remains required.

### Selected male Before prompt

Use case: identity-preserve. Create a premium onboarding BEFORE portrait for SmileCompose, using the supplied owner-approved photograph as the exact identity reference. Preserve this man's recognisable likeness: facial proportions, eyes, brows, nose, warm skin tone, short dark hair, closely trimmed beard, friendly smile and black crew-neck top. High-quality natural editorial studio photograph, authentic skin and hair detail, charcoal studio background and soft warm lighting matching the reference. Portrait 3:4 canvas, head and shoulders centred, entire hair and chin visible, comfortable margins for phone/tablet cropping. Do not exaggerate or beautify facial anatomy, do not add a white coat, accessories, text or UI. The only intended smile change for this illustrative BEFORE is visibly darker moderately yellow/stained enamel and modest but clearly visible upper incisor crowding/rotation with uneven edges. Keep tooth count, lip contours, mouth width and opening, expression, gum contours and face unchanged. Pleasant realistic untreated teeth, no decay, no missing teeth or grotesque defects. It should make a clear later comparison to bright white, aligned teeth. This is an illustrative edited portrait, not a claim about this person's actual teeth or a clinical result. Highest available photographic quality. One standalone before portrait, no split-screen, border, watermark or typography.

### Selected male Concept prompt

Use case: identity-preserve. Edit this BEFORE portrait into its matched SmileCompose CONCEPT portrait. Keep the man's exact recognisable likeness, expression, head pose, eyes, brows, nose, beard, hair, skin, lighting, black top, charcoal background, crop and canvas identical. Edit only the visible teeth inside the existing lip boundary. Turn the darker mildly uneven teeth into a strikingly brighter beautiful white smile: bright bleach enamel, straight aligned upper incisors, more balanced softly rounded-square incisal edges, realistic individual proportions and embrasures, subtle translucent enamel tips and fine natural surface character. Keep tooth count, gum margins, lips, mouth opening/width, tooth size and smile scale stable. Do not open the mouth, enlarge teeth, add exposed gum or erase beard detail. Avoid a flat plastic block, oversized veneers or featureless paper-white enamel. Strong visible Before/Concept shade and alignment improvement while retaining believable anatomy. No face beautification or other photographic changes. No split screen, labels, UI, border or watermark. A single matched AFTER portrait. This is an illustrative edited concept of an owner-approved likeness, not a clinical treatment result.

### UI and restart behaviour

- Subscription dismissal uses a visible, accessible 44px circled X wired to the existing defer action. No pricing, products or purchase behaviour changed.
- Subscription card has no internal scroll; at 1194×834 tablet landscape, card and page fit without scrolling. On compact phones the whole page can scroll to retain all terms and plan content; the X remains fixed and visible. Screenshots: output/playwright/subscription-male-ipad.png and subscription-male-iphone.png.
- Only initial app mount reads the working case with forLaunch=true, opening Home while preserving photo/settings/result/versions. Explicit case reopening retains the saved design/accepted comparison. Existing foreground sync continues without resetting the current screen.
- Cold launch restarts unfinished onboarding at Welcome while retaining entered names and completed onboarding flags. Completing onboarding still suppresses it on later launches.
- Browser checks: unfinished subscription reload → Welcome; X → Ready; completed onboarding/photo-step reload → Home. These are browser checks, not physical force-close/background acceptance.
- Storage and repository regressions first failed, then passed after the narrow launch-only change; original/source/result retention and ordinary reopening are asserted. Full suite: 773/773 PASS; lint, TypeScript and production/native build PASS. All four new portrait assets have matching source/native SHA-256 hashes. The sandbox blocked the tsx CLI's local IPC socket; the identical suite passed using node --import tsx --test tests/*.test.ts.
- No device installation, backend deployment, provider change, patient-case deletion or Apple upload. Current generation reliability remains unresolved and is separate from these presentation changes.

## Interactive reveal and fictional male correction — 4 October 2026

Supersedes the owner-likeness subscription illustration above. The owner reversed that choice and requested the fictional male already used in the sample gallery. The first missing-tooth edit had an oversized central incisor and was rejected; following the owner's correction, the selected Before shows stained/chipped teeth with both lateral incisors present.

- Final Before: public/examples/subscription-fictional-man-before-v2.webp.
- Final Concept: public/examples/subscription-fictional-man-after-v2.webp.
- Both 1024×1536, WebP quality96, no resize/upscale. Three built-in image-generation calls (one discarded gap/wide-incisor alternative, then corrected Concept and matched Before); zero SmileCompose provider calls or allowance consumption.
- The model originates from the existing fictional portrait-man-v1-1024.webp. The selected pair has matched balanced incisor widths; Before has staining/chipped edges, Concept has a complete bright smile. Visual match is illustrative, not certified pixel-identical or clinical acceptance.
- Owner-likeness WebPs and the discarded missing-tooth Before were moved from public/examples to ignored output/imagegen/superseded-subscription-2026-10-04. No longer referenced or included in newly built bundles; generated originals retained privately.

### Final Concept prompt

Use case: identity-preserve. Edit target: the supplied fictional male studio portrait. Produce a corrected matched CONCEPT/AFTER portrait for SmileCompose. Change ONLY the visible teeth inside the current lip opening. Give a complete attractive bright white smile with anatomically believable individual teeth. Two clearly separate upper central incisors of balanced matching widths and heights, each approximately 8-9mm wide in proportion to this man's face; the central incisor pair together must not become a broad single tooth. BOTH upper lateral incisors must be present, visibly narrower than their adjacent centrals, then canine teeth and visible premolars in their natural positions. Natural contact points, subtle embrasures, softly rounded-square edges, fine enamel texture and restrained translucent tips; no gaps, chips, fused crowns, duplicate teeth, huge central incisor or plastic veneer block. Keep the existing smile scale and tooth length. Preserve the exact man, expression, mouth width/opening, lip contours, healthy gum margins, face, gaze, head pose, skin texture, beard, hair, lighting, dark shirt, taupe backdrop and full portrait crop. Do not retouch or redraw skin outside the mouth; no extra engraved pores, oversharpening or embossed wrinkles. Preserve the 1024x1536 input canvas. One standalone fictional concept portrait, no text, split screen, border or watermark. Illustrative content, not a clinical result.

### Final Before prompt

Use case: identity-preserve. Asset: matched fictional BEFORE portrait for the SmileCompose onboarding comparison. Edit target: this corrected CONCEPT portrait of the fictional male model. Change ONLY visible enamel within the existing lip opening. Keep ALL visible teeth present including BOTH upper lateral incisors, and preserve the correct individual crown widths from the input: two matching central incisors, narrower laterals, then canines and premolars. Make enamel moderately yellow/stained and make a clear but realistic chipped incisal corner on ONE central incisor (around 15 percent of its edge, not the whole tooth), with slightly uneven worn edge heights on adjacent teeth. Preserve tooth centres and widths; no oversized or fused central, missing lateral, dark gap, extra tooth or malformed gum. The Before/Concept change should be easy to notice: stained chipped edges versus the input's complete brighter balanced smile. Preserve every non-dental detail exactly: same identity, skin, brows, eyes, hair, beard, expression, lip contours, mouth opening/width, gum contours, lighting, clothing, background, crop and 1024x1536 canvas. No facial retouching or added pore/wrinkle sharpening. Single standalone realistic BEFORE photo, no text, borders, labels or watermark. Fictional illustration, not a clinical outcome.

### Reveal behaviour and verification

- Welcome and Subscription reuse SmileReveal with interactive=true. Existing 2.8-second reveal with 0.45-second delay completes before the hint appears. CSS animation-end hands control to React's slider position; first drag/keyboard interaction hides the hint and stops the intro if still playing. No loop or provider request.
- Pointer capture supports dragging past the divider; touch-action:pan-y retains vertical page scrolling. Accessible slider supports Arrow keys, PageUp/PageDown and Home/End. Reduced Motion skips the intro and makes interaction/hint available immediately. No automatic onboarding navigation.
- Browser verification: subscription intro class animate, computed reveal-split2.8s/delay0.45s, no hint; completed intro at50%, hint visible. Subscription pointer25%→70%, hint dismissed; keyboard Home0%, End100%, ArrowLeft95%. Welcome pointer interaction changed the reveal and dismissed the hint; keyboard0/100/95 and subsequent reload hint verified.
- Responsive browser previews:393×852 phone and1194×834 landscape tablet. Both final male assets decode1024×1536. Hint sits above the face/smile rather than covering the teeth. Screenshots: output/playwright/welcome-interactive-iphone.png and subscription-fictional-interactive-ipad.png.
- Full suite773/773 PASS, lint/TypeScript/production/native build PASS. Final Before/Concept native SHA-256 hashes match their source WebPs; owner-likeness and rejected gap/wide-incisor assets are absent from public and native bundles. Browser interaction is not physical-device swipe/force-close acceptance. No installation, staging/production deployment or Apple upload.
