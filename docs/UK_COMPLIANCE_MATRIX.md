# UK compliance matrix: V1

Maps each UK requirement to the implementation and its status. Status values: PASS / PARTIAL / FAIL / NOT APPLICABLE / NOT VERIFIED. "PASS" means the **technical control** exists and was verified. It never means legal compliance: that requires the professional reviews in [PROFESSIONAL_REVIEW_REQUIRED.md](PROFESSIONAL_REVIEW_REQUIRED.md). SmileCompose must not be described as "GDPR certified" or "fully GDPR compliant".

## UK GDPR / DPA 2018

| Requirement | Implementation | Status |
|---|---|---|
| Art. 5(1)(a) Lawfulness, fairness, transparency | Layered notices (upload, AI processing), privacy policy generated from one source | PARTIAL: lawful bases and legal text await review |
| Art. 5(1)(b) Purpose limitation | Generation only; no secondary use; no training | PASS (technical) |
| Art. 5(1)(c) Minimisation | Patient reference stays on device; random case ID; provider input stripped; library style off by default and server-enforced | PARTIAL: the whole photo is sent (no mouth crop) |
| Art. 5(1)(d) Accuracy | Disclaimer; clinician review | PASS (technical) |
| Art. 5(1)(e) Storage limitation | No server-side images; device deletion controls; 24 h request IDs | PARTIAL: retention periods are an owner decision; purges not scheduled |
| Art. 5(1)(f) Integrity and confidentiality | [SECURITY.md](SECURITY.md) | PARTIAL (see [SECURITY_REVIEW.md](SECURITY_REVIEW.md)) |
| Art. 5(2) Accountability | Consent/version records, audit log, docs set, DPIA draft | PARTIAL |
| Art. 6 / 9 Lawful basis and conditions | Register drafted | NOT VERIFIED (legal review) |
| Art. 12–14 Transparency | Privacy policy, patient-data section, in-app notices | PARTIAL: placeholders; the practice's patient notice is external |
| Art. 15 / 20 Access and portability | Export my data (server plus device JSON); `export_account_data` | PARTIAL: live flow not verified |
| Art. 16 Rectification | Supabase email change | PARTIAL |
| Art. 17 Erasure | Delete account (cascade, RevenueCat, Apple revoke); device deletion | PARTIAL: live flow not verified; backups per provider |
| Art. 18 / 21 Restriction and objection | Manual procedure | PARTIAL |
| Art. 22 Automated decisions | None: AI output is illustrative; the clinician decides | PASS (technical) |
| Art. 25 Data protection by design and default | Device-only storage, off-by-default library style, minimised input, no tracking, blocked unpaid tier | PASS (technical) |
| Art. 28 Processor contracts | Requirements drafted; DPAs to be accepted | NOT VERIFIED |
| Art. 30 ROPA | [ROPA.md](ROPA.md) draft | PARTIAL |
| Art. 32 Security | Controls implemented | PARTIAL |
| Art. 33 / 34 Breach notification | [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md), `incident_register` | PARTIAL: roles unassigned |
| Art. 35 DPIA | [DPIA.md](DPIA.md) | FAIL until signed off (**FINAL LEGAL/PRIVACY SIGN-OFF REQUIRED**) |
| Art. 37 DPO | — | NOT VERIFIED (owner decision) |
| Chapter V Transfers | [INTERNATIONAL_TRANSFERS.md](INTERNATIONAL_TRANSFERS.md) | NOT VERIFIED |
| Children (Art. 8, ICO Children's Code) | Adults-only patients in V1; clinician-facing app | PARTIAL: legal/DPIA decision pending |
| ICO data protection fee | Manual owner action | NOT VERIFIED |

## PECR

| Requirement | Implementation | Status |
|---|---|---|
| Reg. 6 storage and access | Only strictly necessary storage; no analytics or ads | PASS (technical); conclusion needs legal review |
| Reg. 22 electronic marketing | No marketing emails | NOT APPLICABLE |

## Medical devices (UK MDR 2002)

| Requirement | Status |
|---|---|
| Intended purpose documented; boundary controls | PARTIAL: [MEDICAL_DEVICE_BOUNDARY.md](MEDICAL_DEVICE_BOUNDARY.md) |
| Regulatory determination | NOT VERIFIED: **REQUIRES PROFESSIONAL REGULATORY REVIEW** |

## Consumer and contract (for clinician subscriptions)

| Requirement | Status |
|---|---|
| Pre-contract information, auto-renewal terms, cancellation | PARTIAL: paywall shows price, renewal and links; Apple handles cancellation and refunds; Terms await solicitor |
| Terms of Service | FAIL until reviewed: **LEGAL REVIEW REQUIRED** |

## Apple App Store (not UK law, but a release gate)

| Requirement | Status |
|---|---|
| Privacy manifest, purpose strings, no tracking | PASS |
| In-app account deletion (5.1.1(v)) | PASS (code); live NOT VERIFIED |
| IAP only, Restore, offer codes (3.1.1) | PASS (code); purchases NOT VERIFIED |
| Privacy policy URL, App Privacy answers | NOT VERIFIED (owner, App Store Connect) |
| Health and medical claims (1.4.1) | PARTIAL: depends on C1–C3 |
