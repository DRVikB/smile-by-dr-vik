# SmileCompose V1 — physical iPhone test gate

Prepared 2 October 2026. This is readiness for direct-device testing, not clinical acceptance or permission to distribute. No installation, TestFlight upload, schema change, payment configuration change or live AI generation was performed in this pass.

## Release state

| Check | Evidence |
| --- | --- |
| Branch | `release/v1-device-test` |
| Base commit | `eacc0c937168a6dcb7fa10beb553fdc2c39cc78e` |
| Working tree | Clean at start. This build also contains the uncommitted, narrowly scoped QA diagnostics and regression tests described below. |
| Generation fixes | Completed Gemini images only; shorter photographic prompt; optional tooth mapping; removal of tissue-colour filtering; rejection of unalignable generated faces before presentation. Commits `17ae0b0`, `a103b7d`, `e623036`, `0131786`. |
| Account fixes | Versioned consent acceptance (`cc1e5ce`), returning-user sign-in/confirmation recovery (`7cb535b`). Branded email templates (`eacc0c9`) are prepared, not activated. |
| Sync | Account-isolated case repository, cloud outbox/private media and legacy import included in `6f48042` and subsequent commits. Physical-device acceptance remains pending. |
| Staging backend | `https://smile-by-dr-vik-staging.drvik.workers.dev` |
| Live Worker version | `6ec38868-120f-4224-af91-0be7668d58b3`, 100% staging traffic; deployed 2 October 2026 at 19:03 UTC. No backend deployment in this pass. |
| Staging Supabase | `smilecompose-staging`, `wukcqlpuzkzwxmdkotfg`, London (`eu-west-2`), `ACTIVE_HEALTHY`. Native email/Apple providers enabled. |
| RevenueCat | SmileCompose App Store app `appb4a1d5eb2d`; both Apple credentials configured; bundled public SDK key matches that app. No key values reproduced. |
| Bundle/version | `uk.co.drvik.smilecompose`, version `1.0`, build `1` |

## Build and configuration checks

- PASS: TypeScript, lint and all **550** automated tests.
- PASS: production Next.js web build, native packaging, Capacitor sync, native secret isolation/CSP checks and production asset checks.
- PASS: Xcode **Release / iphoneos / arm64**, development-signed using team **VIKAS BAJAJ — `7TPF7LT884`**. The embedded profile includes the connected iPhone and expires 2 October 2027.
- PASS: code signature verification and byte-for-byte matching of the signed app's packaged web files to the synced bundle.
- PASS: staging API/Supabase URLs and correct Apple public SDK key embedded; no native `server.url`/development server. Native requests use HTTPS staging.
- PASS: `TOOTH_MAP_DEBUG` compiles to false; developer controls return no UI. Bundled sample/test mode remains labelled and uses no provider request or allowance.
- PASS: real generation uses the authenticated server allowance path; no hosted development/free-generation bypass enabled. Public generation-cost endpoint returns `gemini-3.1-flash-image`; unsigned account-status requests return 401.
- PASS: signed Apple sign-in entitlement and `NSFileProtectionComplete`; StoreKit linked and an explicit App ID used. In-App Purchase is enabled by default for explicit App IDs; it is not a separate entitlement to invent in the plist. Apple product configuration remains incomplete (below).
- PASS: camera/save-to-Photos purpose strings, system photo picker, bundled privacy manifest with tracking false. No broad photo-library read permission is requested.

The Supabase SDK contains an unused `http://localhost:9999` default string. The app supplies the verified staging URL explicitly; this default is not an active endpoint. `capacitor://localhost` is the packaged app's local origin, not a development server. No dependency was patched merely to remove these strings.

Build command used:

```sh
NEXT_PUBLIC_SMILE_QA_DIAGNOSTICS=1 NEXT_PUBLIC_SMILE_DEBUG=0 npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/smile-device-consent \
  -allowProvisioningUpdates build
```

Signed app: `/tmp/smile-device-consent/Build/Products/Release-iphoneos/App.app`.

Evidence: `output/iphone-release-gate/` (ignored local logs and signed-build verification). This uses the existing direct-device packaging path. The separate `SMILE_RELEASE_BUILD=1` distribution guard remains unchanged; draft legal documents still block that distribution workflow.

## Gate outcome

- **IPHONE BUILD: READY** for manual testing; not installed by this pass.
- **SIGNING: READY** for this physical iPhone.
- **STAGING CONFIG: READY** for the requested native test.
- **APPLE SIGN-IN: READY FOR DEVICE TEST**; a successful physical sign-in is not yet proven. Browser OAuth configuration and Apple account-deletion/revocation remain separate unfinished work.
- **REVENUECAT: NOT READY** for a complete sandbox acceptance pass. Both products currently report `MISSING_METADATA`, with no localized descriptions/review information. Genuine webhook delivery and purchase/restore remain unverified. Existing server-authorised account access can be used for the core app tests; no allowance bypass was added.

## Exact Xcode install steps

1. Open `/Users/vik/Documents/New project/smile/ios/App/App.xcodeproj` in Xcode.
2. Connect and unlock **Vikas’ iPhone**. Accept **Trust This Computer** if prompted.
3. Xcode → **Settings → Apple Accounts**: sign in to the developer account if needed.
4. Click the blue **App** project → **TARGETS → App → Signing & Capabilities**. Enable **Automatically manage signing**. Select **VIKAS BAJAJ**, team ID `7TPF7LT884`. Keep bundle ID `uk.co.drvik.smilecompose`. Confirm the same team on **SmileComposeWidgetExtension**.
5. In the toolbar select scheme **App** and destination **Vikas’ iPhone** (physical iPhone 17 Pro Max).
6. **Product → Scheme → Edit Scheme → Run → Info**: set **Build Configuration = Release**. For independent app behaviour, uncheck **Debug executable**. Close the editor.
7. Click **Run ▶︎** or press **⌘R**. Wait for installation and launch. Install over the existing app; do not uninstall it or erase local cases.
8. If iOS requires it: **Settings → Privacy & Security → Developer Mode → On**, restart, then confirm. If an **Untrusted Developer** message specifically appears, use **Settings → General → VPN & Device Management** to trust your developer entry. Reopen SmileCompose.
9. After it opens, disconnect from Xcode for the force-close/background tests. The app must work using its packaged files and staging backend, with no Mac web server running.

Stop here for installation. Do not choose Archive/Distribute or upload to TestFlight.

Apple references: [run on a physical device](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices), [Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device/), [In-App Purchase sandbox prerequisites](https://developer.apple.com/documentation/technotes/tn3186-troubleshooting-in-app-purchases-availability-in-the-sandbox).

## Short physical test script — run A to G

Use a consented test photograph and its app AI-processing permission. Label notes with a neutral fixture code (e.g. P01), not a name or clinical details. Record PASS / FAIL / NOT TESTED, time and allowance before/after. A generated image is an AI concept for clinician review, not a predicted or guaranteed clinical outcome.

### A. Account

- [ ] Launch; branding/status bar and controls remain visible.
- [ ] Sign in using the existing email account; accept current terms/privacy if shown and reach the hub.
- [ ] Log out and back in; correct profile, allowance and cases return.
- [ ] Test Apple sign-in and cancellation. A different Apple/relay email may create a separate account: do not mistake its empty library for loss of the email account's cases.
- [ ] Switch A → B → A: B cannot see A's cases/drafts/thumbnails; A's cases return on signing back in.

### B. Basic case

- [ ] Create a case; take a photo, then exercise Upload using a test JPG/HEIC. Confirm correct orientation and full-photo framing.
- [ ] Run Smile Analysis, select **6 teeth**, choose a meaningful change and Generate. Ordinary generation must not wait for a tooth map.
- [ ] Compare **Original / Concept**; drag comparison and overlay strength using touch.
- [ ] Save; fully swipe the app away; reopen the same case and concept.

### C. Generation precision

- [ ] Generate for **single tooth**, **4**, **6**, **8**, then **Custom** selections. Apply section E to each.
- [ ] For precise single-tooth protection, explicitly review/confirm the optional map and check its actual outline. Multi-tooth presets use mouth/face protection; exact tooth boundary preservation is a visual acceptance check, not an assumption.

### D. Treatments

- [ ] Test **Whitening**, **Composite**, **Porcelain**, **Alignment concept**, and **Full arch** if a suitable test case is available. Record Full arch as NOT TESTED if skipped. Apply section E each time.

### E. Quality review — every generation

- [ ] Expression; lips; mouth opening; mouth width.
- [ ] Gingiva; selected tooth boundaries; unselected teeth.
- [ ] Tooth proportions/length; crop/alignment.
- [ ] No grey/blank output; no obvious AI artefacts or patch seams.

Gingival preservation is **not guaranteed**. Compare it directly with the original. Mark an unacceptable image FAIL; do not present it as an approved patient concept.

### F. Storage and export

- [ ] Save and reopen; create a second concept and mark it preferred.
- [ ] Close/reopen: both concepts and the preferred selection persist.
- [ ] Export preview and report from the reopened case; images/settings correspond to the selected version and retain the AI-concept notice. Try cancelling the share sheet too.

### G. Failure and recovery

- [ ] Background during generation, then return; no stuck controls or silently duplicated request.
- [ ] Go temporarily offline before Generate: clear feedback and no allowance deduction; work remains available. Reconnect and deliberately retry once.
- [ ] If connection is lost after submission, reopen/check saved results and allowance before retrying; the server may have completed the request.
- [ ] On an actual provider failure, verify no unusable case is saved and the allowance is restored. Record request ID and before/after balance.
- [ ] If HTTP 200 is followed by a client alignment/composite rejection, record that separately: the server has already completed generation and automatic refund for that client rejection is not implemented. Do not assume it was refunded.

## Private device QA diagnostics

Only this QA bundle opts into local diagnostics (`NEXT_PUBLIC_SMILE_QA_DIAGNOSTICS=1`). The last **30** request records are retained in the app's private **Library/Caches/smile-generation-qa.json**, surviving ordinary relaunch; iOS can evict caches. Writes are asynchronous and cannot block generation. No telemetry service or cloud logging is enabled.

Each allowlisted record contains: request UUID (same as server request header), time, generation path, selected tooth count, source/prepared pixel dimensions, HTTP response status (null if none), last preparation/alignment/mask/composite stage, outcome and a categorical error code. It excludes images, base64, prompts, clinical notes, names, email, case/account IDs, tokens and raw error messages. A `running` record after force-quit identifies the last recorded stage; it does not establish server outcome.

After a failure, keep the app installed and reconnect/unlock the phone. Retrieve **only the diagnostic file**, without downloading the patient-data container:

```sh
cd "/Users/vik/Documents/New project/smile"
xcrun devicectl device copy from \
  --device 00008150-000A705901D8401C \
  --domain-type appDataContainer \
  --domain-identifier uk.co.drvik.smilecompose \
  --source Library/Caches/smile-generation-qa.json \
  --destination output/iphone-release-gate/iphone-generation-qa.json
```

File creation/retrieval on the actual iPhone remains a manual check after installation. Automated tests verify redaction/allowlisting and request-ID/status correlation. If no file appears after a generation, mark diagnostics FAIL rather than enabling raw bridge logging.

Record findings with: `Step | PASS/FAIL/NOT TESTED | fixture code | time | request ID | allowance before/after | brief technical observation`.

**STOP after the physical test. Fix only reproduced failures in a follow-up pass.**
