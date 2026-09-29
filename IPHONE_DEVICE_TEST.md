# Installing SmileCompose on your iPhone and testing it

Prepared 2026-09-28 on branch `release/v1-device-test`.

## 0. Before you start

- **Apple Developer Program membership (paid) is needed.** The app uses *Sign in with Apple*, a capability a free personal team can't sign.
- **Backend:** sign-in, subscriptions, the cloud Case Library and generation need the staging setup in [ENVIRONMENTS.md › Setting up staging](ENVIRONMENTS.md#setting-up-staging-for-a-physical-iphone-test) (Supabase project + migrations, RevenueCat, the current Worker deployed, public keys in `.env.local`). Without it the app still installs and runs; photos, Compose, test mode and patient Cases work on the device, but sign-in and generation are unavailable (the bundle check says "accounts NOT configured").
- Xcode 27 is installed and selected (`xcode-select -p` → `/Applications/Xcode.app/Contents/Developer`).

## 1. Commands

```bash
cd "/Users/vik/Documents/New project/smile"
```

```bash
npm ci
```

```bash
npm run ios:sync
```

```bash
npm run ios:open
```

`npm run ios:sync` = production web build → `dist/native` → `npx cap sync ios` → bundle check (no dev server, no secrets, correct app ID/name, sync duplicates removed). It must end with "iOS bundle check passed". `npm run ios:open` opens the Xcode project.

After changing `.env.local` (e.g. adding the Supabase keys), run `npm run ios:sync` again.

## 2. Xcode steps

1. Xcode opens **`ios/App/App.xcodeproj`** (a project, not a workspace — Capacitor uses Swift Package Manager here). Wait for "Resolving Package Graph" to finish.
2. In the navigator select the **App** project → target **App** → **Signing & Capabilities**.
3. Check **Bundle Identifier** is `uk.co.drvik.smilecompose` (don't change it).
4. **Team:** choose your Apple Developer team.
5. Leave **Automatically manage signing** ticked.
6. Check the capability **Sign in with Apple** is listed. In-App Purchase needs no entitlement (it's enabled on the App ID); adding the "In-App Purchase" capability is optional.
7. Connect the iPhone by cable (or the same Wi-Fi after first pairing). Unlock it and tap **Trust** if asked.
8. In the toolbar destination menu choose your **iPhone** (not a simulator).
9. On the iPhone, if asked: **Settings › Privacy & Security › Developer Mode** → on → restart → confirm.
10. Press **Run** (▶).
11. First install from a new team: on the iPhone go to **Settings › General › VPN & Device Management**, trust your developer certificate, then Run again.

Scheme **App**, configuration Debug is fine for device testing; Release is used for Archive.

## 3. Test without paying

- Sign in once in the app (Apple or email), copy your user UUID from Supabase › Authentication › Users, then grant complimentary access with the SQL in [ENVIRONMENTS.md › Complimentary access](ENVIRONMENTS.md#complimentary-access-for-your-own-testing). The app can't grant this itself.
- Or use App Store sandbox purchases (Settings › Developer › Sandbox Apple Account on the iPhone) once the products exist in App Store Connect and RevenueCat.

## 4. Physical iPhone checklist

Tick each item; note the iOS version and iPhone model.

### Installation
- [ ] App installs from Xcode
- [ ] App icon correct on the Home Screen
- [ ] Launch screen: SmileCompose symbol, wordmark, "Designed By" Dr Vik logo (Light and Dark)
- [ ] Opens straight into the app without a blank flash or crash

### Onboarding
- [ ] Welcome
- [ ] Continue with Apple (also: cancel the Apple sheet → returns calmly); Continue with Email (verification email opens the app)
- [ ] Preferred name saved
- [ ] Profile photo: Take Photo, Choose Photo, crop, saved
- [ ] How It Works
- [ ] Your Style: add finished cases (authority confirmation once) or "I'll do this later"
- [ ] Subscription / complimentary access respected (no paywall when you have access)
- [ ] You're all set → Home; relaunch doesn't repeat onboarding

### Profile
- [ ] Initials when there's no photo
- [ ] Photo shows on Home (top right) and in Settings
- [ ] Replace photo; remove photo → initials

### Patient workflow
- [ ] New Smile Design → Take Photo (camera permission prompt, then camera)
- [ ] Choose Photo (system picker; no "allow full library access" prompt)
- [ ] Compose controls; Generate (needs the staging backend) → result
- [ ] Result saved; appears in Cases; reopen it
- [ ] Refine (Softer / Stronger / three options)
- [ ] Before/After slider drags smoothly without scrolling the page; full screen works
- [ ] Share: Save Image → share sheet → Photos, Files, AirDrop

### Case Library
- [ ] Settings › Case Library › Add Finished Case (tags, photo)
- [ ] Reference persists after relaunch
- [ ] Compose shows "Case Library · N matching references"
- [ ] Generate → result says "N Case Library references were used" (the server attached them)
- [ ] Switch "Use my Case Library" off → generate → no references used

### Appearance
- [ ] Light Mode throughout
- [ ] Dark Mode throughout (patient photos not tinted)
- [ ] Switch Light ↔ Dark in Control Centre while the app is open → updates immediately
- [ ] Settings › Appearance System / Light / Dark applies without restart

### Native
- [ ] Camera and photo picker as above
- [ ] Share sheet as above
- [ ] Keyboard: sign-in, email, password (AutoFill offered), preferred name, case label, notes — field stays visible, keyboard dismisses
- [ ] Safe areas: nothing under the Dynamic Island / status bar or home indicator, portrait and landscape
- [ ] (Haptics are not used in V1)

### Connectivity
- [ ] Wi-Fi
- [ ] Mobile data
- [ ] Aeroplane mode: saved Cases still open; Generate says an internet connection is needed (no endless spinner)
- [ ] Background the app mid-way and return; lock/unlock; the App Switcher shows the privacy cover

Report anything odd with a screenshot and the time it happened.
