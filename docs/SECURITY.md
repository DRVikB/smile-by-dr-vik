# Security

This file describes the security design of SmileCompose V1. Verification status for each control is in [SECURITY_REVIEW.md](SECURITY_REVIEW.md). To report a vulnerability, contact [SECURITY CONTACT: OWNER DECISION REQUIRED].

## Architecture boundaries

- **Patient data never rests on our servers.** It lives on the clinician's device and passes through the Worker only in memory during generation.
- **Secrets are server-only.** These must never appear in the web bundle, the iOS bundle or any `NEXT_PUBLIC_` variable:
  - Gemini / Vertex credentials
  - The Supabase service-role key
  - RevenueCat secret and webhook keys
  - Apple private keys

  `scripts/build-native.mjs` scans the native bundle for credential names and service-role JWTs. `scripts/verify-production.mjs` rejects secret-looking public variables.
- **Public client keys** (Supabase anon key, RevenueCat `appl_` key) are designed to be public. All database access goes through RLS or service-role-only functions.

## Controls

| Area | Control | Where |
|---|---|---|
| Transport | HTTPS only; HSTS (1 year, subdomains); `upgrade-insecure-requests`; ATS on iOS (no exceptions) | `securityHeaders.ts`, `Info.plist` |
| Web headers | CSP `connect-src` allow-list, `frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; nosniff; `no-referrer`; `SAMEORIGIN`; Permissions-Policy; COOP | `securityHeaders.ts`, `public/_headers`, `sites-worker.ts` |
| Native WebView | CSP `connect-src` allow-list injected at build time; MediaPipe telemetry blocked | `build-native.mjs` |
| Authentication | Supabase Auth (PKCE; email verification; password reset; Sign in with Apple with nonce) | `src/services/auth/*` |
| MFA | TOTP (authenticator app). When a user has a verified factor, the server rejects `aal1` tokens (`mfa_required`) | `MfaSheet.tsx`, `src/server/access.ts` |
| Sessions | iOS: Keychain, `AfterFirstUnlockThisDeviceOnly`, wiped on reinstall. Web: `localStorage`. Auto-refresh; sign-out revokes | `SecureStoragePlugin.swift`, `supabaseClient.ts` |
| Authorisation | Row Level Security on every table. Privileged functions are `SECURITY DEFINER` with `EXECUTE` granted only to `service_role`. No user-editable role or admin flag. Complimentary access only via `access_overrides` (service role) | `supabase/migrations/*` |
| Entitlement | Server checks RevenueCat's REST API (authoritative) plus overrides; the client state is never trusted | `src/server/access.ts` |
| Abuse / cost | Per-request idempotency (Durable Object); allowance reservation with a row lock; per-user rate limit (6 per minute); request size and schema limits; allowed origins | `handler.ts`, migrations |
| Webhooks | RevenueCat `Authorization` shared secret compared in constant time; idempotent by event ID | `revenuecatWebhook.ts` |
| Audit | Append-only `security_audit_log`, written by triggers: password or email change, sign-in method link/unlink, override grant/revoke, credit adjustment, subscription events, account deletion. Pseudonymised on deletion | `20260927180000_privacy_security_controls.sql` |
| Logging | Worker observability off. `safeLog` accepts only primitive fields. It redacts data URLs, long base64, JWTs, bearer tokens, API keys, signed-URL parameters and emails, and truncates each field to 500 characters. Request bodies and notes are never passed to it | `src/server/redact.ts` |
| Device | Patient stores excluded from backup; App Switcher privacy cover; photo picker without library permission; temp photo files deleted | iOS sources |
| Deletion | In-app account deletion: RevenueCat subscriber deletion, Apple token revocation, Supabase user deletion (cascade) | `accountHandlers.ts` |
| Supply chain | Lockfile; Capacitor via SPM with a pinned `Package.resolved`; no analytics or ads SDKs | `package-lock.json` |

## Environment separation

| Environment | Worker | Data | Provider |
|---|---|---|---|
| Local dev | `npm run dev` | Synthetic only | `SMILE_PROVIDER=mock` or test mode |
| Staging | `wrangler deploy --env staging` (`smile-by-dr-vik-staging`) | **Synthetic / demo only** | `mock` by default. Separate Supabase project and separate secrets |
| Production | `wrangler deploy` | Real patient data **only after** V1 readiness sign-off | Gemini paid / Vertex with the data-terms gate |

Never copy production data into staging or tests. Never commit real patient images (see "Test data" below).

## Test data

Tests use generated PNGs and fixtures. `Claude outputs/smile_test_result.png` is tracked in git and its provenance is unconfirmed. **OWNER ACTION:** confirm that it is not a real patient, or remove it from the repository and its history.

## Operational requirements (owner)

- Enable in Supabase: leaked-password protection, a minimum password length of 10 or more, MFA (TOTP), email confirmation, custom SMTP, and rate limits. Keep the service-role key only in Worker secrets.
- Restrict Cloudflare account access with MFA and least privilege. Keep Worker Logs and Logpush off, or confirm that they never capture bodies.
- Google Cloud: a dedicated project; billing enabled (paid tier); AI Studio logging **off**; no dataset sharing; a restricted API key; or Vertex with a least-privilege service account.
- Rotate credentials on staff change or suspected exposure ([INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)).
- An annual independent penetration test is recommended before scaling.
