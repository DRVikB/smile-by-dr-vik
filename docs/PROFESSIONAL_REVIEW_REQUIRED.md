# Professional review and owner decisions required

Engineering cannot resolve these items. Each has an owner type. Release builds (`npm run ios:release`) stay blocked while the generated legal pages contain unresolved `data-required` items.

## A. Owner business actions (manual; do not automate)

| # | Action | Where it lands |
|---|---|---|
| A1 | Confirm the legal entity: name, registered address, company number | `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `…_ADDRESS`, `NEXT_PUBLIC_LEGAL_COMPANY_NUMBER` |
| A2 | Check whether the ICO data protection fee is due; register or pay **manually** at ico.org.uk; record the number | `NEXT_PUBLIC_ICO_REGISTRATION_NUMBER` |
| A3 | Set up a privacy contact mailbox (not a personal address) | `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` |
| A4 | Appoint a privacy lead and an incident lead; decide whether a DPO is required (large-scale special category processing may require one) | `INCIDENT_RESPONSE.md`, `DPIA.md` |
| A5 | Google: link Cloud Billing (paid tier) or set up Vertex AI; accept the Cloud DPA; turn AI Studio logging off; restrict the key; **then** set `SMILE_GEMINI_DATA_TERMS` | `SUBPROCESSORS.md` checklist |
| A6 | Accept or sign the DPAs with Cloudflare, Supabase and RevenueCat; choose the Supabase region; choose the email/SMTP provider; file the evidence | `SUBPROCESSORS.md` |
| A7 | Decide the retention periods; schedule the purge jobs | `DATA_RETENTION.md` |
| A8 | Confirm the provenance and consent of all images in the repository and app: `Claude outputs/smile_test_result.png` (tracked in git; a photorealistic face), `public/demo-*.png`, the landing hero image, test-mode samples, App Store screenshots | Remove any real patient image from the repo **and its history** if consent is not documented |
| A9 | Configure Supabase hardening (MFA, leaked passwords, password length 10, SMTP), Cloudflare MFA, and least-privilege access | `SECURITY.md` |
| A10 | Provision staging with synthetic data only | `SECURITY.md` |
| A11 | Complete App Store Connect: App Privacy answers, privacy policy URL, age rating, review notes, screenshots | `APP_STORE_SUBMISSION.md` |
| A12 | Decide on library style for V1: keep (off by default), restrict, or remove | `DPIA.md` R8 |

## B. Solicitor / DPO review

| # | Item | File |
|---|---|---|
| B1 | Controller/processor roles, including sole-trader clinicians | `DATA_ROLE_MAP.md` |
| B2 | Lawful bases (Art. 6), Art. 9 conditions, legitimate interests assessments | `LAWFUL_BASIS_REGISTER.md` |
| B3 | DPIA approval: **FINAL LEGAL/PRIVACY SIGN-OFF REQUIRED**; decide whether ICO prior consultation is needed | `DPIA.md` |
| B4 | Privacy policy text, then set `LEGAL_REVIEW_COMPLETE.privacy = true` | `src/legal/privacyPolicy.ts` |
| B5 | Terms of Service: warranties, liability, IP, termination, governing law. **LEGAL REVIEW REQUIRED**. Then set `LEGAL_REVIEW_COMPLETE.terms = true` | `src/legal/termsOfService.ts` |
| B6 | Customer DPA (Art. 28) drafting, the sub-processor annex, and an acceptance flow (`customer_dpa` consent type ready) | `CUSTOMER_DPA_REQUIREMENTS.md` |
| B7 | International transfer mechanisms and TRAs | `INTERNATIONAL_TRANSFERS.md` |
| B8 | Minor patients: stay adults-only (`MINOR_PATIENTS_PERMITTED = false`) or permit with safeguards | `src/config/legal.ts` |
| B9 | PECR conclusion (no consent banner needed) | `TRACKING_AND_COOKIES.md` |
| B10 | Whether facial photographs are biometric data here | `LAWFUL_BASIS_REGISTER.md` |
| B11 | DSAR templates and the patient-redirect approach | `DATA_SUBJECT_REQUESTS.md` |
| B12 | Upload-authority and AI-processing wording in the app | `src/config/legal.ts`, `src/lib/aiConsent.ts` |

## C. Medical device regulatory review

| # | Item | File |
|---|---|---|
| C1 | Confirm the intended-purpose statement and whether SmileCompose is a medical device under UK MDR 2002 | `MEDICAL_DEVICE_BOUNDARY.md` |
| C2 | Assess the boundary-pressure features (tooth plans, bite context, face/smile analysis, result checks) | same |
| C3 | Approve the App Store description and marketing claims against the claims checklist | same |
| C4 | Decide whether MHRA advice is needed before launch | same |
