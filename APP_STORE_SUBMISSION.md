# SmileCompose — App Store submission and compliance

Engineering review against Apple's App Review Guidelines as of 27 September 2026. It is not legal advice or a guarantee of approval. Run `npm run check:app-store` before every submission; it verifies the items marked ✓ below and lists what still needs your input.

## Guideline compliance

| Guideline | Requirement | Status in SmileCompose |
| --- | --- | --- |
| 2.1 App completeness | Reviewers can use every feature | ✓ Test mode runs the full flow offline with no account or charge. Provide a demo account (below) for live generation. **Deploy the backend first.** |
| 2.3 Accurate metadata | Description matches the app | Describe it as a concept-visualisation tool for dental professionals; no outcome guarantees. |
| 2.5.2 Self-contained | No downloaded executable code | ✓ App code is bundled. The on-device face model (WASM) is fetched by WebKit, which 2.5.2 permits. |
| 3.1.1 In-App Purchase | Digital subscriptions via IAP only; Restore | ✓ RevenueCat/StoreKit only; no Stripe or external purchase links in the app; *Restore Purchases* on paywall and in Settings. The web paywall text appears only on the website. |
| 3.1.1 Offer codes | Apple mechanism, no custom unlock codes | ✓ Apple's redemption sheet; no licence-key field. Complimentary access is server-side only. |
| 3.1.2 Subscriptions | Title, length, price, what's included; auto-renew terms; Terms (EULA) and Privacy links | ✓ Paywall shows plan, period, StoreKit price, generations per period, introductory offer if any, renewal terms and both links. Also add the EULA link to the App Store description (or a custom EULA in App Store Connect). |
| 4.2 Minimum functionality | More than a website wrapper | ✓ Bundled app; native camera, system photo picker, share sheet, Sign in with Apple, IAP, offline test mode. |
| 4.8 Login services | Offer Sign in with Apple if using third-party login | ✓ Sign in with Apple offered alongside email, with equal prominence. |
| 5.1.1(i) Privacy policy | In App Store Connect and in the app | ✓ In-app (Settings, sign-up, paywall), bundled for offline reading. **Complete the placeholders** in `public/privacy.html`, deploy, and enter its URL. |
| 5.1.1(ii) Permission | Clear purpose strings; no unnecessary access | ✓ Camera and "add to Photos" only. Full Photo Library access is never requested (the system picker needs none). |
| 5.1.1(v) Account deletion | Initiate deletion in the app | ✓ Settings → Delete account deletes the account server-side (not just sign-out), revokes Sign in with Apple, and warns that App Store subscriptions must be cancelled separately. |
| 5.1.2(i) Data sharing and third-party AI | Disclose and get permission before sharing personal data with third-party AI | ✓ Per-case confirmation names Google Gemini and what is sent, before any request; the server rejects unconfirmed live requests. |
| 5.1.3 Health data | Don't store personal health information in iCloud; no health data for ads | ✓ Case database excluded from iCloud/device backup; no advertising or analytics. |
| 5.1.2 Tracking / ATT | Ask only if tracking | ✓ No tracking; no ATT prompt. |
| 1.4.1 Medical | Inaccurate medical data could harm; disclose limitations | ✓ "Concept visualisation only…" disclaimer on results and exports. Decide the intended-purpose statement and MHRA status (see below). |
| Export compliance | Encryption declaration | ✓ `ITSAppUsesNonExemptEncryption = NO` (HTTPS through Apple's OS only). |
| Privacy manifest | Required-reason APIs and collected data declared | ✓ `ios/App/App/PrivacyInfo.xcprivacy`; RevenueCat and Capacitor ship their own. Check Xcode's *Generate Privacy Report* on the archive. |

## App Privacy answers (App Store Connect)

Data **is** collected. None is used for tracking, advertising or analytics. Every type below is **linked to the user** and used for **App Functionality** only. These match `PrivacyInfo.xcprivacy`.

| Category → type | Why | Notes |
| --- | --- | --- |
| Contact Info → Email Address | Account | Supabase |
| Contact Info → Name | Account display (optional, Sign in with Apple) | |
| Identifiers → User ID | Account and subscription identity | Supabase user ID, also RevenueCat App User ID |
| Purchases → Purchase History | Subscription status, restore | Apple/RevenueCat |
| Usage Data → Product Interaction | Generation allowance and usage history | Ledger; no images |
| User Content → Photos or Videos | Patient photo sent to generate a visualisation | Processed by Google Gemini, not stored by SmileCompose |
| Health & Fitness → Health | Clinical notes/measurements sent with a generation | Same flow as photos |

Not collected: location, contacts, browsing history, diagnostics or crash data, device IDs for tracking, financial info (Apple handles payment).

## Review information (draft notes for App Review)

> SmileCompose is a smile-design visualisation tool for dental professionals. Generated images are concept visualisations, not predicted clinical outcomes.
>
> **Without an account:** tap *Open test mode* on the start screen to try the full flow (design → generate → compare → save/share) with bundled synthetic images. No AI credits are used.
>
> **Live AI generation:** sign in with the demo account below (it has complimentary Pro access granted server-side), take or choose a photo of an adult smile, and confirm the AI-processing notice. Photos are processed by Google Gemini and are not stored by us. You may also purchase with a sandbox account.
>
> Demo account: `<review email>` / `<password>`
>
> Subscriptions: SmileCompose Pro Monthly and Annual (auto-renewing). Restore Purchases and Redeem Code are on the paywall and in Settings → Subscription. Account deletion: Settings → Account → Delete account.
>
> The sample portrait is AI-generated and does not depict a real patient.

Create the demo account with email sign-up, then grant it an override (see `PAYMENTS_AUTH_SETUP.md`, *Complimentary access*).

## Metadata checklist

- **Name** SmileCompose · **Subtitle** e.g. "Smile design, visualised." · **Category** Medical (or Productivity; Medical invites closer 1.4.1 review) · **Age rating** complete the questionnaire truthfully (no objectionable content; medical/treatment information: *infrequent*).
- **Description**: who it is for (dental professionals), what it does, "concept visualisation only" wording, subscription summary, and links to the Privacy Policy and Terms of Use (Apple standard EULA unless you supply your own).
- **Screenshots**: iPad 13-inch and iPhone 6.9-inch sets. Use the synthetic sample images or patients who have given written consent.
- **Support URL** and **Marketing URL**: provide real pages.
- **Privacy Policy URL**: `https://smile-by-dr-vik.drvik.workers.dev/privacy.html` (generated from `src/legal/privacyPolicy.ts`) once the owner/legal items are resolved, reviewed and deployed.
- **Terms**: in-app Terms of Service at `/terms.html` (structural draft, **LEGAL REVIEW REQUIRED**) plus Apple's standard EULA linked in the paywall and description.
- **Subscriptions**: both products *Ready to Submit* with review screenshot; submit them with the app version.

## Decisions only you can make

The full list is in [docs/PROFESSIONAL_REVIEW_REQUIRED.md](docs/PROFESSIONAL_REVIEW_REQUIRED.md) and [V1_READINESS.md](V1_READINESS.md).

1. **Legal entity and contact details** for the privacy policy and App Store listing (`NEXT_PUBLIC_LEGAL_*`, `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`).
2. **Intended purpose and MHRA status**: if the app is intended to inform diagnosis or treatment planning, it may be a medical device. Keep claims to communication/visualisation, or seek MHRA advice before launch.
3. **Data protection**: DPIA, processor terms with Google, Supabase, RevenueCat and Cloudflare, UK/EU transfer safeguards, retention policy.
4. **Prices and generation allowances** (`src/config/subscriptions.ts`).
5. **Terms of Service**: solicitor to complete `src/legal/termsOfService.ts`, then set `LEGAL_REVIEW_COMPLETE.terms` in `src/config/legal.ts`. Apple's standard EULA remains linked for the subscription.
