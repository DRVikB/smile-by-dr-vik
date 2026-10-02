# SmileCompose V1 — local account isolation, Stage 1

Scope: account-aware local patient persistence only. Cloud patient-case upload/sync stays disabled. No patient tables, buckets, subscriptions, model instructions or generation settings were changed in this pass. Existing unrelated working-tree changes were preserved. This implementation is not deployed by this task.

## A. Architecture

Keep the existing IndexedDB stores and split them into owner namespaces. Account identity is the authenticated Supabase user ID. An immutable workspace lease contains the owner, namespace, session epoch and cancellation signal. Bound stores/repositories check the lease before work, after opening a database, and before returning an asynchronous result.

- Account: `<existing database>:v1:account:<encoded Supabase user ID>`.
- New unsigned data: `<existing database>:v1:unowned`, explicitly unowned and never assigned on sign-in.
- Original unsuffixed databases: legacy/unowned. Read only through explicit authenticated migration in the app; originals are retained.
- Demonstrations: the app repository does not write demo/mock generations or demo drafts into patient caches. They remain available in the current UI session. Low-level compatibility helpers remain for existing fixtures/tools; production patient screens use bound repositories.

Namespacing covers every structured-clone field in saved entries, saved media and the draft: photographs, concepts, Tooth Map, settings, reference selection, variants, costs, consent, review, favourite flags and report/export history. Analysis images that are computed rather than persisted stay transient. No parallel storage backend was introduced.

## B. Files changed in this Stage 1 pass

New:

- `src/lib/workspace.ts`
- `src/services/cases/legacyImport.ts`
- `src/components/settings/LegacyCaseImport.tsx`
- `tests/account-isolation.test.ts`
- this report

Modified:

- Persistence: `src/lib/storage.ts`, `src/lib/caseLog.ts`, `src/lib/caseLibrary.ts`, `src/lib/validation.ts`, `src/lib/localData.ts`, `src/lib/dataExport.ts`, `src/services/cases/caseRepository.ts`.
- Session/providers: `src/components/account/AccountProvider.tsx`, `src/components/caseLibrary/CaseLibraryProvider.tsx`.
- Patient UI bindings: `src/app/page.tsx`, `src/components/CaseLog.tsx`, `src/components/home/HomeWorkspace.tsx`, `src/components/onboarding/Onboarding.tsx`, `src/components/settings/CasesSettings.tsx`, `src/components/settings/PrivacySettings.tsx`, `src/components/share/ShareSheet.tsx`.
- Device reference/validation bindings: `src/components/CaseLibrary.tsx`, `src/components/LibraryCaseDetails.tsx`, `src/components/ValidationPanel.tsx`.
- Memory cleanup/cancellation: `src/lib/face/landmarks.ts`, `src/lib/toothMap/debug.ts`, `src/lib/toothMap/detect.ts`, `src/lib/referenceImages.ts`, `src/components/SmileGuides.tsx`, `src/components/EditArea.tsx`, `src/components/RevealVideoSheet.tsx`.

Several listed files already contained earlier uncommitted work. This report describes only this pass's additions.

## C. IndexedDB changes

Original databases and their versions are unchanged and recoverable. Namespaced draft/library/validation databases retain version 1 and existing object-store shapes. Namespaced case logs use version 2: the existing `entries` and `media` stores plus an `imports` receipt store. Upgrade creates only missing stores, preserving existing records. Receipts survive deletion of individual imported versions so reimport cannot resurrect a version intentionally deleted from its account. Draft receipts are additional keys in the existing draft store; `current` remains the draft key.

Database connections close on `versionchange`. Blocked deletion does not resolve until IndexedDB reports success or error. Reset and deletion invalidate queued work first. Draft write queues are independent per namespace.

## D. CaseRepository

`createCaseRepository(lease)` now binds the saved-case lifecycle, media reads, review/export updates, case assembly and current-draft operations to one session. `getCaseRepository()` caches only the current lease's repository. Patient screens retain that repository for their mounted workspace, avoiding owner lookup after delayed thumbnail/report work. Compatibility low-level exports capture the current namespace at invocation; nested operations remain bound to that same namespace.

Direct patient calls in the page, Cases, home summaries, onboarding, settings and share/report history were migrated. Local reference/validation tools use their own bound factories, maintaining separation from patient cases.

## E. Account switching

Auth callbacks activate the incoming owner synchronously, abort the previous lease, clear sensitive shared caches and commit a keyed provider subtree with the new user. That remount removes the loaded patient case, summaries/thumbnails, comparison images, Tooth Map working state, report draft and account-specific reference state together. Account status/profile responses also have session guards. The incoming tree reads only the incoming namespace.

Reset/deletion invalidation also replaces the subtree, preventing old in-memory photos from being autosaved back after deletion.

## F. Logout

Logout detaches the workspace before awaiting provider work, clears the active account/status and aborts sensitive work. Signed-out access uses the unowned namespace; it cannot open an account's cache. Account caches are retained for the same account's next sign-in. Authentication UI is guarded during logout. Optional account-deletion cache removal targets only that account; the separately labelled device-wide erase remains explicitly device-wide.

## G. Legacy migration

Settings → Cases → **Cases saved on this device** opens the explicit authenticated migration list. Nothing is silently assigned. No items are preselected. **Import existing cases into this account** copies only selected patient cases.

- Original case/version IDs and complete stored entry/media objects are retained, including preferences, reviews, reports, export history and favourites.
- Each version and its receipt are committed atomically, then a newly copied version is read back and compared with the source.
- Retry resumes missing versions; duplicate selection/repeated import does not duplicate or overwrite edited imported versions.
- Demo versions are excluded; mixed groups can still import their real patient versions.
- A current photo-only draft is copied with a receipt. An existing target draft is never overwritten; finish/reset it first.
- An ID collision or missing photograph stops safely with originals retained.
- Legacy originals are deliberately not deleted after import. Imported cases can be opened from Cases; reload to reopen an imported current draft.
- Existing unowned reference-library/validation databases remain recoverable and separate; patient migration does not upload or automatically assign reference photographs.

## H. Race protections and memory

- Immutable namespace + session epoch checks on stores and repository.
- Abort signal and synchronous patient-tree replacement on account change.
- Independent draft queues; stale queued saves fail rather than discovering a new owner.
- Reference-library refresh sequence tokens plus session checks; stale listings/errors/authority do not populate another session.
- Image preparation and reference mutations obtain tokens through the originating session; account switch stops the loop.
- Session guards on status, profile/avatar, consent, exports and deletion.
- Generation requests aborted; late processing/logging cannot write into an incoming workspace. Generation model behaviour is unchanged.
- Face landmark cache and Tooth Map debug/rough maps cleared; delayed imports check session/liveness before starting patient analysis; reusable non-sensitive models and application assets retained. Component cleanup cancels Tooth Map workers and revokes report/video object URLs. Report creation checks the lease before creating new object URLs, and external export actions check before sharing.

## I. Tests added

`tests/account-isolation.test.ts` adds 18 regressions, covering A → signed out → B → A; private thumbnails/media/reviews/reports and photo-only drafts; stale loads/queued writes; cancellation/cache cleanup; no automatic legacy assignment; selected migration preserving full records; interrupted/repeated migration; migration during switching; demo exclusion; draft collision; version-ID collision; explicit unowned migration; local references/validation separation; blocked/error deletion; scoped reset; account-only cache deletion.

Existing server reference-library ownership/RLS/API tests remain in the full suite.

Additional browser verification used the real AccountProvider and CaseLibraryProvider with simulated auth/API responses and synthetic sample cases in an isolated local browser origin. It checked synchronous visible detachment, a delayed Account A reference listing arriving during B's session, logout, A/B restoration, and reset without resurrection of a deleted draft. No real patient photos, accounts or provider credentials were used. This verifies the React provider boundary, not live Supabase authentication or physical iOS behaviour.

## J. Verification results

- Focused storage/account suite: **75/75 passed**.
- Full suite: **422/422 passed**.
- TypeScript (`npm run typecheck`): **passed**.
- ESLint (`npm run lint`): **passed**, no warnings.
- Production build (`npm run build`): **passed**.
- Browser provider boundary checks: **passed**.

The existing worker build emits a non-fatal Node module-type warning; it does not fail the build. No cloud patient-case deployment or sync was performed.

## K. Remaining limits

- This is app-level account isolation, not encryption of IndexedDB. Someone controlling the device/browser, developer tools or same-origin malicious code can inspect local data. OS device security and application security still matter.
- Legacy data cannot have its original owner inferred. Import is an explicit clinician responsibility; retaining the originals means authorised users can deliberately import those unowned cases, never automatically.
- Browser storage can be cleared/evicted and there is no cloud backup in this stage.
- Deletion remains pending while an older tab holds a blocking database connection; close that tab to allow completion. A browser without database enumeration fails device-wide erase explicitly rather than falsely reporting success.
- The code must be published and old installed clients updated before the change protects users of the hosted/native app. Real multi-account Supabase sessions and physical iPad/iPhone sign-out should be checked during release acceptance.

**ACCOUNT ISOLATION READY FOR V1: YES — for this local account-isolation foundation.** Cloud patient sync remains disabled; this is not a claim of a complete App Store/privacy release audit.
