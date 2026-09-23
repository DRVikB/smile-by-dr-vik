# Clinician generation costs

Open **Clinician costs → Show** above the design controls, or on the result screen.
The preference is kept on this device. Costs are not added to patient reports,
image exports, presentation slides, reveal videos or the consultation overlay.
This is a hideable planning panel, not a separate authenticated staff area.

## Current tariff

Verified 22 September 2026 against Google's standard Gemini Developer API pricing:
https://ai.google.dev/gemini-api/docs/pricing

For the existing `gemini-3.1-flash-image` model:

| Output | One image | Three images |
| --- | ---: | ---: |
| Standard 1K (default) | US$0.06720 | US$0.20160 |
| Draft 512px | US$0.04482 | US$0.13446 |

These are image-output charges only. Input text and images cost US$0.50 per
million tokens; output text and thinking cost US$3 per million tokens. Tax,
hosting and provider billing adjustments are excluded. Drafts have less detail.
A subsequent standard generation is a new paid render, not an upscale, and can
change the result. The model itself is unchanged.

## Accounting and limitations

- `/api/generation-cost` returns public model/tariff information only. Both Next.js
  and the Sites worker implement it. No paid call or patient image is needed.
- Before generation, show one- and three-image output estimates. Unknown models
  remain unpriced. Test mode and the mock adapter show no AI charge.
- Gemini's returned input, output-modality and thinking token counts are used to
  calculate a usage-based estimate. Missing or malformed usage gives an explicitly
  incomplete image-only subtotal. This is not an invoice or a guaranteed quote.
- Track every submitted request in the current case. Failures, cancellations,
  lost responses and interrupted requests stay unconfirmed, not assumed free.
- Current-case accounting survives refresh alongside the temporary case.
  Replacing a photo retains its costs; New Smile / Reset starts fresh. Older
  requests made before this update are not reconstructed. This is not an
  account-wide or historical case billing ledger.
- Reports and exports do not consume a further generation. Changing design
  controls and switching between existing options also make no paid request.
- Existing single-request guards and no automatic retry behaviour are retained.
  Three-option buttons still intentionally send three independent requests.
- Prices live in `src/lib/generation/cost.ts`. Review them when Google changes
  tariffs or the configured model changes. No new environment variables required.
- This display does not impose a spending cap. Hard account-wide limits would
  require persistent server-side accounting and provider quota controls.

## Validation

Pricing arithmetic, usage breakdown, missing usage, unknown models, safe public
metadata, draft request configuration, unsupported draft rejection before provider
calls, and case persistence/reset are covered by automated tests. Browser checks
at 1024×768 and 768×1024 use the bundled sample photo and intercepted provider
responses, including a partial failure. They do not spend AI credits and do not
establish the clinical fidelity of 512px output or physical iPad Safari behaviour.
