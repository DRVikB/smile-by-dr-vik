# Onboarding, Profile and Settings

This document describes first-run onboarding, the account profile (account name and preferred name), and the Settings area.

These features build on systems that already existed; none of them were replaced:

- **Supabase Auth**: email/password, verification, reset, and Sign in with Apple (native and web).
- **RevenueCat**: the `pro` entitlement, with server-side checks and complimentary overrides.
- **Generation allowance ledger**: the existing usage accounting.
- **Case log**: stored on the device only.

## Architecture

| Concern | Where |
|---|---|
| Onboarding decision logic (pure, tested) | `src/lib/onboarding.ts` |
| Onboarding UI | `src/components/onboarding/Onboarding.tsx`, `HowItWorks.tsx`, `src/app/onboarding.css` |
| Name helpers: normalise, display name, initials, email masking, greeting | `src/lib/profile.ts` (shared by app and server) |
| Account state: names, display name, initials, `updateProfile`, status loading | `src/components/account/AccountProvider.tsx` |
| Settings: iPhone list and iPad split view | `src/components/settings/*`, `src/app/settings.css` |
| Plan picker shared by the paywall and onboarding | `src/components/account/ProPlans.tsx` |
| Home: greeting, avatar button, recent cases | `src/components/home/HomeWorkspace.tsx` |
| Profile API | `POST /api/account/profile` (`handleProfileUpdate`); profile and storage are included in `GET /api/account/status` |
| Case archive, Recently Deleted, purge, counts | `src/lib/caseLog.ts`; window in `src/config/cases.ts` |
| App version and problem reports | `src/lib/appInfo.ts`; contacts in `src/config/support.ts` |

## Onboarding flow

```
WELCOME → ACCOUNT → PERSONALISE → HOW IT WORKS → SUBSCRIPTION → READY → Home
```

1. **Welcome.** The existing hero image, "Smile design, visualised.", the supporting copy, **Get Started**, and "Designed by Dr Vik".
2. **Account.** Offers:
   - **Continue with Apple**: the existing native or web flow.
   - **Continue with Email**: opens the existing `AuthSheet` in sign-up mode, with sign in, forgot password and verification.
   - **Explore without an account**: test mode and on-device use. This keeps the app usable without registration (App Review 5.1.1(v)).
3. **Personalise.** "What should SmileCompose call you?" with a large *Preferred name* field. The account name is shown underneath when known. **Continue** or **Skip for now**. Nothing else is asked: no registration number, practice, phone or date of birth.
4. **How it works.** One screen with Capture → Compose → Visualise → Share. It is laid out vertically on iPhone and as a horizontal row on iPad.
5. **Subscription.** Signed-in users only. It uses the same RevenueCat plan picker as the paywall, with:
   - localized StoreKit prices;
   - the allowance per plan from `src/config/subscriptions.ts`;
   - **Restore Purchases** and **Redeem Code** (Apple's redemption sheet);
   - **Not now** (on the web: **Continue**, since purchases happen in the iOS app).

   It is skipped automatically when `hasProAccess` is true, which covers subscribers and server-side complimentary access.
6. **Ready.** "You're all set, {name}." with **Create Your First Smile** and **Explore Case Library**. Onboarding is marked complete as soon as this screen is shown.

**Resume.** Onboarding has no stored state machine. The current step is derived from facts: signed in, preferred name set or skipped, *how it works* seen, Pro access, paywall deferred. An interrupted onboarding therefore reopens at the first step that is still unmet. For example, account created and name saved but no subscription reopens at **Subscription**. This is unit-tested.

**Completion storage:**

- **Signed-in users:** `profiles.onboarding_completed_at` on the server, plus a per-account cache on the device (`smile.onboarding.accounts[userId].completed`), so returning users are never shown onboarding again, even offline.
- **Not signed in:** `smile.onboarding.completedAt` on the device.

**Loading.** While the account status loads, onboarding shows "Loading your workspace…". If the status can't be loaded (offline), onboarding is not shown at all rather than trapping the user.

## Existing user migration

The rule is implemented in `onboardingDecision`.

| Situation | Behaviour |
|---|---|
| Signed-in account with generation history, **or** a device that already holds saved cases | Treated as an existing user. Asked only for a preferred name if none is set (with a "Welcome back" wording, and skippable), then onboarding is marked complete. No Welcome, How it works or paywall. |
| Existing user who already has a preferred name | Marked complete silently |
| Device with saved cases and no account (current web users) | Onboarding skipped entirely |
| `onboarding_completed_at` already set on the server | Never shown; the device cache is updated |

The migration backfills `full_name` from the old `display_name`, which only ever held Apple's name. It **does not** backfill `preferred_name`, because that is the user's own choice.

## Profile schema

Migration: `supabase/migrations/20260928100000_profile_onboarding_storage.sql`.

| Column (`public.profiles`) | Meaning | Rules |
|---|---|---|
| `full_name` | Account holder's name ("Vikas Bajaj") | 1–80 characters, no control characters; server-written only |
| `preferred_name` | How SmileCompose addresses the user ("Dr Vik") | 1–40 characters, no control characters; server-written only |
| `onboarding_completed_at` | First-run completion | Set once, never cleared by the app |
| `display_name` (existing) | Kept unchanged; the client grant on it is untouched | — |

Other points:

- **Email** is read from Supabase Auth, not duplicated. **Initials** are computed ("Dr Vik" → DV), not stored.
- **Display name fallback:** `preferred_name` → first word of `full_name` → a generic greeting. An email address (or Apple relay address) is never used as a name.
- **Subscription truth is not stored in the profile.** `hasProAccess` remains the RevenueCat `pro` entitlement, checked server-side, or a complimentary override. The existing `subscription_*` columns remain a webhook cache used only when RevenueCat is unreachable.

## Authentication behaviour

- **Apple name capture.** Apple supplies the name only on the first authorisation. The native flow now saves it through `POST /api/account/profile` with `onlyIfEmpty: true`, and to user metadata as a fallback. It **never overwrites** a name the user has set; the old code overwrote `display_name` on every Apple sign-in.
  - For web Apple sign-in, the status endpoint fills an empty `full_name` from Supabase user metadata once.
- **Canonical identity** remains `auth.users.id`, which is also the RevenueCat App User ID.
- **Hide My Email.** Relay addresses are detected (`@privaterelay.appleid.com`), labelled "Private relay address (Hide My Email)", masked by default (`v••••@••••.com`, with Show/Hide), and never used as the display name.
- **Sign-in methods.** Settings shows each method as Connected or Not set up. Adding a second method (identity linking) is **not offered** in V1, to avoid accidental duplicate accounts.
- **MFA.** The existing TOTP set-up and turn-off controls moved to Settings › Security. The server still enforces aal2 for enrolled accounts, including on the new profile endpoint.

## RevenueCat integration

Nothing about entitlement logic changed. Monthly, annual and offer-code users all resolve to the same `pro` entitlement through `hasProAccess`.

Settings › Subscription & Usage shows:

- **Plan** (Monthly or Annual, from the product ID). Complimentary access is labelled.
- **Renews / Ends / Expired {date}** from the server's RevenueCat check.
- A payment-problem warning, and a sandbox note.
- When not Pro: **Reactivate SmileCompose Pro** (expired) or **See SmileCompose Pro** (never subscribed).
- Buttons: **Manage Subscription** (Apple's management URL), **Restore Purchases** (refreshes CustomerInfo and the server status), **Redeem Offer Code** (Apple's sheet).
- On the web, these are replaced by guidance and a status refresh.

## Usage / generation data

Usage comes from the existing `generation_balance`. The server's `remaining` includes purchased credits, so Settings shows:

- **Included generations:** `included − used` of `included`, with a bar and "Resets {period_end}". The date is shown only when a current allowance period exists, so no reset date is ever invented.
- **Purchased generations:** shown separately, only when greater than 0.

No usage counters were added to the profile.

## Storage data

- A generic byte-based model in `public.storage_accounts` (`used_bytes`, `limit_bytes`). It has RLS (owner read-only), is written only by the server, is included in the account export, and is removed on account deletion.
- **V1 stores no patient media in the cloud** (a deliberate privacy position; see the DPIA). There are no rows, so the API reports 0 bytes with no limit. Settings says "Cloud storage: Not used — SmileCompose doesn't store your cases in the cloud."
- The **On this device** figure is the browser storage estimate, labelled as on-device. It is not presented as a backend quota.
- When cloud storage is built, the server maintains `storage_accounts` and the UI automatically shows "X of Y" with a bar.

## Case Library integration

- **Settings › Case Library:** Active and Archived counts, plus **Manage Case Library**, **Archived Cases** and **Recently Deleted**. The full case browser stays in **Cases**.
- **Manage screen:** tabs (Active / Archived / Recently Deleted), search, sort (newest, oldest, case reference A–Z), Archive / Unarchive, Delete (moves to Recently Deleted), Restore, Delete now, and Delete all permanently.
- **Soft deletion.** Deleting from Cases or Manage moves the case to **Recently Deleted**. It is purged permanently after `RECENTLY_DELETED_DAYS` (30, configurable in `src/config/cases.ts`; **OWNER DECISION**, not a legal period). The purge removes the entry and its photos. "Delete all cases", "Delete all data on this device" and "Delete now" remove data immediately.
- **Home.** "Good morning, Dr Vik", the **New Smile Design** CTA (renamed from "Start New Design"), and **Recent Cases** (three most recent active cases, with See all).
- **Read-only when expired.** All cases are local and remain accessible when Pro expires; only new AI generations require Pro.

## iPhone behaviour

- Full-screen Settings with a grouped list: profile card, Profile, Security, Subscription & Usage, Generations, Storage, Manage, Case Library, Privacy & Data, Support, About. Pages push in with a "‹ Settings" back button, and there is a **Done** button.
- Profile / avatar button (initials) top-right on Home; the in-flow menu shows the initials next to "Settings".
- Onboarding content is vertically centred and scrolls. When the keyboard opens on the name step, the field and Continue stay visible (checked on iPhone 18 Pro).

## iPad behaviour

- At 768 px and wider, Settings is a two-column split: a sidebar with the profile mini-card and sections, and a detail pane with its own header, back and Done. The panel is capped at 1040×960 px and centred.
- *How it works* is a horizontal four-step row. The onboarding content is limited to a readable width.
- The app has no sidebar navigation, so the avatar button and menu entry are used rather than a sidebar Settings item.

## Privacy considerations

- Onboarding collects only a preferred name (optional) and account sign-in. It collects no patient data and no professional or marketing details.
- There are no analytics or tracking. No onboarding events are sent anywhere.
- "Report a Problem" adds only app version, platform and OS version. It never attaches patient photos, case data, account ID or email.
- Profile names are account data (controller data). They are added to the privacy policy (version 2026-09-28), `docs/DATA_INVENTORY.md`, `docs/DATA_RETENTION.md` and the export. The Apple App Privacy "Name" type was already declared in `PrivacyInfo.xcprivacy`.
- Recently Deleted keeps deleted patient cases on the device for 30 days. This is disclosed in the app, the privacy policy and the retention schedule, and can be bypassed with "Delete now".

## Manual Supabase changes

1. Run `supabase/migrations/20260928100000_profile_onboarding_storage.sql` after the two earlier migrations (`supabase db push`, or the SQL editor).
2. No new secrets. The profile endpoint uses the existing service-role key on the Worker.
3. Optional: when cloud storage exists, maintain `storage_accounts` from the server.

## Manual Apple / RevenueCat steps

- No new products or entitlements. The existing `pro` entitlement and monthly/annual products are reused.
- Set `NEXT_PUBLIC_SUPPORT_EMAIL` (and optionally `NEXT_PUBLIC_HELP_URL`) for Support. Until then, the support rows are disabled with "A support contact will be published before release."
- App Store Connect: onboarding screenshots can use test mode. The paywall remains dismissible ("Not now").
- Confirm the Recently Deleted window (30 days) as a product decision.

## Items not tested

- **Real Supabase:** sign-up, email verification, sign in, password reset, Sign in with Apple (native and web), Apple name capture on first authorisation, profile saves through the API, and aal2 enforcement. These are covered by unit and handler tests with fakes, plus PGlite database tests of the migration. Nothing was tested against a live project.
- **RevenueCat / StoreKit:** plan loading, purchase, restore, offer-code redemption, Manage Subscription, renewal and expiry display, complimentary-access skip. These need App Store sandbox and TestFlight.
- **Account-state flows:** Hide My Email display with a real relay account, expired-subscriber state, and existing-user migration with a real account that has history. The logic is unit-tested only.
- **Physical devices:** only simulators and a browser were used (iPhone 18 Pro, iPad Pro 11" portrait, browser at iPad-landscape 1194×834 and iPhone SE 375×667). iPad landscape on a simulator could not be tested because the simulator runs headless without rotation control; the landscape layout was checked in the browser.
- **Support email links:** not tested, because no support email is configured.
