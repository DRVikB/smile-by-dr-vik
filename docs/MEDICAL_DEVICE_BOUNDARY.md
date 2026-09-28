# Medical device boundary

**Status: REQUIRES PROFESSIONAL REGULATORY REVIEW.** Nothing here is a regulatory determination. In Great Britain, software is regulated as a medical device under the UK Medical Devices Regulations 2002 (as amended) according to its **intended purpose**, as shown by the manufacturer's labelling, instructions, promotional materials and functionality. Obtain advice from a medical device regulatory consultant and, if needed, the MHRA before claims or features cross the boundary described below.

## Proposed intended purpose (for review)

> SmileCompose creates illustrative, AI-generated images that show a possible aesthetic change to a patient's smile, to support communication between a dental professional and an adult patient during consultation. It is not intended to diagnose, prevent, monitor, predict, treat or alleviate any disease or condition, to plan treatment, or to determine clinical suitability. Outputs are concept visualisations, not predictions of results.

## How the product currently stays within that purpose

| Area | Current implementation |
|---|---|
| Disclaimer | "Concept visualisation only…" (`SMILECOMPOSE.disclaimer`, same text as `CLINICAL_DISCLAIMER`) shown on results (`PreviewActions.tsx`), in the consult view, and burned into exported images and presentations (`compose.ts`, `presentation.ts`); Terms §3; privacy policy §10 |
| No diagnosis or recommendations | The app does not output diagnoses, risk scores, treatment recommendations or suitability decisions. The clinician chooses every design setting |
| Human in control | Generation only on explicit clinician action; the clinician reviews every output |
| Claims | The App Store description and marketing must match the intended purpose (see the checklist) |

## Features the reviewer must assess (possible boundary pressure)

| Feature | Why it needs review |
|---|---|
| Tooth-by-tooth plans ("Repair edges", "Close gaps", "Reshape", "Missing"), smile arc, bite context | Could be read as treatment-planning support |
| On-device face and smile analysis (`src/lib/face/analysis.ts`) with measurements or principles (`smilePrinciples.ts`) | Any output that characterises dental or facial anatomy could be read as a diagnostic aid |
| Validation scoring (`ValidationPanel`) | Internal quality review of outputs; confirm it is not presented as clinical accuracy |
| Result checks (`resultCheck.ts`) and "implications" text (`implications.ts`) | Confirm the wording is aesthetic and not clinical advice |
| Material and shade choices | Communicates options; must not recommend a treatment |

## Claims checklist (App Store, website, marketing, release notes)

- ✅ Allowed (proposed): "visualise", "illustrate", "concept", "communicate aesthetic options", "support consultation".
- ❌ Avoid: "diagnose", "detect", "predict your result", "accurate outcome", "treatment plan", "clinical decision support", "recommend treatment", "assess suitability", or any claim of clinical accuracy or validation.
- ❌ Never claim "GDPR certified" or "fully GDPR compliant" (enforced by `tests/legal.test.ts` for `src/` and `public/`).

## Triggers for re-review

Adding any of: automated recommendations; measurements presented to support clinical decisions; integration with treatment-planning or lab systems; use for under-18s; claims of predictive accuracy; a change of intended user to patients directly.
