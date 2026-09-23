# Context-dependent smile design

## Chairside workflow

1. Select a treatment: Single-shade composite, Layered composite or Porcelain.
   Older cases with unspecified Composite still open without assigning a technique.
2. Choose a design goal. Auto interprets clinician notes within conservative
   limits; an explicit goal narrows those permissions.
3. Optionally use **Protect edit area**. Paint selected teeth and the space needed
   for planned additions. Leave gums, lips and untreated teeth unpainted. Erase
   removes permission. Zoom and Move make the region accessible on an iPad.
4. Generate and compare with the original. Protection status and missing library
   references are visible on the clinician result screen.

| Goal | Permitted changes | Retained features |
| --- | --- | --- |
| Auto | Smallest supported change requested in notes; conservative refinement otherwise | No invented treatment, replacements, age assumptions or mandatory ideal proportions |
| Shade only | Selected shade change | Tooth contours, texture, wear, gaps and positions |
| Repair edges | Local additions at supported chipped/worn edges | Proximal widths, gaps, existing positions and gums |
| Close gaps | Proximal additions into visible spaces between selected existing teeth | Incisal length, gums, tooth positions; no replacement of missing teeth |
| Reshape | Planned modest contour changes within treatment limits | Gum levels, root/tooth axes, arch form and untreated teeth |

### Rule priority

1. Protected anatomy, framing and treatment-specific limits.
2. Selected goal, its permissions and the selected shade.
3. Clinician notes within those permissions.
4. Material appearance and texture.
5. Style preferences and examples.

Notes cannot authorise gum editing, missing-tooth replacement, inferred orthodontic
movement or departure from a selected shade-only goal. Auto treats negated notes as
prohibitions and preserves features when the request is contradictory or unsupported.
This is an instruction to the existing image model, not an independently validated
clinical interpretation of free text or photographs.

Universal tooth-ratio targets, inferred age-based wear prescriptions, compulsory
face-to-tooth shape matching and automatic midline correction were removed.
Smile-arc guidance applies only when the relevant lip is visible and the goal
permits edge changes. Close-ups do not use unseen facial features. The camera guide
locates the smile; it is not an anatomical boundary or a target size.

### Material references

Single-shade describes a clinician-selected technique, not necessarily a universal
one-shade product. Layered composite has distinct restrained optical guidance.
Porcelain is not automatically whiter or larger. Unknown product, substrate,
thickness and cement prevent exact optical prediction.

Own-case selection filters to the chosen technique, including pinned cases. Legacy
Composite may still use either composite category. Pins of another material are
excluded and the UI explains that rule. If no matching media is available, or the
library cannot load, the generated result explicitly says no own-case references
were used. Matching is still by material and recency, not clinical phenotype.

## Anatomy protection

The existing face lock is retained and its limits are now visible. It protects the
surrounding face, not individual gums or untreated teeth. If unavailable, the result
shows a warning; it is not silently described as protected.

A painted edit mask is an additional deterministic local compositor. Only painted
alpha allows generated pixels; outside it, decoded original pixels are restored
before the normal JPEG export encoding. Soft brush edges blend only within painted
alpha; there is no automatic dilation. A failed/empty/mismatched mask raises an error
rather than silently dropping protection. The mask stays on the device with the
current case and is never sent to the provider. New photos have no inherited mask.
The mask applies to new generations, not to an already-created result.

The clinician is responsible for what they paint. This does not automatically
identify teeth, gum margins, bite or treatment feasibility. A mask that includes
untreated anatomy permits edits to that anatomy. Recheck it after changing the goal
or selected teeth. Actual clinical assessment and result review remain necessary.

## Cost and compatibility

No second AI planning, segmentation or validation call is added. The same provider,
model and cost controls remain. Masking and rule assembly run locally/in code.
Shade-only plus The same is rejected before provider invocation. Shape comparison
buttons are disabled in shade-only mode. Harmonised options now generates three
results, matching its displayed cost (the older implementation generated four).

Saved preferences include the goal. Shade-only reports do not claim that ignored
shape/texture presets were applied, and treatment notes do not prescribe veneers or
bonding merely because a material reference was selected.

## Evidence informing the removal of blanket rules

- Tooth proportions: https://pubmed.ncbi.nlm.nih.gov/34489087/
- Single/multi-shade composite colour matching: https://pubmed.ncbi.nlm.nih.gov/39985411/
- Ceramic optics: https://pubmed.ncbi.nlm.nih.gov/30213524/

These papers do not validate this app's outputs. Automated and browser tests verify
rule selection, request configuration, compositing and persistence. Clinical accuracy
still needs assessment against real outcomes. Current selection remains upper-arch
only; scan-based design and automatic tooth/gum segmentation are not implemented.
