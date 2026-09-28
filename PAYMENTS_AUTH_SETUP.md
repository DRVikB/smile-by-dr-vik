# SmileCompose — accounts, subscriptions and generation allowance

This is everything you still configure by hand. The code, database migration, webhook, paywall and account screens are in the repository. No real keys are included anywhere; never commit them.

## How it fits together

```
iOS app / website
  ├─ Supabase Auth ── email + password (verified), Sign in with Apple ──► user.id  (the only account ID)
  ├─ RevenueCat SDK (iOS only) ── configured AFTER sign-in with appUserID = user.id
  │     └─ Apple StoreKit: purchase · restore · offer codes ──► entitlement "pro"
  └─ POST /api/generate-smile  (Bearer <Supabase access token>)
        Cloudflare Worker:
          1 authenticate token (Supabase)
          2 Pro? = RevenueCat "pro" entitlement (REST, authoritative) OR valid access_overrides row
          3 reserve 1 generation (Postgres, row-locked, concurrency-safe)
          4 call Gemini
          5 commit on success / refund on failure        → generation_ledger (append-only)
RevenueCat ──webhook──► /api/webhooks/revenuecat ──► apply_revenuecat_event (idempotent per event id)
```

- **Product IDs** (exact): `uk.co.drvik.smilecompose.pro.monthly`, `uk.co.drvik.smilecompose.pro.annual`
- **Entitlement ID**: `pro`
- **Generations per billing period**: monthly 50, annual 600. Change them in `src/config/subscriptions.ts` (a business decision; one place).
- **Code map**: `supabase/migrations/…_accounts_subscriptions_generation.sql` (schema, RLS, functions) · `src/server/*` (auth, access, webhook, deletion) · `src/services/{auth,purchases,account}` (client) · `src/components/account/*` (sign-in, paywall, settings) · `src/config/{accounts,subscriptions}.ts`.

Until the public keys are set at build time the app behaves as before (no account UI in the flow). The **server** fails closed: with the Gemini key present but accounts not configured, live generation returns "accounts not configured" rather than running unmetered. For local development only, set `SMILE_ACCOUNTS=off`.

---

## 1. Supabase

1. Create a project (a region close to your users, e.g. London `eu-west-2`).
2. **Database** → run both migrations in order: open *SQL Editor*, paste and run `supabase/migrations/20260927120000_accounts_subscriptions_generation.sql`, then `supabase/migrations/20260927180000_privacy_security_controls.sql` (consent records, security audit log, incident register, rate limit, DSAR helpers), then `supabase/migrations/20260928100000_profile_onboarding_storage.sql` (account name, preferred name, onboarding completion, storage accounting — see ONBOARDING_SETTINGS_IMPLEMENTATION.md), then `supabase/migrations/20260928140000_case_library_avatars.sql` (Case Library tables, private `case-library` and `profile-avatars` Storage buckets with owner-only policies, `reference_case_ids` on the ledger, style feedback — see CASE_LIBRARY_STYLE_REFERENCES.md and PROFILE_PHOTO_IMPLEMENTATION.md). Or with the Supabase CLI: `supabase link` then `supabase db push`.
3. **Authentication → Sign In / Providers → Email**: enable email provider, **Confirm email = on**, minimum password length **10**, enable "Prevent use of leaked passwords" if available.
   - **Authentication → Multi-Factor**: enable **TOTP (authenticator app)**. Clinicians turn it on in Settings › Account. Once enrolled, the server refuses sessions that haven't completed the second factor.
4. **Authentication → URL Configuration**:
   - Site URL: `https://smile-by-dr-vik.drvik.workers.dev`
   - Redirect URLs (add all):
     - `https://smile-by-dr-vik.drvik.workers.dev/?flow=*`
     - `uk.co.drvik.smilecompose://auth-callback*`
     - `http://localhost:3006/?flow=*` (development)
5. **Authentication → Providers → Apple**: enable.
   - *Client IDs*: `uk.co.drvik.smilecompose` (native iOS) **and** your Services ID (web, e.g. `uk.co.drvik.smilecompose.web`), comma-separated.
   - *Secret Key (for OAuth)*: generate from the Sign in with Apple key (see Apple step 3) as Supabase's docs describe; needed for the web flow only. It expires every 6 months; diarise renewal.
6. **Authentication → Emails → SMTP**: configure your own SMTP sender (e.g. Postmark, Resend, SES). Supabase's built-in mailer is rate-limited and not for production. Optionally brand the *Confirm signup* and *Reset password* templates.
7. **Authentication → Sign In / Providers**: leave *automatic linking* for verified emails as default; Supabase links identities only when the email is verified, never on unverified strings.
8. **Project Settings → API**: copy the Project URL, the **anon/publishable** key (client) and the **service_role** key (server only).

### Complimentary access (owner, QA, App Review)

Server-controlled only; there is no licence-key field in the app. In the SQL editor:

```sql
-- Find the account
select id, email from auth.users where email = 'owner@example.com';

-- Grant Pro with 100 generations per calendar month, no expiry
insert into public.access_overrides (user_id, monthly_generation_allowance, reason, created_by)
values ('<user-uuid>', 100, 'Owner account', 'dr-vik');

-- Time-limited QA access
insert into public.access_overrides (user_id, monthly_generation_allowance, expires_at, reason, created_by)
values ('<user-uuid>', 20, now() + interval '30 days', 'QA sprint', 'dr-vik');

-- Revoke
update public.access_overrides set revoked_at = now() where user_id = '<user-uuid>';

-- One-off extra generations (recorded in the ledger)
select public.admin_adjust_generations('<user-uuid>', 10, 'Support credit, ticket 123');

-- Audit trail
select * from public.generation_ledger where user_id = '<user-uuid>' order by created_at desc;
```

## 2. Apple Developer (developer.apple.com)

1. **Identifiers → App IDs → `uk.co.drvik.smilecompose`**: enable **Sign in with Apple** and **In-App Purchase**.
2. **Identifiers → Services IDs** (web Sign in with Apple only): create e.g. `uk.co.drvik.smilecompose.web`, enable Sign in with Apple, primary App ID = the app, domain `<project>.supabase.co`, return URL `https://<project>.supabase.co/auth/v1/callback`.
3. **Keys → +**: create a key with **Sign in with Apple** enabled (primary App ID = the app). Download the `.p8` once. It is used for (a) the Supabase web OAuth secret and (b) token revocation on account deletion (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID=uk.co.drvik.smilecompose`).
4. **Keys → In-App Purchase** (or App Store Connect → Users and Access → Integrations → In-App Purchase): generate an In-App Purchase key for RevenueCat. Note the Key ID and Issuer ID.

## 3. App Store Connect

1. **Business**: accept the Paid Apps agreement and complete tax and banking (subscriptions can't be tested or sold without it).
2. **Apps → +**: create *SmileCompose*, bundle ID `uk.co.drvik.smilecompose`, SKU of your choice.
3. **Monetisation → Subscriptions → Subscription group**: create **SmileCompose Pro**, then two subscriptions in it:

   | Reference name | Product ID | Duration |
   | --- | --- | --- |
   | SmileCompose Pro Monthly | `uk.co.drvik.smilecompose.pro.monthly` | 1 month |
   | SmileCompose Pro Annual | `uk.co.drvik.smilecompose.pro.annual` | 1 year |

   For each: set prices (the app shows StoreKit's localized price; nothing is hardcoded), add an English display name and description (e.g. "50 smile visualisations each month"), a review screenshot of the paywall, and review notes. Rank annual above monthly within the group if annual is the upgrade path.
4. **App Store Server Notifications**: set the production and sandbox URLs to the RevenueCat URL shown in RevenueCat's app settings (V2).
5. **Offer codes**: *Subscriptions → pick a product → Subscription Prices → Offer Codes → +*.
   - Choose eligibility (new / existing / expired subscribers), the offer (e.g. free for 1 month, or pay-up-front), and customer-facing duration.
   - Create either **custom codes** (you type the code, e.g. `DRVIKTEST`, `SMILECOMPOSELAUNCH`, with a redemption limit and expiry) or **one-time-use codes** (Apple generates a CSV).
   - Codes are never stored in the app. Customers redeem them via *Paywall / Settings → Redeem Code* (Apple's sheet) or an App Store redemption link. Pro unlocks only when RevenueCat reports the `pro` entitlement.
6. **TestFlight → Internal/External testing**: add testers. **Users and Access → Sandbox → Test Accounts**: create sandbox Apple IDs for purchase testing.
7. **App Privacy**: answer as listed in `APP_STORE_SUBMISSION.md`, and set the Privacy Policy URL to `https://smile-by-dr-vik.drvik.workers.dev/privacy.html` (after completing the placeholders and deploying).

## 4. RevenueCat (app.revenuecat.com)

1. Create a project **SmileCompose** → add an **App Store** app with bundle ID `uk.co.drvik.smilecompose`.
2. Upload the **In-App Purchase key** (.p8, Key ID, Issuer ID). Optionally add an App Store Connect API key so products import automatically.
3. **Products**: import/add both product IDs above.
4. **Entitlements**: create `pro`; attach **both** products.
5. **Offerings**: make `default` the *current* offering with packages **Monthly** (`$rc_monthly` → monthly product) and **Annual** (`$rc_annual` → annual product).
6. **Project settings → Restore behaviour**: choose **Keep with original App User ID**, so one Apple ID's subscription can't unlock several SmileCompose accounts. (The app explains "This purchase belongs to another SmileCompose account" in that case.)
7. **API keys**: copy the **public Apple key** (`appl_…`) for `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY`, and create a **secret key** (v1, `sk_…`) for the server (`REVENUECAT_SECRET_API_KEY`). Do not use the *Test Store* key (`test_…`) in release builds; `npm run ios:release` refuses it.
8. **Integrations → Webhooks → +**:
   - URL: `https://smile-by-dr-vik.drvik.workers.dev/api/webhooks/revenuecat`
   - Authorization header value: a long random string, e.g. `Bearer <random>`. Put the **identical full value** in `REVENUECAT_WEBHOOK_AUTH`.
   - Environment: both Production and Sandbox. Events: all.
   - Send a test event: the endpoint answers `ignored_type` for `TEST`.

## 5. Cloudflare Worker (server secrets)

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put REVENUECAT_SECRET_API_KEY
npx wrangler secret put REVENUECAT_WEBHOOK_AUTH
npx wrangler secret put APPLE_TEAM_ID
npx wrangler secret put APPLE_KEY_ID
npx wrangler secret put APPLE_PRIVATE_KEY
npx wrangler secret put APPLE_CLIENT_ID
# Owner confirmation of Google data terms (docs/SUBPROCESSORS.md): "paid" or "vertex".
# Live generation is refused until this is set.
npx wrangler secret put SMILE_GEMINI_DATA_TERMS
# Optional Vertex AI (SMILE_PROVIDER=vertex): VERTEX_PROJECT_ID, VERTEX_LOCATION, GOOGLE_SERVICE_ACCOUNT_JSON
npm run deploy:cloudflare
```

Staging (synthetic data only, separate Supabase project and secrets): `npx wrangler secret put NAME --env staging`, then `npx wrangler deploy --env staging`.

`REVENUECAT_ALLOW_SANDBOX` defaults to accepting sandbox purchases. Keep it that way for the production backend: **App Review and TestFlight purchase with sandbox accounts in the production build**, and an app that rejects them fails review. A copy downloaded from the App Store can never make sandbox purchases, so production customers can't obtain Pro through sandbox. Every period, ledger entry and cached status records `environment` (`production` / `sandbox`), and Settings labels sandbox access.

## 6. Build configuration (public values)

Set at build time (shell or CI), never committed:

```sh
export NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key>
export NEXT_PUBLIC_REVENUECAT_IOS_API_KEY=appl_<…>
# Legal identity for /privacy.html and /terms.html (owner decisions):
export NEXT_PUBLIC_LEGAL_ENTITY_NAME="…" NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS="…"
export NEXT_PUBLIC_LEGAL_COMPANY_NUMBER=… NEXT_PUBLIC_ICO_REGISTRATION_NUMBER=… NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL=…
npm run build:cloudflare   # website (then deploy:cloudflare)
npm run ios:release        # iOS bundle; fails on missing keys, test_ keys, or unresolved owner/legal items in /privacy.html or /terms.html
```

For the website, the same `NEXT_PUBLIC_*` values must be present when running `npm run deploy:cloudflare`.

## 7. Xcode

1. `npm run ios:open` → target **App** → **Signing & Capabilities** → select your Team.
2. Confirm **Sign in with Apple** appears (from `App/App.entitlements`); add **In-App Purchase** with *+ Capability*.
3. Optional local purchase testing without App Store Connect: *File → New → StoreKit Configuration File* (sync from App Store Connect), then *Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration*. Remove it from the scheme before archiving.

---

## Testing

### Email login
1. Build with the public Supabase values; run on a simulator or device.
2. Settings → Sign in or create account → *Create an account* with a real inbox (password ≥ 8).
3. Open the confirmation email **on the same device**. In the app, the link returns through `uk.co.drvik.smilecompose://auth-callback` and signs you in ("Your email is confirmed"). On the web it returns to `/?flow=verified`.
4. Sign out → sign in again. Quit and relaunch: the session persists.
5. *Forgot password?* → open the email on the device → the app opens *Choose a new password* → update → sign in with it.

### Sign in with Apple
- **iOS** (signed build on a device, or a simulator signed into an Apple ID): *Sign in with Apple* → Apple sheet → signed in. The Supabase user shows provider `apple`. With *Hide My Email* the relay address appears.
- **Web**: requires the Services ID and Supabase secret. *Sign in with Apple* redirects to Apple and back to `/?flow=signin`.
- **Deletion**: Settings → Delete account asks you to confirm with Apple; the server revokes the Apple token (needs `APPLE_*` secrets).

### Subscription (sandbox)
1. Device: *Settings → App Store → Sandbox Account* → sign in with a sandbox tester (or TestFlight, below).
2. Sign in to SmileCompose → tap *Generate Smile* (or Settings → See SmileCompose Pro).
3. The paywall shows both plans with localized prices from StoreKit. Choose one → Apple sheet → confirm (sandbox, no charge).
4. Pro unlocks when the `pro` entitlement is active; Settings shows plan, renewal date and *Generations remaining*.
5. Generate a smile: the count drops by one. Force a failure (e.g. airplane mode during generation): the count is refunded.
6. *Restore Purchases* on a fresh install restores Pro.
7. Sandbox renewals are accelerated (a month ≈ 5 minutes); each renewal webhook establishes a new period allowance exactly once. Check `allowance_periods` and `revenuecat_events` in Supabase.
8. Cancel in *Settings → Apple ID → Subscriptions* (sandbox): Settings shows "Ends …"; after expiry the EXPIRATION webhook marks the account free and generation shows the paywall.

### Offer codes
1. Create a custom code in App Store Connect (step 3.5).
2. In the app: Paywall or Settings → *Redeem Code* → Apple's redemption sheet → enter the code.
3. On return, the app refreshes CustomerInfo (listener + foreground refresh); Pro unlocks when RevenueCat reports `pro`.
- The redemption sheet is **not available in the iOS Simulator**; use a device.
- Apple's support for redeeming App Store Connect offer codes in sandbox/TestFlight has varied over time. Check Apple's current *Testing offer codes* documentation. Reliable alternatives: define offer codes in an Xcode **StoreKit configuration file** for local testing, and verify a real code in production after release.

### TestFlight
1. `npm run ios:release`, then Xcode → *Product → Archive* → *Distribute → TestFlight*.
2. Testers install from TestFlight. **In-app purchases in TestFlight use Apple's sandbox and never charge testers**; no promo codes are needed. Subscriptions renew on the accelerated sandbox schedule and stop after a few renewals.
3. Sandbox purchases activate the RevenueCat `pro` entitlement normally and are recorded with `environment = sandbox`.
4. For testers who shouldn't purchase at all, grant an `access_overrides` row instead.

## Account deletion behaviour

*Settings → Account → Delete account* (signed in):
1. If the account uses Sign in with Apple (iOS), the user re-confirms with Apple; the server revokes their Apple tokens.
2. The RevenueCat customer record is deleted.
3. A pseudonymous marker (SHA-256 of the user ID, date) is written to `account_deletions`.
4. The Supabase user is deleted; the profile, allowance periods, reservations, ledger and overrides are removed by `ON DELETE CASCADE`.
5. The app signs out and, if chosen, deletes all cases and photos on the device.

The app warns first that **deleting an account does not cancel an App Store subscription** and links to *Manage Subscription*. If you have legal retention duties for any record, adjust the cascade before launch and update the privacy policy.

## Environment variables

| Name | Where | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | build (web + iOS) | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build (web + iOS) | No (RLS-protected) |
| `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` | build (iOS) | No (public SDK key) |
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `…_ADDRESS`, `NEXT_PUBLIC_LEGAL_COMPANY_NUMBER`, `NEXT_PUBLIC_ICO_REGISTRATION_NUMBER`, `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` | build (web + iOS) | No |
| `NEXT_PUBLIC_SMILE_API_ORIGIN` | build, optional | No |
| `SUPABASE_URL` | Worker | No, but server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker secret | **Yes** |
| `REVENUECAT_SECRET_API_KEY` | Worker secret | **Yes** |
| `REVENUECAT_WEBHOOK_AUTH` | Worker secret | **Yes** |
| `REVENUECAT_ALLOW_SANDBOX` | Worker var, optional | No |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` | Worker secrets | Low |
| `APPLE_PRIVATE_KEY` | Worker secret | **Yes** |
| `SMILE_GEMINI_API_KEY` | Worker secret (existing) | **Yes** |
| `SMILE_GEMINI_DATA_TERMS` | Worker var/secret: `paid` or `vertex` (owner confirmation) | No |
| `VERTEX_PROJECT_ID`, `VERTEX_LOCATION` | Worker vars (Vertex only) | No |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Worker secret (Vertex only) | **Yes** |
| `SMILE_ACCOUNTS` | local dev only (`off`) | No |
