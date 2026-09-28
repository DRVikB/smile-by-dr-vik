# SmileCompose — iPhone & iPad app

SmileCompose ships from one codebase to the web (Cloudflare Workers, Netlify as an alternative) and to iPhone and iPad through [Capacitor](https://capacitorjs.com). The iOS app packages the production web build locally; it is **not** a remote wrapper around the website. Only API calls go over the network.

| | |
| --- | --- |
| App name | SmileCompose |
| Bundle identifier | `uk.co.drvik.smilecompose` |
| Devices | iPhone and iPad (`TARGETED_DEVICE_FAMILY = 1,2`), all iPad orientations |
| Minimum iOS | 15.0 |
| Capacitor | 8.5.2, Swift Package Manager (no CocoaPods) |

## What changed

- **Capacitor iOS project** in `ios/`, configured by `capacitor.config.ts` (`webDir: dist/native`).
- **Native bundle step** `scripts/build-native.mjs`: copies the prerendered page and assets from the normal production build into `dist/native`, adds a network allow-list (Content-Security-Policy `connect-src`) and fails the build if any provider credential name or endpoint appears in the bundle.
- **Backend CORS** (`src/lib/generation/cors.ts`): the API accepts the app's origin `capacitor://localhost`, answers its preflight and still rejects every other cross-site caller.
- **Central generation service** (`src/services/ai/smileImageService.ts`): the only client path to AI generation. Maps backend errors to clinician-friendly copy, emits accounting events and checks entitlements.
- **Models and future-proofing**: `SmileComposeCase` / `SmileDesign` (`src/models/case.ts`), a case repository (`src/services/cases/`), entitlements (`src/services/entitlements/`), feature flags (`src/config/features.ts`), generation modes (`src/lib/generation/modes.ts`) and generation metadata (provider, model, prompt version, timestamp) on every result.
- **Native iOS behaviour** (`src/native/`, `ios/App/App/`):
  - *Choose from Photos* uses Apple's system picker via a small local plugin (`PhotoPickerPlugin.swift`). It needs **no Photo Library permission**.
  - *Take Photo* keeps the in-app camera with the smile-framing guide (camera permission only); its fallback opens the system camera.
  - *Save Image*, case exports, reveal videos, analysis images and library exports open the **iOS share sheet** (Save Image, Save to Files, AirDrop, Mail, Messages) instead of browser downloads, which do not work in the app. Temporary export files are deleted after the sheet closes.
- **Brand assets**: app icon from `public/brand/icon-1024-glass-v2.png`; launch screen shows SMILECOMPOSE and "Designed by Dr Vik" on Ivory `#FAF9F6`.
- **Capacitor/iOS 27 fix** (`SmileComposeBridgeViewController.swift`): Capacitor 8.5.2 makes a synchronous `prompt()` call at startup that never completes in the iOS 27 WebView, leaving a blank screen. The controller answers those two checks in the page. Remove it once Capacitor fixes this upstream.

## Gemini integration

```
iOS app / website ──▶ SmileImageService ──▶ POST /api/generate-smile (SmileCompose backend)
                                             └─▶ GeminiSmileProvider ──▶ Google Gemini
```

- **Where the key lives:** server-side only.
  - Cloudflare (live): encrypted Worker secret `SMILE_GEMINI_API_KEY` (`npx wrangler secret put SMILE_GEMINI_API_KEY`).
  - Netlify: `SMILE_GEMINI_API_KEY` in site environment variables (Functions scope).
  - Local development: `GEMINI_API_KEY` in `.env.local` (ignored by Git).
- **Endpoint:** `POST /api/generate-smile` (plus `GET /api/generation-cost`). The website calls it on its own origin; the app calls `https://smile-by-dr-vik.drvik.workers.dev` (override at build time with `NEXT_PUBLIC_SMILE_API_ORIGIN`, a public URL, never a key).
- **Model:** `gemini-3.1-flash-image`, set by `GEMINI_IMAGE_MODEL` (`wrangler.jsonc`), default in `src/lib/generation/gemini.ts`. Preview (512 px) and Final (1K) currently share it; see `src/lib/generation/modes.ts`.
- **Prompt:** `buildSmileGenerationPrompt()` in `src/lib/generation/prompt.ts`, versioned by `SMILE_PROMPT_VERSION`.
- The app never contains a Gemini key and never calls Google directly. `scripts/build-native.mjs` and `scripts/verify-production.mjs` check this on every build.

> **Deploy required:** the API changes (iOS CORS, accounts, webhook) are in this repository but **not deployed**. Configure the secrets in PAYMENTS_AUTH_SETUP.md, then deploy. Live generation requires a signed-in Pro account; test mode never does.

## Web

```sh
npm install
npm run dev                 # http://localhost:3006
npm run build               # production web build
npm run deploy:cloudflare   # build + deploy the Worker (live site)
```

The website does not depend on Capacitor. Netlify remains configured as before (`netlify.toml`).

## iOS

```sh
npm install          # installs @capacitor/* too
npm run ios:sync     # production web build → dist/native → copy into Xcode project
npm run ios:open     # open ios/App/App.xcodeproj in Xcode
```

Run `npm run ios:sync` after every web change. Xcode resolves Swift packages on first open (requires network access to GitHub).

## Xcode (manual steps)

1. `npm run ios:open`.
2. Select the **App** target → **Signing & Capabilities** → choose your Apple Developer **Team**. Keep the bundle identifier `uk.co.drvik.smilecompose`.
3. Set **Version** / **Build** (General tab) before each TestFlight upload.
4. Choose a simulator or connected device and press **Run**.
5. For release: **Product → Archive**, then **Distribute App** (only when you decide to; nothing has been submitted).

## App icon and launch screen

- Icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` (1024 × 1024, opaque, full-bleed; iOS applies the rounded mask). To replace it, export a new opaque 1024 px PNG from `public/brand/smilecompose-app-icon.svg` (`node scripts/build-brand-assets.mjs`) and overwrite this file.
- Launch screen: `ios/App/App/Base.lproj/LaunchScreen.storyboard` (text only, no images).
- Not present: a separate dark-mode or tinted icon variant (optional in current iOS).

## Testing

- **iPad Simulator:** in Xcode pick e.g. *iPad Pro 11-inch* and Run. From the terminal:
  ```sh
  xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPad Pro 11-inch (M5)' build
  ```
- **iPhone Simulator:** pick e.g. *iPhone 18 Pro* and Run.
- **Test mode** on the start screen exercises the whole flow with bundled demo images and no AI charge.
- **Physical device:** connect the device, trust the Mac, select it in Xcode, set your Team, Run. Needed for the camera, AirDrop/Mail/Messages and real Photos behaviour.
- Automated checks: `npm run lint`, `npm run typecheck`, `npm test`.

## Security

- Gemini requests happen **only** inside the backend (`src/lib/generation/gemini.ts`), called by `src/lib/generation/handler.ts` from the Cloudflare Worker (`scripts/cloudflare-worker.ts`) or the Next.js route (`src/app/api/generate-smile/route.ts`).
- The app's WebView may only connect to itself, the SmileCompose backend and the face-model files (jsDelivr, Google Cloud Storage). This blocks the MediaPipe face-landmark library's default usage-metrics upload to Google. **The website does not have this policy yet** (see *Before App Store*).
- CORS allows only `capacitor://localhost`. An Origin header is not authentication: the endpoint still has no clinician accounts or server-side spend limits.
- Cases, photos and results stay in on-device storage (WebView IndexedDB). Nothing is uploaded to public storage; the Worker does not store images.

## Accounts and subscriptions

Implemented: Supabase accounts (email + Sign in with Apple), RevenueCat/StoreKit subscriptions, offer codes, server-side generation allowance and ledger, account deletion. Configuration steps: [PAYMENTS_AUTH_SETUP.md](PAYMENTS_AUTH_SETUP.md). App Store compliance and App Privacy answers: [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md). Check readiness with `npm run check:app-store`; build releases with `npm run ios:release`.

## Privacy manifest readiness

| Component | Manifest | Notes |
| --- | --- | --- |
| Capacitor / Cordova runtime | Ships `PrivacyInfo.xcprivacy` | No tracking, no required-reason APIs declared |
| `@capacitor/filesystem` (+ Ionic filesystem library) | None shipped | File timestamp API: declared (C617.1) in the app manifest |
| RevenueCat (`purchases-ios`, hybrid common) | Ships `PrivacyInfo.xcprivacy` | UserDefaults (CA92.1), Purchase History |
| `@capacitor/share` | None | Presents the system share sheet |
| `PhotoPickerPlugin` (app) | — | System PHPicker; no Photo Library access |
| WebView storage | — | IndexedDB/localStorage are WebKit-managed |

The app-level manifest is `ios/App/App/PrivacyInfo.xcprivacy` (collected data and required-reason APIs, derived from the built binaries and actual data flows). Before submission, run Xcode's **Product → Archive → Generate Privacy Report** and confirm it matches the App Privacy answers in APP_STORE_SUBMISSION.md.

Permission strings in `Info.plist`: camera (take the patient photo) and photo-library *add* (Save Image from the share sheet). Full Photo Library access is never requested.
