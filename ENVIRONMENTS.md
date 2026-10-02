# Environments and configuration

SmileCompose has three environments. Keep each one's backend, database and keys separate.

**2026-10-02 release-candidate status:** original local checkpoint `v1.0.0-rc1`
(`6f48042865e45fbd7ddee8440186696b82509f2f`). The owner resumed setup:
**smilecompose-staging** (`wukcqlpuzkzwxmdkotfg`, London) is verified, eight
migrations are recorded, and the staging Worker/web release is deployed.
`/api/patient-cases` no longer returns 404. Safe live account/storage/sync and
one synthetic Gemini generation passed. Production was not changed.
RevenueCat App Store credentials passed validation; Apple products are mapped and
the public Apple SDK key is bundled. Signed Debug build and physical iPhone/iPad
installation passed. Webhook dashboard authorization, StoreKit validation, legal
review and device acceptance still block TestFlight. See
[the Stage 3 handover](docs/STAGING_TESTFLIGHT_STAGE3_2026-10-02.md).

| | Development | Staging (device testing, TestFlight) | Production |
|---|---|---|---|
| Web/app bundle | `npm run dev` (web) or a local `npm run ios:sync` | `npm run ios:sync` with staging public keys | `npm run ios:release` with production public keys |
| API backend | local `next dev`, or `SMILE_PROVIDER=mock` | Worker `smile-by-dr-vik-staging` (`npx wrangler deploy --env staging`) | Worker `smile-by-dr-vik` (`npm run deploy:cloudflare`) |
| Supabase | a dev project (optional) | a **staging** project | the production project |
| RevenueCat | Test Store or sandbox | App Store sandbox (TestFlight uses sandbox) | App Store (sandbox also accepted for App Review) |
| AI provider | `mock` (no AI, no key) | real provider, paid data terms | real provider, paid data terms |

The iOS app always runs its **bundled** production web build (`webDir: dist/native`); it never loads a dev server or `localhost`. It calls the API at `NEXT_PUBLIC_SMILE_API_ORIGIN` (default: the production Worker) and Supabase at `NEXT_PUBLIC_SUPABASE_URL`. Both origins are added to the app's Content-Security-Policy at build time.

**Every real AI generation is attached to a signed-in account** (authenticated, entitled, reserved against that account's allowance, recorded on its ledger). There is no switch to turn accounts off; without Supabase and RevenueCat configured on the server, live generation is refused (`accounts_unavailable`). Use `SMILE_PROVIDER=mock` for local work without accounts.

## Client-safe variables (inlined into the web and iOS bundles)

Set in `.env.local` (development) or the build environment. They are public by design — never put a secret in a `NEXT_PUBLIC_` variable.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key (protected by Row Level Security) |
| `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` | RevenueCat Apple public SDK key (`appl_…`; never a `test_` key in release) |
| `NEXT_PUBLIC_SMILE_API_ORIGIN` | API origin for the iOS app (staging or production Worker URL) |
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `…_ADDRESS`, `…_COMPANY_NUMBER`, `NEXT_PUBLIC_ICO_REGISTRATION_NUMBER`, `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` | Legal identity shown in the privacy policy and terms (owner decisions) |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_HELP_URL` | Support contact and optional help centre |

## Server-only variables (Worker secrets / server environment)

Set with `npx wrangler secret put NAME` (add `--env staging` for staging). Never commit them, never prefix them with `NEXT_PUBLIC_`.

| Variable | Purpose |
|---|---|
| `SMILE_PROVIDER` | `gemini` / `vertex` / `mock` (a Worker var, not secret) |
| `SMILE_GEMINI_API_KEY` (or `GEMINI_API_KEY`), `GEMINI_IMAGE_MODEL` | AI provider key and model |
| `SMILE_GEMINI_DATA_TERMS` | Owner confirmation of the provider's data terms (`paid` or `vertex`); live generation is refused until set |
| `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `GOOGLE_SERVICE_ACCOUNT_JSON` | Only if using Vertex AI |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server access to Supabase (service role bypasses RLS — server only) |
| `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_ALLOW_SANDBOX` | Server-side entitlement checks and webhook |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID` | Sign in with Apple token revocation on account deletion |
| `STYLE_REFERENCE_LIMIT` | Case Library references per generation (1–5, default 3) |

Checks that enforce this:
- `scripts/build-native.mjs` reports "no provider credentials referenced"; release builds (`SMILE_RELEASE_BUILD=1`) refuse to build without production Supabase/RevenueCat public keys or with unresolved legal placeholders.
- `scripts/verify-ios-bundle.mjs` (runs in `npm run ios:sync`) scans the copied iOS bundle for private-key patterns and for the literal value of any server variable in `.env.local`, rejects a `server.url` (dev server) in the Capacitor config, checks the app ID/name, and removes file-sync duplicates.

## Setting up staging for a physical iPhone test

The current release is deployed at `smile-by-dr-vik-staging.drvik.workers.dev` and its account, Case Library, patient sync, native preflight and generation routes have passed safe live checks. Production at `smile-by-dr-vik.drvik.workers.dev` was not deployed or revalidated during this staging pass. Apple purchases/sign-in and physical-device acceptance remain incomplete.

1. **Supabase (staging project)** — create the project; run the migrations in `supabase/migrations/` in order (see PAYMENTS_AUTH_SETUP.md step 2); set Auth → URL Configuration redirect URLs including `uk.co.drvik.smilecompose://auth-callback*`; enable the Apple provider with Client ID `uk.co.drvik.smilecompose`.
2. **RevenueCat** — project with the App Store app, `pro` entitlement and the monthly/annual products (PAYMENTS_AUTH_SETUP.md). For testing without purchases, grant yourself complimentary access (below).
3. **Worker (staging)** — set secrets with `--env staging` (provider key, `SMILE_GEMINI_DATA_TERMS`, Supabase URL + service role, RevenueCat secret + webhook auth). The current staging configuration already uses `SMILE_PROVIDER=gemini` and `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image`; it is not a free mock deployment. After verifying the dedicated staging database and matching public build keys, build with `npm run build:cloudflare`, then deploy with `npx wrangler deploy --env staging`. Note the URL it prints. Do not use the unqualified production deploy command for this beta.
4. **App** — in `.env.local` set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` and `NEXT_PUBLIC_SMILE_API_ORIGIN=<staging Worker URL>`, then `npm run ios:sync` (the bundle check should report "accounts configured").

### Complimentary access for your own testing

In the Supabase SQL editor (service role; the app cannot do this):

```sql
insert into public.access_overrides (user_id, monthly_generation_allowance, reason, created_by)
values ('<your Supabase user UUID>', 100, 'Owner device testing', 'owner');
```

Revoke with `update public.access_overrides set revoked_at = now() where user_id = '<uuid>';`. Find your UUID under Authentication → Users after signing in once.

## When the paid Apple Developer team is active

Features that a free Personal Team cannot sign, each switched on in Xcode (select the target → Signing & Capabilities):

1. **Sign in with Apple and Data Protection** (target `App`): both are already in `ios/App/App/App.entitlements` (`Default` and `NSFileProtectionComplete`). Select the paid team and refresh the provisioning profile; do not restore an older entitlement file. The Stage 3 signed device build failed because the existing profile did not include these capabilities. See the handover for the exact manual steps.
2. **Widget greeting** (targets `App` and `SmileComposeWidgetExtension`): + Capability → **App Groups** → add `group.uk.co.drvik.smilecompose` on both. The app already writes the clinician's preferred name there (`ShortcutsPlugin.setWidgetName`); without the group the widget shows its generic text ("New smile design") instead of "Welcome, Dr Vik." Only the clinician's own name is shared, never patient information.
3. Select the paid team for both targets (`App`, `SmileComposeWidgetExtension`); the widget's bundle ID is `uk.co.drvik.smilecompose.widget`.

## Warning: the project folder is synced by iCloud Drive

`~/Documents` is in iCloud Drive (Desktop & Documents). iCloud creates duplicate files such as `chunk 2.js` inside build output (`.next`, `dist`, `ios/App/App/public`), which previously broke the typecheck and put stale copies into the iOS bundle. `npm run ios:sync` now removes them from the iOS bundle, and `rm -rf .next dist` clears the others. For reliable builds, move the repository to a folder that isn't synced (for example `~/Developer/smile`).
