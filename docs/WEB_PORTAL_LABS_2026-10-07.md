# Web portal and lab links (2026-10-07)

**Status:** built, tested and deployed to **staging only**. The database migration
`20261007120000_web_portal_labs.sql` is applied to staging (`smilecompose-staging`). Production is unchanged.

## What clinicians get (web, signed in, browser at least 1024 px wide)
- **Home:** a greeting, a photo drop zone and recent cases, filtered by In progress, With lab, Completed or Favourites.
- **New case:** six photo slots: Smile front (used for the design), Smile left, Smile right, Retracted, Upper arch and Lower arch. Each case also has a name or initials and a practice reference, and requires an upload-authority confirmation.
- **Case:** concepts with a before/after slider and the photo set (drag a photo onto another slot to swap them).
  - Side panel: Details (name, reference, status), Design, Notes and Lab history.
  - Actions: Open in Design Studio, Present to patient (the existing saved-case viewer, with share, report and reveal video), and Send to lab.
- **Labs:** saved labs (name, email, contact) and every shared link with its status (Not opened, Viewed, Expired, Withdrawn). Any link can be withdrawn.
- **Unchanged:** the iOS app, and the web app on phone-sized screens.

## Data flow
- **Portal details** (name, reference, status, notes) and the photo set are stored in the case's synced state
  (`patient_cases.state.portal`). Photos are synced as a new asset kind, `CLINICAL_PHOTO`, with provenance
  `clinical`, in the existing private `patient-cases` bucket under the same owner-only policies.
- **Send to lab** uploads a *copy* of the chosen files to the private `lab-shares` bucket
  (`<owner>/<share>/<n>.<ext>`). It also creates a `lab_shares` row with:
  - the lab, case reference, specification and optional note;
  - consent time and expiry (7, 14 or 30 days; the database caps it at 31);
  - the **SHA-256 hash** of a random 256-bit token.
- The link `https://…/portal/<token>` is shown to the clinician once. SmileCompose sends no email; the
  clinician uses their own mail app (a `mailto:` draft).
- **The lab's page** (`/portal/<token>`) needs no account. It shows the case reference, the pack files, the
  specification and the note. It sends `noindex` and `no-referrer`, uses a strict CSP and no third-party code.
  Files are streamed through the Worker, so storage URLs are never exposed. Views are counted.
- **Access ends when a link is withdrawn or expires.** The copied files are deleted when the link is
  withdrawn, on the next visit or list after expiry, and by a daily Cron Trigger (03:17 UTC).
- **Account deletion:** cascades to `labs` and `lab_shares`, and removes the `lab-shares` objects.

## Needs owner and legal review before production
1. **Privacy policy:** add a section on lab sharing.
   - Patient photos and design details are shared with a dental laboratory only when the clinician
     chooses to, through an expiring private link.
   - What is shared, how long links last, and that the clinician confirms patient agreement.
   - Retention: deleted on withdrawal or expiry, and swept daily.
2. **DPIA / ROPA:** add recipients (dental labs chosen by the clinician) and the data roles.
   - The clinician is the controller and decides the disclosure; SmileCompose is the processor hosting the copy.
   - Risks: a forwarded link (mitigated by expiry, withdrawal, reference-only labels and noindex) and a wrong
     recipient (mitigated by saved lab contacts and withdrawal).
3. **DATA_INVENTORY / DATA_RETENTION:** add `labs`, `lab_shares`, the `lab-shares` bucket and `CLINICAL_PHOTO` assets.
4. **Wording of the consent checkbox** in Send to lab.

## Not yet done
- Live end-to-end test with a real signed-in account on staging (create a case, send it to a lab, open the link).
  Locally this was checked against a dummy session with the API stubbed. Server behaviour is covered by tests.
- Safari: a headless WebKit test context could not write the local case cache. This is believed to be a
  test-context limit (the iOS app uses the same storage), but check portal saving in desktop Safari on staging.

## Patient consent and admin dashboard (2026-10-08)

### Patient consent (case Details tab, web portal and app case page)
- The patient reads five statements on the practice's device and signs with a finger or stylus. Two are needed to design the smile (photos for planning; the design is a visualisation, not a guarantee). Lab sharing, a private reference library and marketing are optional.
- Saved with the case (`patient_cases.state.portal.consent`): wording version, time, name, each answer, and the signature as a private `CLINICAL_PHOTO` asset. Syncs like the rest of the case; never public.
- A one-page PDF can be downloaded or added to a lab pack (off by default). The Lab tab warns when the patient didn't agree to lab sharing.
- **Legal review needed:** the wording (`CONSENT_ITEMS` in `src/lib/portal.ts`) is a template. Change `CONSENT_VERSION` whenever it changes. Withdrawal is handled by recording a new consent or removing the record.

### Admin dashboard (web portal › Admin)
- Visible only to accounts in `public.admin_users` (server-checked on every call). Staging: the owner's account is listed. **Production: insert the owner's user id after production is set up.**
- Overview (accounts, subscribers, generations per day, estimated cost at `ESTIMATED_GENERATION_COST_GBP`, cases, lab link totals, enquiries) and a notification feed (enquiries, new accounts, subscription events). Lab activity is shown only as totals, so clinicians' case references never reach the admin view.
- Accounts: search, add/remove extra generations (1–1,000, audited via `admin_adjust_generations`), unlimited on/off (`admin_set_unlimited`, audited).
- Enquiries: status New / Contacted / Closed with notes.
- Recommended: turn on two-factor sign-in for admin accounts.
