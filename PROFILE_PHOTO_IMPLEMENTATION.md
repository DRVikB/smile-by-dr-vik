# Profile photo

An optional photo for the clinician's account, shown in the Home top-right control, the Settings profile card, the iPad Settings sidebar and the design-screen Settings button. Initials are the fallback everywhere; a photo that fails to load falls back to initials, never a broken image.

Status: implemented and tested (2026-09-28). Requires `supabase/migrations/20260928140000_case_library_avatars.sql`.

## Storage

- Private Storage bucket `profile-avatars` (1 MB limit, JPEG only). Object path `{user_id}/{uuid}.jpg`; `profiles.avatar_path` holds the path (a check constraint requires it to start with the owner's id). No image data in the database, no public bucket, no permanent public URL.
- Storage policies: the owner can select, insert, update and delete objects in their own folder only.
- The status endpoint returns a signed URL valid for 1 hour (`avatarUrl`), only for the user's own path. `avatarPath` is never returned to the app.

## Flow

1. Tap the avatar (Settings profile card, or "Add profile photo" in onboarding's Personalise step, signed-in only). Action sheet: **Take Photo / Choose Photo / Remove Photo** (when set) **/ Cancel** (`src/components/profile/ProfilePhotoEditor.tsx`). iOS uses the camera and the permission-free system photo picker; the web uses a file input.
2. Simple crop: circular mask, pinch-style zoom slider (1–3×) and drag to reposition. Output 512 × 512 JPEG (quality 0.86), made on the device.
3. `POST /api/account/avatar` (`handleAvatar`): validates a real JPEG ≥64 px and ≤1 MB, uploads a new object, updates `avatar_path`, then deletes the previous object (no orphans). `{remove: true}` clears the path and deletes the object. Failures remove the new object.
4. `AccountProvider.setAvatar` updates the in-memory status so every avatar in the app refreshes immediately.

Account deletion removes all avatar objects before the account (fails closed if storage deletion fails).

## Privacy

Account data (the clinician's own image), controller: SmileCompose. Never sent to AI providers, never sent to analytics (the app has none), never in logs. Documented in the privacy policy §4, [docs/DATA_INVENTORY.md](docs/DATA_INVENTORY.md) and [docs/DATA_RETENTION.md](docs/DATA_RETENTION.md).

## UI and themes

`UserAvatar` (`src/components/profile/UserAvatar.tsx`): sizes xlarge 72 / large 56 / medium 44 / small 40 / tiny 22. Initials use the brand charcoal-and-gold medallion; a photo is never tinted and gets a hairline ring that adapts to Light and Dark. The action sheet and cropper are portalled to `body` (so animated containers can't trap them), follow Reduce Transparency, and centre on iPad.

## Tests

- `tests/case-library-server.test.ts` — "profile photo: stored privately, replaced without orphans, removed, and scoped to its owner"; "account deletion removes the profile photo and the whole Case Library, and only that user's".
- `tests/database.test.ts` — "profile photos: users can upload, read, replace and remove only their own avatar objects" (user A cannot retrieve, overwrite or delete user B's avatar).
- Browser QA (iPhone/iPad, Light/Dark): add in onboarding and Settings, crop, replace, remove, initials fallback when the image fails to load.
