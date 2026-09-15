# SMILE by Dr Vik — production

## Stack and checks

Next.js 16 (App Router), React 19, TypeScript, npm/package-lock.json. Use Node.js 22.13 or newer.

```sh
npm ci
npm run check:production
```

This runs lint, tests, `npm run build`, and artifact/security checks. The production build also creates the existing Sites Cloudflare Worker package in `dist/`.

## Required hosting environment

Set these server-only variables in the hosting platform, not in browser code:

- `SMILE_PROVIDER=gemini`
- `GEMINI_API_KEY=<your Gemini API key>` (secret)
- `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image`

`.env.example` contains empty placeholders. Local development uses ignored `.env.local`.
Optional alternatives are `OPENAI_API_KEY`/`OPENAI_IMAGE_MODEL` with `SMILE_PROVIDER=openai`, or `SMILE_PROVIDER_URL`/`SMILE_PROVIDER_API_KEY` with `SMILE_PROVIDER=http`. None is required for Gemini. No `NEXT_PUBLIC_` secret is used.

Browser requests only POST to `/api/generate-smile`. The Next.js server route delegates to the shared server handler. The existing Sites hosting adapter exposes the same path and handler using Worker environment bindings. Patient photos are not written to hosted storage, responses use `Cache-Control: no-store`, and diagnostic logs contain no photos, prompts or keys.

## Deployment

The existing private Sites deployment is published through Sites; no user CLI command is needed. Do not upload the source directory or `.env.local` as static files.

For a conventional Node.js Next.js host:

```sh
npm ci
npm run build
npm run start
```

`npm run start` listens on port 3006; put the process behind the platform's HTTPS proxy. A platform-supplied port can instead use `npx next start --hostname 0.0.0.0 --port "$PORT"` after building. This is server hosting, not a static export.

## iPad installation and camera

Open the HTTPS site in Safari, use Share → Add to Home Screen, and open SMILE from the new icon. The manifest uses standalone display and the existing Dr Vik brand with 192/512 icons and an Apple touch icon. No orientation lock is applied. Safe-area padding and dynamic viewport heights support portrait, landscape and Split View without disabling zoom.

Camera preview uses muted, inline video and requires HTTPS and camera permission. If live camera access is unavailable, the existing native-camera/file-picker fallback remains available. JPEG, PNG, HEIC/HEIF uploads are converted and resized locally. Physical iPad camera and installation checks still require a device; desktop checks cannot certify hardware/browser permissions.

## Recovery and privacy

The existing single current case is saved in IndexedDB on this device: original photo, settings, result, test state, and reference photo. It survives ordinary reloads and app closure. New Smile deletes it; Reset retains its existing settings-reset behavior. There is no case archive or new remote photo storage. Browser storage can still be cleared or evicted by the user/OS; this is not permanent backup. Safari and a Home Screen installation may have separate local storage, so start the case in the app you intend to use.

The service worker does not cache authenticated pages, photos, or generation requests. Offline launches show a reconnect page. AI generation requires a connection. Missing server configuration produces a clear error; `SMILE_PROVIDER=mock` is an explicit development-only simulation, and the existing in-app test mode requires no API key.

## GitHub → Netlify

Push this project's source to a private GitHub repository, then choose Netlify → Add new project → Import an existing project → GitHub. `netlify.toml` configures `npm run build:next` and `.next`; use the project root as the base directory. This avoids running the separate Sites Worker packaging step on Netlify. Set the three Gemini variables above in Netlify's environment settings with Functions scope enabled.

Migration checks before using patient photos:

- The current Sites URL is owner-private. A private GitHub repository does not make a Netlify deployment private. Configure equivalent site access protection before launch.
- Netlify synchronous functions have a 60-second execution limit and a 6 MB buffered request/response limit. This app currently allows longer generation requests and larger combined photo payloads; validate representative photos and slow generations before switching. Supporting requests beyond those limits requires adapting the backend, not just changing build settings.
- Existing device-local cases do not automatically transfer to a new domain.

The source is prepared for import; this does not mean a GitHub repository or Netlify deployment has been created.
