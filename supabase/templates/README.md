# SmileCompose account emails

Eight branded, responsive templates, built with table layouts, inline styles,
system fonts, accessible image fallbacks and Supabase's existing secure links.
The wordmark and action remain visible when images are blocked. The small
Dr Vik logo is the only remote image; no analytics or tracking pixels are added.

## Rebuild and preview

```sh
node scripts/build-auth-emails.mjs
python3 -m http.server 3018 --bind 127.0.0.1 --directory output/auth-emails
```

Open `http://127.0.0.1:3018/`. Preview links deliberately point to
`example.invalid`; the preview cannot confirm an account or send email.

Source of truth: `scripts/build-auth-emails.mjs`. Generated HTML and subjects
are committed here. `output/auth-emails/staging-patch.json` is an ignored
Management API payload containing only templates, subjects and the requested
sender display name, **SmileCompose**. It contains no credentials.

## Activation status — 2 October 2026

- Staging target: **smilecompose-staging**, `wukcqlpuzkzwxmdkotfg`.
- Applying the branding was rejected with HTTP 400: email template modification
  is unavailable on the free tier using the default email provider. Supabase
  requires a custom SMTP provider or a plan upgrade first.
- The templates are **prepared, not live**. No emails have been sent by this work.
- Custom sender domain, From address and SMTP provider still need the owner's
  choice. Do not invent or activate an unverified sender address.
- Do not upgrade the Supabase plan or buy an email service without authorization.

## Finish setup

1. Connect the chosen transactional email provider to an owner-controlled sender
   domain. Verify its required DNS records and configure SPF, DKIM and DMARC.
   Keep existing mail records intact. Disable link tracking for auth emails.
2. Set Supabase Auth's custom SMTP credentials through secure settings, never
   a public app environment variable or a committed file. Use **SmileCompose**
   for the sender display name and the verified address for From.
3. Apply the generated payload with the Supabase Management API:
   `PATCH /v1/projects/wukcqlpuzkzwxmdkotfg/config/auth`.
   Keep the management access token out of logs and source control. Alternatively,
   paste each HTML file and its manifest subject in Auth → Emails → Templates.
4. Read the configuration back and compare all eight HTML bodies and subjects,
   plus `smtp_sender_name`, against the payload. The current CLI config diff
   compares subjects but does not compare HTML bodies or the sender name;
   an empty CLI diff alone does not prove full installation.
5. With explicit permission to send a test, verify confirmation and recovery
   using a dedicated test account on the same device that requested each link.
   Check inbox placement, branded From, and iOS deep-link/password-reset handling.

Keep `{{ .ConfirmationURL }}` intact. It includes the authentication token and
the caller's redirect; replacing it with a plain app URL breaks confirmation.
Keep `{{ .Token }}` intact for reauthentication; the provider chooses its length.
Do not weaken confirmation, OTP limits, Apple sign-in, MFA or redirect rules.
Template installation does not enable new sign-in methods or notifications.

Default image origin is the staging app. Before a separately authorized production
deployment, rebuild with `SMILE_EMAIL_ASSET_ORIGIN` set to the permanent public
HTTPS origin. Never embed patient photos or case information in these emails.

## Verification performed

- Confirmation layout inspected at desktop and 390px phone widths; recovery also checked at 390px with no horizontal overflow and a loaded logo.
- All eight files parsed: no script/form/iframe, secure action placeholders only,
  image alt text and explicit dimensions, and small HTML payloads.
- Generator lint passed.
- Actual inbox rendering/delivery and live template installation await SMTP.

References: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
