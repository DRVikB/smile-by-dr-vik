# Lawful basis register

> **REQUIRES LEGAL REVIEW.** Every basis below is a *proposal* for a solicitor/DPO to confirm or replace. The code does not depend on any particular basis. The in-app confirmations are accountability records, not the lawful basis itself (see note 3). Do not publish these as final until they are reviewed. The privacy policy shows them as placeholders (`src/legal/privacyPolicy.ts`).

## SmileCompose as controller (clinician / customer data)

| Purpose | Data | Proposed Article 6 basis | Reviewer decision |
|---|---|---|---|
| Create and run the account, sign-in, MFA, account deletion | Email, credentials, Apple ID, MFA factors | 6(1)(b) contract | ☐ |
| Sell subscriptions, apply entitlements, restore purchases | RevenueCat app user ID, purchase history, entitlement | 6(1)(b) contract | ☐ |
| Meter generation allowance; the usage ledger | Ledger, reservations, allowance periods | 6(1)(b) contract | ☐ |
| Accountability records (Terms/Privacy acceptance, upload-authority and AI-processing confirmations) | Consent records (random case ID only) | 6(1)(c) legal obligation (Art. 5(2)/24 accountability) or 6(1)(f) legitimate interests | ☐ |
| Security, fraud and abuse prevention; audit log; rate limiting | Security events, request IDs, IPs held by providers | 6(1)(f) legitimate interests (LIA required) | ☐ |
| Tax and accounting records (if any are held by us rather than Apple) | Subscription records | 6(1)(c) legal obligation | ☐ |
| Support and privacy requests | Correspondence | 6(1)(b) / 6(1)(c) for DSARs | ☐ |

No processing relies on consent under Article 6(1)(a) for clinician data. There is no marketing, analytics or tracking.

## Patient data (practice as controller; SmileCompose as proposed processor)

The **practice** must choose and document its own basis. The following are the options a reviewer would typically consider. SmileCompose must not choose them for the practice.

| Processing | Article 6 options for the practice | Article 9 condition options for the practice |
|---|---|---|
| Creating an illustrative smile visualisation for a patient consultation | 6(1)(e) public task (NHS), 6(1)(f) legitimate interests (private practice), or 6(1)(a) consent | 9(2)(h) health or social care with the DPA 2018 Sch. 1 Pt 1 para 2 condition and a professional duty of confidentiality, **or** 9(2)(a) explicit consent |
| Using other patients' finished-case photos as style references (library style) | As above, and compatibility with the original purpose must be assessed | As above. Explicit consent may be more appropriate for reuse |

**Open questions for the reviewer:**

1. Is a purely aesthetic visualisation "health care" for 9(2)(h), or is it closer to cosmetic marketing that needs explicit consent?
2. Are facial photographs processed here **biometric data** (Art. 4(14))? The on-device face analysis identifies landmarks but does not identify individuals, and the server does no facial recognition.
3. The upload-authority checkbox and the AI-processing confirmation record that the *clinician says* a basis and notice exist. They are not patient consent and do not create a lawful basis.
4. The adults-only restriction (`MINOR_PATIENTS_PERMITTED = false`) remains until this register and the DPIA address children.

## Legitimate interests assessments needed

- Security logging and audit trail (purpose, necessity, balancing; retention of pseudonymised events after account deletion).
- Retaining `account_deletions` hashes and `revenuecat_events` after account deletion.

Sign-off: ______________________ (solicitor/DPO), date ________
