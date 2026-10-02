# SmileCompose V1 — Macro Stage 1 implementation handover

Date: 2 October 2026.

**Implemented locally; not deployed.** No remote Supabase migration was applied,
no production Worker was published, and no real patient data was uploaded for
verification. The readiness statements below describe the implementation, not a
live cloud service. Remote staging activation and the physical-device checks in
section O are still required.

## A. Schema and migrations

Migration: `supabase/migrations/20261002093305_patient_case_sync.sql`.

- `patient_cases`: stable client UUID, owner, creation/update timestamps,
  revision, schema version, archive/delete timestamps, structured state and a
  separate small summary. Existing case and generated-version IDs survive sync.
- `patient_case_assets`: immutable asset UUID, owner/case, kind, private object
  path, MIME type, dimensions, byte size, SHA-256 checksum, provenance and upload
  status. Composite owner/case foreign keys prevent inconsistent ownership.
- `patient_case_mutations`: operation receipts, accepted revisions and payload
  hashes make retries idempotent. Reusing an operation ID for a different
  payload is rejected. Deletion scrubs prior clinical result snapshots from the
  receipts; tombstones and nonclinical retry receipts remain.
- `patient_case_cleanup_jobs`: durable object-deletion retries.
- Atomic mutation, upload-authorisation and upload-confirmation RPCs are
  restricted to the server service role. Case mutations use revision checks and
  transaction/advisory locks. State validation also runs inside PostgreSQL.
- The existing account-data export is extended with owner-scoped patient
  records. The complete existing migration chain was tested with the new
  migration using PGlite's PostgreSQL engine.

The existing `reference_cases`, `reference_case_images` and `case-library` bucket
remain a separate domain.

## B. Storage bucket

The migration declares **private** Supabase Storage bucket `patient-cases`.
Allowed binary types are JPEG, PNG, WebP and PDF; the per-asset limit is 25 MiB.

Object identity is immutable:

```text
<owner UUID>/<case UUID>/<asset UUID>/<lowercase asset kind>
```

Supported kinds include original, prepared, presentation, thumbnail, generated
concept, report, edit mask and case-associated reference media. The existing
Supabase `MediaStore` adapter is reused. No second storage provider is introduced.

Authenticated API access streams private bytes. This implementation does not
need signed access URLs; neither signed nor public patient-image URLs are stored
in case state. Confirmation verifies the stored SHA-256 checksum before state
can reference an asset. Upload retries never upsert existing objects.

## C. API

Next.js route: `src/app/api/patient-cases/[[...path]]/route.ts`.
Cloudflare/Sites routing uses the same handlers in
`src/server/patientCaseHandlers.ts` and store in
`src/server/patientCaseStore.ts`.

| Method and path | Behaviour |
| --- | --- |
| `GET /api/patient-cases` | Keyset-paginated summaries, revisions, timestamps, archive/delete status and thumbnail references; no image bytes. |
| `GET /api/patient-cases/:id` | Complete structured state and asset metadata; no base64. |
| `POST /api/patient-cases` | Stable client UUID, server-assigned authenticated owner, operation-ID deduplication. |
| `PATCH /api/patient-cases/:id` | Expected revision; one increment per accepted operation; stale edits return 409. |
| `DELETE /api/patient-cases/:id` | Revision-aware permanent deletion with a propagation tombstone. |
| `POST /api/patient-cases/:id/assets` | Strict metadata validation and server-derived immutable path. |
| `PUT /api/patient-cases/:id/assets/:assetId` | Authenticated binary upload, exact size/MIME/checksum validation and confirmation. |
| `GET /api/patient-cases/:id/assets/:assetId` | Authenticated confirmed-asset bytes; never public. |

All responses use `Cache-Control: no-store`. Binary responses also use
`X-Content-Type-Options: nosniff`. Streaming body limits prevent unbounded upload
or JSON buffering. Structured state rejects binary data URLs, blob URLs and
permanent HTTP(S) media URLs. API failures return a recoverable error while
keeping local work.

## D. CaseRepository changes

`src/services/cases/caseRepository.ts` remains the UI boundary. It saves the
working draft and log locally first, then creates a binary-backed sync snapshot.
There is no parallel patient-case UI or repository.

The snapshot preserves settings, selected teeth, confirmed map data, notes,
analysis, reviews, generation metadata, report metadata, export history and
stable version IDs. One case-level `preferredDesignId` tracks the preferred
concept; existing starring controls provide the minimal interaction.

Saved cases reopen for comparison and export with media loaded on demand. A
saved working draft can also reopen in the editor. Older entries without a full
working draft still support their saved comparison and export; an edit attempt
explains the missing draft rather than inventing one.

Photo-only drafts appear as drafts and can reopen across devices. Replacing a
conflicted active draft updates the editor before its next autosave. A remote
permanent deletion clears the open draft and returns the editor to the start
screen, avoiding accidental resurrection.

## E. Sync coordinator

`src/services/cases/sync/coordinator.ts` serialises local staging, orders outbox
dependencies, uploads media before committing references, and marks a case
synced only after acknowledgement of its latest queued local sequence.

`PatientSyncLifecycle` attaches it to the authenticated account and triggers on
launch, online/reconnect, browser page restore, foreground/visibility and native
app activation. Cached summaries are immediately available; cloud refresh runs
in the background. Edits queued while a refresh is in flight trigger another
drain rather than waiting for a future app launch.

Cloud summary refresh fetches complete structured state only for newer cases.
This contains metadata and asset IDs, not media bytes. Thumbnails load first;
full media loads when a case is opened. No permanent Sync button was added.

## F. Durable outbox and offline startup

Account-specific IndexedDB database:

```text
smile-patient-sync:v1:account:<user UUID>
```

It stores case snapshots, local asset blobs and outbox operations. Operations
include `CREATE_CASE`, `UPLOAD_ASSET`, `UPDATE_CASE` and `DELETE_CASE`, with account,
case, operation ID, dependencies, expected revision, local sequence, retry status,
attempt count and timestamps. Writes commit durably before network work.

Dependencies follow the queue's terminal operations, not IndexedDB's random UUID
ordering. This prevents an offline burst of edits from being sent out of order.
Interrupted operations resume idempotently. Pending media is protected from
eviction. Conflicts and nonretryable validation errors remain blocked and
preserved instead of continuously retrying.

The PWA now prepares a build-time public offline shell and an allowlist of hashed
application files and bundled illustrative assets. It **does not cache patient
API responses, private photographs, avatars, authenticated HTML or external
requests in a shared service-worker cache**. The native app retains its bundled
shell. An existing persisted session can identify its own local workspace while
offline; it never bypasses server token validation. A first-ever offline visit
without a prepared shell asks the user to reconnect.

## G. Conflicts

Two devices editing the same cloud revision cannot silently overwrite each other.
A 409 preserves local state and the competing cloud state, blocks that case's
queued operations and offers:

- **Use cloud version**: explicitly adopt cloud state and discard the superseded
  queued local operations.
- **Keep local as a separate case**: retain the local content under a new case
  UUID, duplicate/remap private asset references and generated-version IDs, and
  preserve the original cloud case.

No automatic merging of maps, notes, preferred concepts or reviewed reports
occurs. Active-editor state follows the chosen case. Media required to reopen
the choice is prepared before the conflicting state is discarded.

## H. Deletion

Moving an entry to Recently Deleted remains reversible case state. Permanent
deletion produces a revisioned cloud tombstone, clears clinical state/summary,
marks assets deleted and enqueues object cleanup. Other devices invalidate their
cached case media and active draft after learning the tombstone.

An offline edit of a permanently deleted case becomes a preserved conflict; it
cannot recreate the same deleted cloud UUID. Keeping that work requires an
explicit separate case. Failed object removal retains a retry job with backoff.
Ordinary authenticated activity retries cleanup. Account deletion also removes
the new bucket's owner-scoped media before deleting the account.

## I. Legacy migration

The existing **Cases saved on this device → Import existing cases** flow remains
explicit. No old case is silently assigned to an account.

Selected real cases keep case/version IDs, settings, maps, reviews and history.
Data URLs become binary assets and JSON references. Repeated source bytes are
deduplicated within each case/kind by checksum. Import receipts and stable IDs
allow interrupted imports to resume without duplicating cases or uploads.
Sample/demo entries are excluded. The original legacy database is retained for
recovery, including after cloud verification; this stage does not destroy it.

## J. Cache, media and analysis

The architecture supports original/prepared, presentation and thumbnail roles.
Existing prepared source images are honestly marked `legacy-prepared-original`
or `prepared`; they are not relabelled as untouched camera originals. A small
thumbnail is produced for photo-only drafts.

The binary cache targets **192 MiB**. Metadata and thumbnails remain inexpensive.
Only acknowledged, nonpending media is evictable; pending cases/uploads and the
active case are protected. The limit may therefore be exceeded for active or
unsynced work. Evicted synced media is fetched privately when needed again.

Confirmed Tooth Map data, coordinates, tooth IDs and confirmation state are
preserved as case metadata. A validated analysis snapshot stores the photo
fingerprint, dimensions, landmarks, derived analysis, capture time and algorithm
version `mediapipe-478-smile-analysis-v1`. Reopening a matching valid snapshot
seeds the existing face-analysis cache without rerunning model inference.
Invalid or incompatible snapshots are not trusted.

## K. Security protections

- Owner-only database reads via RLS; anonymous reads and direct client mutations
  are refused. Privileged mutation/authorisation RPCs are service-role only.
- Every server operation derives owner from validated authentication, including
  the existing MFA requirement. Service-role queries still explicitly filter
  owner, case and asset IDs.
- Composite ownership foreign keys, exact immutable path validation and
  confirmed-asset reference validation prevent cross-account attachment.
- Storage reads require an owned, confirmed asset in a live case. Upload policy
  requires an owned pending registration. Direct browser updates/deletes are
  disallowed.
- Body bounds, checksum verification, strict asset metadata and private no-store
  responses limit malformed or accidental media handling.
- Each repository/cache/outbox captures an account lease. Logout aborts requests,
  closes/inactivates that workspace and detaches listeners. A stale response
  cannot populate the next account's workspace.
- Offline user restoration identifies only an existing account's local cache;
  cloud access still requires a valid token. Guest/sample data is not synced.
- No new browser secret, public patient bucket, cloud base64 or permanently
  stored signed URL was introduced.

These are implementation protections tested locally, not a penetration-test
certification or legal approval. Existing professional-review release gates
remain in place.

## L. Tests

Final checks:

| Check | Result |
| --- | --- |
| Focused sync, repository, offline shell/session, local isolation and migration/storage/log tests | 123 passed, 0 failed |
| Full automated suite (`npm test`) | 489 passed, 0 failed, 0 skipped |
| TypeScript (`npm run typecheck`) | Passed |
| ESLint (`npm run lint`, zero warnings allowed) | Passed |
| `git diff --check` | Passed |

New test groups include `patient-sync.test.ts`, `patient-repository.test.ts`,
`offline-shell.test.ts` and `offline-session.test.ts`; existing account-isolation
and migration tests remain passing.

Coverage includes all six simulated iPhone/iPad/web directions, stable IDs,
binary concept round trips, settings/maps/analysis/preferred/report preservation,
thumbnail-only listing, offline restart/reconnect, request idempotency, outbox
ordering, in-flight edits, revision conflicts, active-editor conflict resolution,
tombstones, cleanup retries, RLS and storage-policy enforcement, cross-owner
forgery, checksum rejection, URL rejection, account switches during requests,
pending-media eviction protection and resumable legacy import excluding demos.

The SQL tests execute PostgreSQL through PGlite, including the existing migration
chain. HTTP handlers run against a private in-memory binary adapter in those
tests. They do not exercise a deployed Supabase Storage service. Device labels
in automated tests mean separate simulated IndexedDB origins/accounts, not
physical Apple hardware.

An additional headed Chromium smoke check of the local production app verified
service-worker registration and cold offline reload of the public application
shell/branding. The unavailable offline generation-cost request did not crash
the UI. Authenticated cloud case flows were not tested in that browser session.

## M. Build results and staging prerequisites

Framework: Next.js 16 / React 19 / TypeScript. Package manager: npm with the
existing `package-lock.json`; Node requirement is at least 22.13.0.

Final `npm run build` passed. The Cloudflare bundle build and
`node scripts/verify-production.mjs` also passed. The latter checked PWA metadata,
icons, relative application URLs, secret-file Git ignores, browser secret
isolation and the public-only offline shell.

The Cloudflare bundler prints an existing Node module-type detection warning
while inspecting the Sites bundle. It is not a build failure. No deployment was
run.

### Configuration for a future staging activation

Patient sync uses existing account environment variables; **no new secret is
required**:

| Variable | Location/use |
| --- | --- |
| `SUPABASE_URL` | Server; staging Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret only; never `NEXT_PUBLIC_`. |
| `REVENUECAT_SECRET_API_KEY` | Existing server secret required by the shared account-services factory; patient sync itself does not check a subscription. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public build-time account configuration; same staging project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public build-time anonymous key; owner RLS remains enforced. |
| `NEXT_PUBLIC_SMILE_API_ORIGIN` | For a native staging build, the staging API origin; web uses the relative origin. |

Existing unrelated generation, legal identity, account deletion and subscription
configuration remains as documented in `.env.example`. Do not point a staging
client at production while testing this migration. Public variables are inlined
at build time; private keys are supplied to the server at runtime.

Before physical-device tests, activate a dedicated staging deployment using the
existing migration conventions: review/apply the complete migration chain to
the staging project, verify `patient-cases` is private and its policies exist,
then publish a staging API/client with matching configuration. This task did
not perform those remote steps. Do not copy a production publish command merely
to run the manual tests.

## N. Known limitations and release boundaries

1. **Remote activation and actual-device behaviour are unverified.** No claim of
   successful live iPhone→iPad→web sync is made. The implementation is ready for
   staging activation and physical-device testing.
2. Current capture/import already produces prepared JPEGs. This stage cannot
   recover an untouched original that was never retained. Separate original and
   presentation kinds are supported, but the current prepared source also serves
   presentation; a new dedicated presentation-resizing pipeline was not added.
3. Offline access requires previously cached media and an installed/prepared
   application shell. An unopened or evicted image cannot be fetched offline.
   AI generation continues to require network. Loss of the local cache before a
   pending upload is acknowledged can still lose that unsynced work.
4. If media was evicted and then permanently removed remotely, preserving the
   conflicting local draft may be unable to recover those bytes. Resolution
   fails safely and keeps the conflict rather than claiming a complete copy.
5. Cleanup jobs retry during authenticated activity; there is no unattended
   scheduler in this stage. If all clients remain inactive, failed cleanup can
   remain queued. No fixed maximum deletion-completion time is promised.
6. Immutable media that stops being referenced is conservatively retained until
   whole-case permanent deletion. Automatic unused-variant pruning is deferred
   to avoid deleting media needed by an in-flight edit. Tombstones remain until
   account removal to prevent offline resurrection.
7. Structured state has a 2 MiB database limit, summaries 256 KiB, and asset
   uploads 25 MiB. Oversize/invalid work remains local and blocked with a failure
   state rather than being marked synced. An offline editing burst can grow the
   outbox; this version preserves each operation rather than coalescing edits.
8. Full cloud storage accounting is not added to the existing reference-library
   usage figure; its copy now explicitly states that patient-media usage is
   excluded. No quotas, subscription rules or billing logic changed.
9. The public service-worker cache contains only bundled fictional/public
   illustrative assets, never patient responses. IndexedDB remains browser-local
   storage, not a separately encrypted clinical vault. Device security and
   browser eviction policies still matter.
10. Privacy/data-flow documents were updated for this implementation and existing
    professional-review gates remain false. Onboarding was explicitly out of
    scope; its older device-only wording must be aligned in a separately
    authorised pass before a production cloud-storage release. Technical test
    success is not App Store/legal approval.

Generation behaviour, Tooth Map generation algorithms, reference-library
behaviour, subscription logic, onboarding flow, visual design and report design
were not changed for this sync task. Existing unrelated working-tree changes
were preserved. No production deploy, remote migration, or Macro Stage 2 work
was started.

## O. Manual iPhone / iPad / web acceptance script

Use a staging account and synthetic/test photographs only. Sign into the **same
account** on a physical iPhone, physical iPad and a desktop web browser. Complete
each step and record the observed case UUID, preferred version, sync/error state
and device/browser version. Installed iOS PWA or the existing native test build
must be checked, not only Safari in a tab.

1. **iPhone → iPad:** On iPhone create a case named `Sync check 01` with a test
   photo. Save selected teeth, shape/material/shade, clinician notes and a
   confirmed Tooth Map. Wait for pending work to acknowledge. Open Cases on
   iPad; verify the same case appears with a thumbnail and the same UUID. Open
   it and compare settings, photo and map. A photo-only draft can test this
   without spending an AI generation credit.
2. **iPad → web:** Edit the notes/settings on iPad and save. If testing an
   existing synthetic generated case, choose its preferred concept, review it
   and add report metadata. Foreground web; verify those exact changes under
   the same case/version IDs. Reopen comparison and export; verify both images
   and the recorded options. Reopening should not trigger fresh AI generation.
3. **Web → iPhone:** Rename or edit the case on web. Foreground/reopen iPhone
   and verify the change. Repeat an iPhone edit followed by web, and an iPad edit
   followed by iPhone if checking every pair explicitly.
4. **Offline and force-close:** First open/cache the case on iPhone. Turn off
   Wi-Fi and mobile data. Reopen it, edit notes/settings and save. Force-close
   the app, reopen offline and verify the edit and pending status remain. Restore
   connectivity; verify automatic sync and the change appearing on iPad/web.
   Check first-ever uncached offline navigation gives a reconnect message.
5. **Conflict:** Get the same synced case on both iOS devices. Put iPad offline
   and edit notes. Make a different iPhone edit and let it sync. Reconnect iPad:
   verify it retains its draft and offers a conflict, without overwriting the
   cloud notes. Test “Use cloud” and confirm the editor stays on the adopted
   version after autosave. Repeat on a second fixture with “Keep local as a
   separate case”; verify both cases and their correct images/preferred version.
6. **Deletion:** Cache a fixture on all three devices. Permanently delete it on
   web (through Recently Deleted where applicable). Foreground iPhone/iPad and
   verify the case and active draft disappear. Repeat with iPad offline and an
   unsynced edit; reconnection must not resurrect the deleted UUID. Inspect the
   private bucket/cleanup queue in staging to verify eventual object removal.
7. **Account isolation:** While an upload/refresh is pending, log out of account
   A and log into account B. Verify no A case, thumbnail, active photo or queue
   appears. Return to A and verify its own durable pending work resumes.
8. **Legacy import:** On a device with an unassigned test case, explicitly select
   Import existing cases. Interrupt connectivity mid-upload; reopen/reconnect
   and verify one imported case with its original case/version IDs, intact
   exports/reviews, and no demo cases. Verify the unassigned originals remain.

Mark physical-device sync **passed only after these checks are observed**. The
automated suite does not substitute for them.

## Stage 1 readiness

“READY” below means implementation ready, not remotely deployed. Staging setup
in section M must happen before the device tests in section O.

```text
CLOUD PATIENT CASES: READY
PRIVATE PATIENT MEDIA: READY
CROSS-DEVICE SYNC: READY FOR DEVICE TESTING
LOCAL ACCOUNT ISOLATION: MUST REMAIN PASSING
```

Stage 1 stops here. No Macro Stage 2 work is authorised by this handover.
