# Internal TestFlight builds

An internal TestFlight build is a release build for your own App Store Connect team (up to 100 internal testers). Apple does not review it. It has every release check except the legal sign-off:

- live RevenueCat Apple key (`appl_…`) and Supabase configuration required;
- private QA capture and harness switches refused;
- no provider credentials in the bundle;
- the privacy policy and terms may still contain owner/legal placeholders. They stay visibly marked as drafts, and Settings › About says **Internal TestFlight build · legal pages are drafts**.

It is **not** for external testers or App Store review. Both require the finished legal pages (`npm run ios:release` refuses until they are done).

The web bundle uses the API and account settings in `.env.local`, currently the **staging** server and accounts.

## Before the first upload (once)

1. An Apple Developer Program membership, with you as Account Holder or Admin.
2. An app record in App Store Connect (My Apps › + › New App) with the bundle ID **uk.co.drvik.smilecompose**.
3. Xcode signed in to that Apple account (Xcode › Settings › Accounts), and the App target set to *Automatically manage signing* with your team.

## Each upload

```bash
npm run ios:bump-build
```
(Skip for the very first upload; every later upload needs a higher build number.)

```bash
npm run ios:testflight-internal
```

```bash
npm run ios:open
```

Then, in Xcode:

1. Choose **Any iOS Device (arm64)** as the run destination.
2. **Product › Archive**.
3. In the Organizer, choose **Distribute App › TestFlight Internal Only › Distribute**. This option keeps the build away from external testing and App Store review.
4. In App Store Connect › TestFlight, add internal testers once the build finishes processing (usually 10–30 minutes). Testers install it with the TestFlight app.

Export compliance is already declared in `Info.plist` (HTTPS only), so no compliance questions should block the build.
