# Case Library — style references

The **Case Library** is the clinician's own finished bonding and porcelain work, kept as private style references so new designs can follow their contour, texture and finish. It is separate from **Cases** (patient cases on the device, the Home "Cases" button) in data model, UI, navigation and wording.

Status: implemented and tested (2026-09-28). Requires the migration `supabase/migrations/20260928140000_case_library_avatars.sql` and a **DPIA re-review** before release ([docs/DPIA.md §2a](docs/DPIA.md)).

## Existing code reused

- `src/components/CaseLibrary.tsx` (the old web library: materials Single shade / Layered / Porcelain, optional label, "Add finished cases", image-quality tip, pinning, validation, import/export). Its material set, label rules, quality guidance and on-device store (`src/lib/caseLibrary.ts`, IndexedDB `smile-case-library`) are kept. It remains available only in builds **without accounts** (local development) as "Pinning, validation and import tools (this device)".
- `CaseFeatures` (starting conditions), `upperTeeth` presets, `preparePhoto`, on-device face landmarks (smile crop), account/auth/consent plumbing. No second account, storage, case or auth system was added.

## Data model

| Table / bucket | Contents | Access |
|---|---|---|
| `reference_cases` | id, user_id, label (≤80), material (`Single-shade composite` / `Layered composite` / `Porcelain`), teeth_treated, starting_conditions, style_tags, validation_only, timestamps | RLS: select own; no client writes (server only) |
| `reference_case_images` | kind `original` / `reference`, storage_path (must start with the owner's id), bytes, width, height | RLS: select own; no client writes |
| Storage `case-library` (private, 10 MB, JPEG) | `{user_id}/{case_id}/original.jpg` (≤2048 px) and `reference.jpg` (smile-region crop ≤1280 px) | Storage policies: owner can read/delete own folder; uploads only via the server |
| `consent_records` type `case_library_authority` | the one-time authority confirmation, version `case-library-authority-v1`, timestamp | own |
| `generation_ledger.reference_case_ids` | which cases a generation used (filtered to the owner's cases in `commit_generation`) | own |
| `style_feedback` | optional "Does this reflect your style?" Yes / Not quite per request | own |

Storage used is added to `storage_used_bytes` (`adjust_storage_usage`, service role only). The profile photo is not counted.

## Flows

- **Add** (`POST /api/case-library`): the device prepares a downscaled original and a smile-region crop (`src/lib/referenceImages.ts`, face landmarks → 16:10 box at 1.8 × lip width; falls back to the downscaled photo). First upload returns `428 authority_required` until the clinician confirms `CASE_LIBRARY_AUTHORITY_TEXT`; the app asks once, then uploads. Max 200 cases. Stored objects are removed if the row insert fails.
- **List** (`GET /api/case-library`): rows plus 10-minute signed URLs to the owner's own images, count, bytes and whether authority is confirmed.
- **Edit tags** (`/api/case-library/update`), **Remove** (`/api/case-library/delete`: deletes rows and both images, adjusts storage), **Feedback** (`/api/case-library/feedback`).
- **Account deletion** removes every object under the user's folders first and fails closed (503) if storage deletion fails; rows cascade.
- **Export**: `export_account_data` includes Case Library metadata (with image records) and style feedback.

## Gemini style-reference integration

References are **actually sent** with relevant generations; selection happens **on the server** (`src/lib/generation/handler.ts` → `selectStyleReferences` in `src/server/caseLibraryHandlers.ts`):

1. If `settings.libraryStyle` is true and the request is authenticated, list the user's `reference_cases`.
2. `findMatchingStyleReferences` picks the best matches (below), up to `STYLE_REFERENCE_LIMIT` (env, 1–5, default 3; hard cap `MAX_STYLE_REFERENCE_LIMIT` = 5 in providers and prompt).
3. Download each match's `reference.jpg` (only paths under `{user_id}/`) and pass them to the provider after the patient photo.
4. The prompt separates **SOURCE PATIENT** (the first image, the only one to edit) from **STYLE REFERENCES** (finished cases by this clinician: follow contour, texture, emergence profile and optical finish; never copy tooth positions, gum levels, identities, facial anatomy, gingival architecture or backgrounds).
5. `reference_case_ids` are committed with the generation; the response carries `styleReferencesUsed {count, caseIds}`.

When accounts are enforced, any `styleReferences` sent by the app are **ignored** — the browser cannot build the provider's image payload. With the option off, or no close match, nothing is sent and generation proceeds normally. There is no training, fine-tuning, training dataset or provider feedback dataset.

## Matching logic (`src/lib/styleMatching.ts`)

Priority: material → treatment region → number of teeth → starting condition → recency.

- Material is required: the technique must match (legacy generic "Composite" pools both composites, never porcelain). Score 100 (80 for generic Composite).
- Teeth: if both sides are known and nothing overlaps, the case is excluded; otherwise +30 × Jaccard overlap and +10 × count similarity.
- Starting conditions: +10 per shared condition (max 3).
- Recency breaks ties. Validation-only (held-out) cases are never used. Unknown tags neither help nor exclude.

The same function runs on the device for the Compose preview ("Case Library · 3 matching references") so the count matches what the server will do (the server's limit is configurable; the preview uses the default 3).

## UI

- **Onboarding** — "YOUR STYLE" step after How It Works: "Make SmileCompose look like you." with the cases → SMILECOMPOSE → new patient design visual; "Add My Finished Cases" / "I’ll do this later"; success "Your style library is ready — N reference cases added — Continue". Shown when signed in (or in builds without accounts); skipped for existing users. Ready copy: "Your workspace and style library are ready." or "You can add your finished work to Case Library anytime."
- **Case Library view** (`src/components/caseLibrary/`) — iPhone: native list with "+ Add Finished Case" and STYLE REFERENCES rows, material filter. iPad: sidebar filters (All / Composite / Porcelain with counts, + Add Case) beside a grid; detail page with image and tag editing, Remove with confirmation. Empty state "Build your style library…" with "The best references are well-lit, straight-on close-ups." First success: "Added to your Case Library — SmileCompose can now use this case as a reference for relevant designs."
- **Compose** — "Your style": "Case Library · N matching references [View]", "Use my Case Library" switch (on by default), "No close style match found" when nothing matches, empty invite "Make results more like your own work [Add Cases]". Result: "N Case Library references were used" and optional "Does this reflect your style? Yes / Not quite".
- **Settings** — "Cases" (patient cases, renamed from the old "Case library") and a new "Case Library" section: Style references N cases, Storage, Manage Case Library, Add Finished Case, privacy footer.
- Discoverability is limited to onboarding, Settings and Compose (the design-screen "Library" button was removed; no Home button).

## Privacy

Case Library images are treated as identifiable health data: private storage, owner-only RLS, authority confirmation, deletion, export, and honest disclosure that references **are** sent for AI processing (privacy policy §3, the pre-generation notice, the authority text and the Case Library footers). Labels are never sent to the AI provider and carry "no patient names" guidance. Signed URLs and image data are never logged. In-app copy doesn't name the hosting or AI vendor (owner instruction); the internal subprocessor list does.

## Tests

- `tests/case-library-server.test.ts` (11): authority + private paths; validation; cross-user isolation (list/edit/delete); edit/delete cleanup; matching rules; **CRITICAL: relevant Case Library references are actually included in the outbound Gemini request** (inspects the provider HTTP body: patient image first, then the matching smile crops, prompt wording, ledger IDs); option off / no match sends none; only the authenticated user's references can be selected; no private URLs or image data in logs; plus the avatar and deletion tests.
- `tests/database.test.ts` (PGlite with a Storage stub): private buckets; Case Library RLS and storage policies across two users; `commit_generation` filters other users' IDs; consent and export; `adjust_storage_usage` denied to users; cascade on user deletion.
- `tests/accounts.test.ts`: with accounts enforced, style images sent by the client are never forwarded.
- `tests/onboarding-profile.test.ts`: the YOUR STYLE step order and skip rules.
- Browser QA against a mock API (iPhone and iPad, Light and Dark): onboarding add flow with authority confirmation, list/filter/detail/edit/remove, Compose states, generation with server-chosen references (the app sent 0 style images) and the feedback prompt.

## Remaining

- DPIA re-review, including the default-on decision (R8); customer DPA and practice notice to cover storage of Case Library images; retention decision.
- App Store privacy details: declare Photos (linked to the user, App Functionality).
- Run the migration on staging and test against real Supabase Storage (tests use a stub).
- Multi-select in the native iOS picker (it currently adds one photo at a time; the web picker allows several).
