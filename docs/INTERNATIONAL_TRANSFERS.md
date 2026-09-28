# International transfers

> **REQUIRES LEGAL REVIEW.** Status: NOT VERIFIED. Nothing in the repository confirms any transfer mechanism.

UK GDPR Chapter V allows restricted transfers only under UK adequacy regulations, appropriate safeguards (IDTA, or the EU SCCs with the UK Addendum) with a transfer risk assessment, or a narrow exception. For the USA, the "UK Extension to the EU–US Data Privacy Framework" (the UK–US data bridge, in force since 12 October 2023) covers only organisations **certified under the UK Extension**.

| Flow | Destination | Data | Proposed mechanism | Evidence required | Status |
|---|---|---|---|---|---|
| Device / Worker → Google generation | USA or any Google facility (Gemini API); selected region (Vertex) | Patient images, prompts | Google LLC UK Extension certification, **or** Google Cloud DPA SCCs plus UK Addendum | DPF listing check; the DPA's transfer terms | NOT VERIFIED |
| Google abuse-monitoring logs | As above | Prompts and responses | As above | | NOT VERIFIED |
| Cloudflare edge processing | Nearest edge (may be outside the UK) | Requests in transit | Cloudflare DPA (DPF / SCCs plus UK Addendum) | | NOT VERIFIED |
| Supabase | Project region, plus support access | Account data | Choose a UK/EEA region (UK has EEA adequacy); DPA for any US access | Region screenshot | NOT VERIFIED |
| RevenueCat | USA | UUID, purchase history | DPF UK Extension or IDTA/Addendum | | NOT VERIFIED |
| Email provider | [OWNER DECISION] | Email address | | | NOT VERIFIED |

## Options to reduce transfers

1. **Vertex AI in `europe-west2` (London)** with regional processing, if the chosen image model is available there, plus an abuse-monitoring exemption. Supported in code: `SMILE_PROVIDER=vertex`, `VERTEX_LOCATION=europe-west2`, `SMILE_GEMINI_DATA_TERMS=vertex`.
2. Supabase project in London (eu-west-2).
3. Cloudflare Durable Object jurisdiction restriction (only random request IDs are stored there).
4. Self-host the face-model files to remove jsDelivr and Google Cloud Storage requests.

Record the final position in the privacy policy (§6 placeholder), the ROPA and the customer DPA sub-processor annex.
