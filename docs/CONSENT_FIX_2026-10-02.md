# Terms and privacy acceptance repair

The old sheet submitted document versions compiled into the app. A server document update could reject those versions with a generic retry message, leaving an installed app stuck. The precise version/environment of the user's failing installation has not been confirmed.

The sheet now fetches current text and versions together from `GET /api/account/consents`, offers those documents for review, submits both acceptances in one request, and verifies their persisted status before closing. A further document change requires another explicit agreement; no consent is inferred or automatically recorded. Expired sessions, unavailable servers and document-loading failures have actionable messages. Strict confirmations cannot silently succeed without a session.

## Validation

- 532 automated tests passed; lint and TypeScript checks passed.
- Production build and Cloudflare build passed.
- Staging deployed as Worker version `d7309cc7-c971-490b-bb2e-3d04e375c8dc` at `https://smile-by-dr-vik-staging.drvik.workers.dev`.
- Disposable live staging account: matching document bundle returned; batch acceptance saved both records; status confirmed both accepted; stale version returned `409 documents_changed` without being accepted. Auth fixture removed.
- Simulated browser account: legal text opened inside the sheet, agreement returned to the hub, and reload retained acceptance. Layouts inspected at 393×852, 1024×768 and 768×1024. These are browser viewport checks, not a physical iOS acceptance test.
- `npm run ios:sync` passed, including native bundle checks. An existing installed native app must receive the updated binary; syncing local files does not update the phone.

Production has not been deployed, in accordance with the Stage 3 staging-only instruction. Its account status and consent endpoints currently returned 404 during read-only checks. No patient cases, photos, balances, legal wording/review flags or subscriptions were changed by this repair.
