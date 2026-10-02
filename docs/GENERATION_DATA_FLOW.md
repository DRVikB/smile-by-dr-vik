# Generation data-flow trace

> **2026-10-02 implementation update (not deployed):** Macro Stage 1 adds signed-in patient-case state in Supabase and binary patient media in the separate PRIVATE `patient-cases` bucket, with an account-isolated local cache/outbox. This supersedes earlier device-only descriptions for patient cases in this document. AI generation and the clinician reference library remain separate. See [the Stage 1 implementation report](CLOUD_PATIENT_SYNC_STAGE1_2026-10-02.md). Provider contracts, region, backup retention and professional approvals are not verified by this implementation.


Traced from the code (2026-09-27; Case Library references added 2026-09-28). Each step lists what data exists, where, and for how long.

**Case Library references (2026-09-28).** After step 12 (reserve), if `settings.libraryStyle` is true, the Worker lists the authenticated user's `reference_cases`, runs `findMatchingStyleReferences` (material → teeth → count → conditions → recency; validation-only cases excluded), downloads the matching `reference.jpg` smile crops (only paths under `{user_id}/`) from private Supabase Storage with the service role, and appends them to the provider request after the patient photo, with prompt text that labels them STYLE REFERENCES (not patients to edit). The IDs are committed to `generation_ledger.reference_case_ids`; the response returns `styleReferencesUsed {count, caseIds}`. Any `styleReferences` sent by the app are ignored when accounts are enforced. Nothing is sent when the option is off or nothing matches.

```
Device (WebView)                    Cloudflare Worker                   Google              Supabase / RevenueCat
────────────────                    ─────────────────                   ──────              ─────────────────────
1 capture / PHPicker
  → temp file (iOS) → released
2 IndexedDB case (device only)
3 upload-authority confirm ───────────────────────────────────────────────────────────────▶ consent_records (random case ID)
4 AI-processing confirm (local)
5 POST /api/generate-smile ───────▶ 6 content checks, origin, schema
  (TLS; Bearer JWT; consent hdr;     7 provider data-terms gate
   X-Smile-Request-Id; images,       8 consent header check
   settings, notes, random caseId)   9 request-ID claim (DO, 24 h) 
                                    10 authenticate (+aal2 if MFA) ──────────────────────▶ auth.getUser
                                    11 entitlement ──────────────────────────────────────▶ RevenueCat REST / access_overrides
                                    12 reserve (row lock, rate limit) ───────────────────▶ generation_reservations, ledger
                                    13 record ai_processing ─────────────────────────────▶ consent_records
                                    14 strip caseId (+style refs if off)
                                    15 generateContent ──────────────▶ 16 process, abuse log
                                    17 ◀────────────── image ─────────
                                    18 commit / release ─────────────────────────────────▶ ledger (no content)
19 ◀── image (no-store) ────────────
20 face lock + edit-mask protection on device
21 result saved to IndexedDB (device only)
```

## Step notes

| Step | Data | Location and lifetime | Control |
|---|---|---|---|
| 1 | Original photo | iOS temp `picked-photos/`; deleted by `releasePhoto` after reading. Camera capture via the WebView file input | `PhotoPickerPlugin.swift` |
| 2 | Photo, case ref, settings | IndexedDB, until deleted; excluded from iCloud/backup | `AppDelegate.swift`, `localData.ts` |
| 3 | Confirmation | Local state plus a server consent record (random case ID) when signed in | `PhotoUploader.tsx`, `handleConsents` |
| 5 | Request body | TLS 1.2+ in transit. The body holds images as base64 data URLs | `smileImageService.ts` |
| 6–8 | — | Refused before any provider call if a check fails | `handler.ts` |
| 9 | Random request ID and timestamp | Durable Object, deleted by an alarm after 24 h | `cloudflare-worker.ts` |
| 10–13 | User ID, entitlement, reservation | Supabase (controller data); RevenueCat lookup by UUID | `src/server/*` |
| 14 | — | Provider input has no case ID, email, user ID or billing data (tested) | `tests/accounts.test.ts` |
| 15–16 | Photo(s), prompt | Google; retention per [SUBPROCESSORS.md](SUBPROCESSORS.md) | Data-terms gate |
| 17–19 | Generated image | Worker memory only; response `Cache-Control: no-store` | — |
| 20–21 | Result | Device only | — |

## Residual exposure points

- **App Switcher snapshot:** covered by the privacy view in `SceneDelegate.sceneWillResignActive`. Not yet verified on a device (see [SECURITY_REVIEW.md](SECURITY_REVIEW.md)).
- **Share sheet exports:** once the clinician shares a report or image, the destination app controls it. Exports carry the disclaimer.
- **WebView caches:** image data URLs are not fetched over HTTP, so they do not enter the HTTP cache. WebKit keeps IndexedDB under `Library/WebKit`, which is excluded from backups.
- **Memory:** photos exist in WebView and Worker memory during processing. This is not persisted.
- **Cloudflare edge:** TLS terminates at Cloudflare, which processes request bodies in memory. Cloudflare operational logs cover request metadata, not bodies. Worker Logs are off.
- **Web version:** browser storage is not excluded from backups or browser sync the way it is on iOS. Recommend the iOS app for patient data, or document this for customers.
