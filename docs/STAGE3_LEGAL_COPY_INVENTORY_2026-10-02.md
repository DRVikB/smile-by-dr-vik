# Stage 3 — exact legal placeholders and stale copy

Audited 2 October 2026. This inventory flags unresolved decisions and obsolete descriptions; it does not supply legal answers. No legal flags were auto-approved. Remote activation is deferred.

## Exact rendered unresolved elements

The checker counts every literal `data-required`, including one CSS selector per page. Its 23/17 figures correspond to 22/16 actual marked elements below. Repeated contact details and review banners are included. Filling identity variables alone will not complete professional review.

### Privacy (22 marked elements)

1. REQUIRES SOLICITOR/DPO REVIEW. This privacy information describes how SmileCompose works today; items in highlighted brackets are awaiting owner or legal decisions.
2. [LEGAL ENTITY NAME — OWNER DECISION REQUIRED]
3. [REGISTERED ADDRESS — OWNER DECISION REQUIRED]
4. [ICO registration number, if applicable — OWNER DECISION REQUIRED]
5. [PRIVACY CONTACT EMAIL — OWNER DECISION REQUIRED]
6. [Controller/processor roles — REQUIRES LEGAL REVIEW]
7. [Current AI provider, service tier, processing region and retention (kept in the internal subprocessor list) — OWNER DECISION REQUIRED]
8. [Minor-patient policy — LEGAL / DPIA DECISION REQUIRED]
9. [Lawful basis for account administration — REQUIRES LEGAL REVIEW]
10. [Lawful basis for personalisation — REQUIRES LEGAL REVIEW]
11. [Lawful basis for profile photo — REQUIRES LEGAL REVIEW]
12. [Lawful basis for subscriptions — REQUIRES LEGAL REVIEW]
13. [Lawful basis for usage accounting — REQUIRES LEGAL REVIEW]
14. [Lawful basis for accountability records — REQUIRES LEGAL REVIEW]
15. [Lawful basis for security monitoring — REQUIRES LEGAL REVIEW]
16. [Lawful basis for support — REQUIRES LEGAL REVIEW]
17. [Article 9 condition(s) relied on for any SmileCompose processing — REQUIRES LEGAL REVIEW]
18. [Email delivery provider — OWNER DECISION REQUIRED]
19. [Transfer mechanisms (UK adequacy regulations / UK–US data bridge, IDTA or Addendum) for each provider — REQUIRES LEGAL REVIEW]
20. [security log retention period — OWNER DECISION REQUIRED]
21. [Backup purge windows — OWNER DECISION REQUIRED]
22. [PRIVACY CONTACT EMAIL — OWNER DECISION REQUIRED]

### Terms (16 marked elements)

1. LEGAL REVIEW REQUIRED. This is a structural draft, not final terms. It must be completed and approved by a solicitor before commercial launch.
2. [LEGAL ENTITY NAME — OWNER DECISION REQUIRED]
3. [REGISTERED ADDRESS — OWNER DECISION REQUIRED]
4. [Contract formation and acceptance wording — LEGAL REVIEW REQUIRED]
5. [Eligibility, professional registration and account-sharing rules — LEGAL REVIEW REQUIRED]
6. [Clinical responsibility and reliance wording — LEGAL REVIEW REQUIRED]
7. [Minor-patient policy — LEGAL / DPIA DECISION REQUIRED]
8. [Customer Data Processing Agreement (Article 28) reference — LEGAL REVIEW REQUIRED]
9. [Full acceptable-use terms and suspension rights — LEGAL REVIEW REQUIRED]
10. [Plan terms, allowance changes and fair-use wording — LEGAL REVIEW REQUIRED]
11. [Service levels, changes and withdrawal of features — LEGAL REVIEW REQUIRED]
12. [Ownership of the software, customer content and generated images; licence terms — LEGAL REVIEW REQUIRED]
13. [Warranty disclaimers, limitation of liability and consumer/professional law carve-outs — LEGAL REVIEW REQUIRED]
14. [Termination rights and effect of termination — LEGAL REVIEW REQUIRED]
15. [Governing law, jurisdiction and dispute resolution — LEGAL REVIEW REQUIRED]
16. [CONTACT EMAIL — OWNER DECISION REQUIRED]

## Exact old wording requiring review/update

The signed-in patient-case pipeline now includes a private cloud database/media bucket and account-isolated cache/outbox. Statements that all cases/photos stay only on device are no longer accurate. The Stage 1 update banner in some documents does not remove the contradictory older table rows. Treat those older documents as historical, not approved launch disclosures.

- `src/components/onboarding/Onboarding.tsx:225` — `<p className="ob-copy">Keep your subscription and generation allowance with you on iPhone, iPad and the web. Patient cases stay securely on this device.</p>`

- `src/components/onboarding/Onboarding.tsx:304` — `<p className="ob-copy">From capture to consultation, in one seamless workflow. Patient photos stay on this device until you choose to generate.</p>`

- `src/app/page.tsx:1272` — `<p id="patient-name-hint" className="control-hint">Stays on this device. Use initials or a practice reference — not full names, dates of birth, NHS numbers or contact details.{testMode && <b> Test mode.</b>}</p>`

- `src/components/settings/SubscriptionSettings.tsx:96` — `{entitlement?.subscriptionStatus === "expired" && <p className="control-hint">Your saved cases stay on this device and remain available.</p>}`

- `src/lib/caseLog.ts:175` — `/** Move to Recently Deleted. Photos stay on this device until the window ends or the user deletes permanently. */`

- `APP_STORE_SUBMISSION.md:11` — `| 2.5.2 Self-contained | No downloaded executable code | ✓ App code is bundled. The on-device face model (WASM) is fetched by WebKit, which 2.5.2 permits. |`

- `APP_STORE_SUBMISSION.md:38` — `| User Content → Photos or Videos | Patient photo sent to generate a visualisation | Processed by Google Gemini, not stored by SmileCompose |`

- `APP_STORE_SUBMISSION.md:49` — `> **Live AI generation:** sign in with the demo account below (it has complimentary Pro access granted server-side), take or choose a photo of an adult smile, and confirm the AI-processing notice. Photos are processed by Google Gemini and are not stored by us. You may also purchase with a sandbox account.`

- `APP_STORE_PRIVACY_READINESS.md:11` — `- **Update 2026-09-28:** signed in, the Case Library (the clinician's finished-case photos used as style references) and the optional profile photo are stored in the clinician's SmileCompose account (private Supabase Storage). App Store privacy details must now declare **Photos or Videos — collected, linked to the user, App Functionality (not tracking)**. The patient case log stays on the device.`

- `APP_STORE_PRIVACY_READINESS.md:12` — `- These stores are local to the app's browser origin; no app feature uploads the case log. (Builds without accounts keep the reference library on the device.) They are not app-level encrypted, have no automatic expiry, and browser/site-data deletion removes them. The UI supports deleting individual or all cases in each relevant library. There is no single verified “erase every local record” control.`

- `APP_STORE_PRIVACY_READINESS.md:22` — `1. Keep case records, images, references, preferences and review notes in an on-device database. Never upload or sync the case library. Do not add analytics, ad tracking, crash attachments or photo-bearing diagnostics.`

- `APP_STORE_PRIVACY_READINESS.md:26` — `5. If external AI stays enabled, describe the product as local case storage plus disclosed, transient third-party processing—not “on-device AI,” “no data leaves your device,” or “zero retention.” Confirm the Cloudflare and Google contracts, subprocessors, regions, transfer safeguards, deletion/retention terms, and whether an enterprise/Vertex AI arrangement is required. Google describes Vertex AI as the option when guaranteed zero retention or enterprise data-processing terms are required; verify the exact model and terms before choosing it.`

- `APP_STORE_PRIVACY_READINESS.md:39` — `- Confirmed product direction: local case persistence with Google Gemini processing only after a case-specific clinician confirmation.`

- `docs/DATA_INVENTORY.md:14` — `| Patient photograph (smile / face) | Device: IndexedDB `smile-temporary-case`, `smile-case-log` | Camera or system photo picker (no Photo Library permission) | Cloudflare Worker (transit) → Google (only when **Generate** is confirmed) | Until the clinician deletes the case, the device data or the app. Deleted cases stay in Recently Deleted (on the device) for `RECENTLY_DELETED_DAYS` (30) then are purged | `src/lib/storage.ts`, `src/lib/caseLog.ts`, `src/components/PhotoUploader.tsx` |`

- `docs/DATA_INVENTORY.md:21` — `| Generated visualisation and before/after report | Device | Google response | Returned to the device only | As above | `src/lib/caseLog.ts` |`

- `docs/DATA_INVENTORY.md:22` — `| Patient reference ("Case ref.", max 24 characters; initials recommended) | Device only | Clinician | **Not sent** to the server or Google | As above | `src/app/page.tsx` |`

- `docs/DATA_INVENTORY.md:26` — `| Face landmarks, face lock and edit mask (derived on the device) | Device | On-device MediaPipe (model files from jsDelivr / Google Cloud Storage; no image is uploaded) | Not sent. Only numeric framing/bounds coordinates go with the request | Stored with the case | `src/lib/face/`, `src/lib/editMask.ts` |`

- `docs/DATA_INVENTORY.md:30` — `In the iOS app, `Library/WebKit` (which holds IndexedDB) is excluded from iCloud and device backups (`AppDelegate.swift`). Data is protected by iOS Data Protection (default class: protected until first unlock). There is no app-level encryption beyond iOS Data Protection.`

- `docs/DATA_INVENTORY.md:39` — `| Storage accounting (`used_bytes`, `limit_bytes`) | `public.storage_accounts` | Future account-held files. V1: no rows (no cloud patient storage) | While the account exists | Yes (cascade) |`

- `docs/DPIA.md:27` — `1. The clinician captures or selects a patient photo. It is stored only on the device (IndexedDB, excluded from backups on iOS).`

- `docs/DPIA.md:32` — `6. The image comes back to the device. The server stores no image. It records a ledger entry with no content (random case ID, model, prompt version, treatment type, outcome).`

- `docs/DPIA.md:82` — `| R4 | Account takeover leading to misuse of the allowance (no patient data server-side) | Possible × Minimal | Supabase auth, optional TOTP MFA enforced server-side, rate limits, audit log | Enable leaked-password protection in Supabase; consider requiring MFA | Remote × Minimal |`

- `docs/DPIA.md:87` — `| R9 | Breach at a processor (Supabase, RevenueCat, Cloudflare) | Remote × Significant | Only Case Library images and profile photos are held (Supabase Storage, private, RLS); signed URLs expire (10 min / 1 h) and are never logged; service-role key server-only | Incident procedure, processor notification terms; review Supabase storage encryption and region | Remote × Significant |`

- `docs/SECURITY_REVIEW.md:46` — `| 14 | Session tokens in the Keychain (this device only), wiped on reinstall | PARTIAL | Adapter unit test, Swift builds, plugin registered. The on-device Keychain round-trip is NOT VERIFIED (accounts are not configured in this build) |`

- `docs/SECURITY_REVIEW.md:51` — `| 19 | Content-Security-Policy | PARTIAL | `connect-src` allow-list, `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors`. **No `script-src` restriction** (the Next.js inline bootstrap would need nonces or hashes). XSS defence relies on React escaping. Legal pages have a strict `default-src 'none'` |`

- `docs/SECURITY_REVIEW.md:55` — `| 23 | Cloud storage buckets private, signed URLs, storage tenant isolation | NOT APPLICABLE | V1 has no cloud patient storage |`

- `ios/App/App/PrivacyInfo.xcprivacy:10` — `go via the SmileCompose backend to its AI image provider; not stored by the`

- `src/legal/privacyPolicy.ts:39` — `<li><strong>Face protection.</strong> The automatic face-protection step runs on the device. Its model files are downloaded from content delivery networks; no photograph is sent to them.</li>`

## Factual boundaries for the update

- Distinguish on-device capture/cache/unsynced edits from signed-in private cloud case sync, and both from separately consented external AI processing. Do not claim zero cloud/zero retention.
- Patient reference/notes/settings/assets may sync to the account even when not sent to the AI provider. Provider payload minimisation is not equivalent to no server storage.
- Account deletion, permanent case deletion, Recently Deleted, local clearing and cache eviction have different effects; retention/backup purge windows need owner/provider review.
- Stage 2 bundles face/SlimSAM/HEIC runtime assets locally and requests Complete Data Protection. Correct old CDN/protection descriptions, while retaining hardware-validation limitations.
- App Privacy answers/manifest explanatory copy, onboarding, Terms/Privacy, DPIA, inventory, security/data flow, customer DPA and submission notes must agree before release. No claim of approved contracts, region/encryption details or medical-device classification is made here.

## Internal beta and release guard

These placeholders are not native compilation errors, but this project explicitly blocks `SMILE_RELEASE_BUILD=1` while they remain. The tested guard also rejects the RevenueCat `test_…` key. No bypass was added. Internal TestFlight is distinct from public App Store review; it does not remove duties around any patient data or substantiate cosmetic/clinical accuracy. Refer to the Stage 3 handover for the remaining manual workflow.
