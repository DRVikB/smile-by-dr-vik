# Tooth-map planning visuals

The supplied tooth worksheet is used as a visual reference. The implementation uses original SVG drawings rather than enlarging the low-resolution reference image.

## Changes

- Optional **Planning frames** show a rotated crown rectangle for each template tooth, fine dotted long axes, contact lines and incisal/gingival reference lines. Selected teeth use the app's champagne colour.
- A collapsed **Contour library** shows Square, Round and Tapered worksheet drawings. Choosing a card updates the existing Shape setting and participates in design history.
- Selection shading is quieter. Display and proportion controls have 44-pixel minimum button heights and wrap on narrow screens.
- Template geometry stays clipped at the original lip opening. Planning frames are illustrative, not measured crown dimensions or treatment predictions.

## Protection

This pass does not change detection, segmentation, generation instructions, image compositing or protection masks. Review mode and the single-tooth view continue to draw the actual stored tooth boundaries. Decorative planning frames are omitted in those views. No new AI requests, generation charges or cloud storage are introduced.

## Verification

- WebKit layout checks: 375×667, 393×852, 852×393, 768×1024, 1024×768 and 1440×900. No document or contour-card horizontal overflow.
- Existing demo photograph: on-device detection found eight mapped teeth; selection and contour changes worked.
- Review mode: eight displayed boundaries matched the stored outline coordinates exactly, with no decorative planning frames.
- 61 existing tooth-map, face-protection and generation tests passed.
- Lint, TypeScript and the production build passed.

These are desktop WebKit checks at mobile/tablet viewport sizes, not physical iPhone/iPad validation. No deployment was performed in this pass.
