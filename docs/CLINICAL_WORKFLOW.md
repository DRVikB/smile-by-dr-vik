# SMILE clinical workflow update

## What is implemented

- Upper and lower tooth selection (permanent FDI 17–27 and 47–37, excluding wisdom teeth). Presets remain available. Each tooth can follow the global goal, be preserved, recoloured, edge-repaired, have gaps closed or be reshaped. Missing teeth are excluded; restored teeth carry a clinical-assessment reminder. A per-tooth shade overrides the global shade. These are image instructions, not anatomical segmentation or feasibility measurements.
- Library metadata: starting conditions, teeth treated, accompanying whitening/orthodontics/gum treatment, weeks to the outcome photograph, and an optional paired before photo. Material remains an exact match (except legacy generic composite). Shared condition tags outrank tooth overlap, then recency. Pinned references must still match material. Only finished photographs are sent as style references; metadata matching runs locally.
- Held-out validation: save a case's before and actual-after photos in Case library, enter teeth treated, and choose Validate from this before photo. This marks the case as excluded from AI references (including pinned selection); exact duplicates of its after image are filtered as well. Confirm the actual goal, shade and tooth plan before creating a preview. Reveal the actual outcome in the result's validation panel; record four 1–5 clinician ratings plus comments. Ratings are exportable JSON from Case library, without photographs. Scores for the same case and generated version are replaced when re-saved; this is not a multi-rater clinical trial system. Deleting the library case deletes its ratings.
- Review of a specific version: record the reviewer and notes after checking protected anatomy, design and assessment needs. A new generation starts unreviewed. Review text is included in saved side-by-side/stacked image reports. It is not a verification of clinical feasibility.
- Capture guidance and relative facial analysis: no millimetre estimates are displayed from assumed iris dimensions. Facial landmarks do not locate dental midlines or gum contours.
- Compare 3 materials changes only the material selection while retaining the selected tooth plan, shade and other settings. These remain independent image generations; review geometry across options. Equivalent per-tooth instructions are grouped in the prompt to avoid repeated input tokens.
- Costs: optional device-local case request allowance, full batch confirmation, reuse of an identical available result without sending another request, and request-ID duplicate protection. Reuse includes the original photo, settings, reference images, painted mask, resolution and model. Only current/saved variants are eligible; it is not a server photo cache. An explicit new variant with changed settings remains chargeable. Failed requests count toward the allowance. The allowance is not an account-wide or hard-dollar budget.

## Privacy and server request protection

Existing local case/history storage remains. Paired reference photos are stored only when the clinician explicitly saves/imports them into the device library. The new validation store holds case IDs, settings, ratings and available usage/latency, not patient photographs. It is device-local and included only in an explicit export. Browser storage can be cleared by the operating system; it is not a clinical-record backup.

Next.js on Netlify uses @netlify/blobs atomic onlyIfNew writes for request IDs. The store `smile-request-markers` holds random IDs and timestamps only. It contains no photos, patient names, settings, image hashes or keys. Markers remain after errors because a provider may already have charged; replay returns 409 rather than retrying. Marker-store failure returns 503 before a provider request. Markers persist across deploys and are not automatically deleted. A newly initiated request has a new ID and may incur a new charge; this is replay protection, not exactly-once provider billing.

No new user-configured environment variables are required on Netlify: its Next.js runtime supplies Blobs credentials. Other hosting and the legacy Sites worker use a bounded in-process 24-hour marker store; it does not protect across separate instances or restarts. Live requests require X-Smile-Request-Id; refresh older app versions if instructed. The client request limit is not a security/rate limit.

## Pilot protocol

1. Start with 20–30 varied, consented completed cases as a development pilot, not a statistically validated accuracy claim.
2. Keep both photographs under consistent framing/lighting. Enter the treatment actually delivered and accompanying treatment. Choose unambiguous anonymised labels.
3. Hold out the entire patient/case from references, including differently cropped copies the app cannot identify automatically. Do not put the actual outcome in the optional reference-photo field.
4. Generate from the before photo and actual design brief. Inspect once before revealing the real outcome, then rate contours, gum preservation, untreated teeth and material appearance. Record mismatched photography or accompanying treatment that limits comparison.
5. Review error patterns, frequency of regeneration, recorded usage and latency. Do not interpret an average rating as a clinical accuracy percentage. Use a separate calibrated method for shade assessment.
6. Repeat prospectively and with additional reviewers before clinical or competitive accuracy claims.

## Remaining limits

No scan import, shared editable 3D tooth geometry, occlusal verification or exact material optics has been added. Independently generated comparison options can differ in geometry. A physical iPad/Safari check and a real-case validation pilot still require the clinician. A capture checklist cannot automatically guarantee adequate tooth detail or calibration. No additional paid AI analysis is used by these new controls.
