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
