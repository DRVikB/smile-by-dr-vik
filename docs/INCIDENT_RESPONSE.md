# Incident response and personal data breach procedure

Incident lead: [OWNER DECISION REQUIRED]. Deputy: [OWNER DECISION REQUIRED]. Legal/DPO contact: [OWNER DECISION REQUIRED].

## Legal timescales (UK GDPR)

- **As controller** (clinician account data): notify the **ICO within 72 hours** of becoming aware of a breach, unless it is unlikely to result in a risk to individuals' rights and freedoms (Art. 33). If notification is late, give reasons. Notify affected individuals **without undue delay** where there is a **high risk** (Art. 34).
- **As processor** (patient data processed for practices): notify the affected **practice(s) without undue delay** after becoming aware (Art. 33(2)), with the information they need for their own 72-hour decision. The DPA should set a concrete timescale.
- Record **every** breach, including those not reported, in the breach log (Art. 33(5)).

## Steps

1. **Detect and triage (hour 0).** Open an entry in `public.incident_register` (service role only) or the offline log. Record `date_detected` and, once confirmed, `date_awareness_established`. The 72-hour clock runs from awareness.
2. **Contain.** Revoke or rotate the affected credentials:
   - Gemini key or Vertex service account
   - Supabase service-role key and JWT secret (this forces re-login)
   - RevenueCat secret and webhook auth
   - Apple key

   Also: block routes by redeploying the Worker with `SMILE_PROVIDER=mock` to stop AI processing; disable affected accounts; preserve evidence (Supabase audit log, `security_audit_log`).
3. **Assess risk.** Data categories (special category = higher risk), number of people, identifiability, likely consequences, and mitigations (encryption, no server-side images).
4. **Notify.** ICO (online form or helpline) within 72 hours if required; practices; individuals if high risk; processors as relevant.
5. **Recover and learn.** Root cause, fixes, DPIA update, and a note in the register (`actions`, `lessons_learned` if added).

## Breach log fields (`incident_register`)

`incident_id`, `date_detected`, `date_awareness_established`, `summary`, `data_involved`, `number_affected`, `risk_assessment`, `containment`, `ico_notification_required`, `ico_notified_at`, `individual_notification_required`, `individuals_notified_at`, `customers_notified_at`, `actions`. Do not put patient images or unnecessary personal data in the log.

## Scenario notes

| Scenario | Patient data exposure | First actions |
|---|---|---|
| Gemini key leaked | None stored, but an attacker could incur cost | Rotate the key; check Google usage; the allowance gate limits abuse via our API |
| Supabase service-role key leaked | Account data (no patient images) | Rotate the key and JWT secret; review the audit log; assess notification |
| Clinician device lost | Cases on the device | Customer's responsibility as controller; advise remote wipe; we can revoke sessions (sign out all) |
| Cloudflare / Google processor breach | Patient images in transit or in abuse logs | Obtain details from the provider; notify practices without undue delay |
| Wrong-account data access (RLS bug) | Account data | Disable the affected function; fix; test; assess |
