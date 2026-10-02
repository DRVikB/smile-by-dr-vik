import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false);

// Static App Store readiness checks for the iOS project. Engineering checks
// fail the command; items that need the owner's information are reported as
// "ACTION" so they can't be forgotten. This is not a substitute for App Review.
const read = (path) => readFile(path, "utf8");
const results = [];
const check = (ok, label, detail = "") => results.push({ ok, label, detail });
const action = (done, label) => results.push({ ok: done, label, action: true });

const plist = await read("ios/App/App/Info.plist");
const pbx = await read("ios/App/App.xcodeproj/project.pbxproj");
const manifest = await read("ios/App/App/PrivacyInfo.xcprivacy");
const entitlements = await read("ios/App/App/App.entitlements");
const pkg = JSON.parse(await read("package.json"));
const subscriptions = await read("src/config/subscriptions.ts");
const paywall = await read("src/components/account/ProPlans.tsx");
const settings = (await Promise.all(["SettingsView", "PrivacySettings", "SubscriptionSettings", "ProfileSettings"].map(f => read(`src/components/settings/${f}.tsx`)))).join("\n");
const onboarding = await read("src/components/onboarding/Onboarding.tsx");
const privacy = await read("public/privacy.html");
const terms = await read("public/terms.html");
const pendingItems = (html) => html.match(/data-required/g)?.length ?? 0;
const appDelegate = await read("ios/App/App/AppDelegate.swift");
const sceneDelegate = await read("ios/App/App/SceneDelegate.swift");
const secureStorage = await read("ios/App/App/SecureStoragePlugin.swift");

check(pbx.includes("PRODUCT_BUNDLE_IDENTIFIER = uk.co.drvik.smilecompose;"), "Bundle identifier uk.co.drvik.smilecompose");
check(pbx.includes('TARGETED_DEVICE_FAMILY = "1,2"'), "iPhone and iPad supported");
check(plist.includes("NSCameraUsageDescription"), "Camera purpose string (5.1.1)");
check(plist.includes("NSPhotoLibraryAddUsageDescription"), "Photo library add purpose string (share sheet Save Image)");
check(!plist.includes("NSPhotoLibraryUsageDescription"), "No full Photo Library access requested (system picker is used)");
check(/ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist), "Export compliance declared (HTTPS only)");
check(plist.includes("<string>uk.co.drvik.smilecompose</string>"), "Auth deep-link URL scheme registered");
check(entitlements.includes("com.apple.developer.applesignin"), "Sign in with Apple entitlement (4.8)");
check(pbx.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;"), "Entitlements file linked to the App target");
check(pbx.includes("PrivacyInfo.xcprivacy in Resources"), "Privacy manifest bundled");
check(manifest.includes("NSPrivacyAccessedAPICategoryFileTimestamp") && manifest.includes("C617.1"), "Required-reason API declared: file timestamps");
check(/NSPrivacyTracking<\/key>\s*<false\/>/.test(manifest), "No tracking declared");
check(appDelegate.includes("isExcludedFromBackup = true"), "Patient data excluded from iCloud backup (5.1.3)");
check(entitlements.includes("NSFileProtectionComplete") && appDelegate.includes("FileProtectionType.complete"), "Complete Data Protection configured; physical lock/unlock verification required");
check(pbx.includes("SecureStoragePlugin.swift in Sources") && secureStorage.includes("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly"), "Sign-in session stored in the Keychain (this device only)");
check(sceneDelegate.includes("sceneWillResignActive") && sceneDelegate.includes("privacyCover"), "App Switcher snapshot covered (no patient photo in snapshots)");
check(!Object.keys(pkg.dependencies ?? {}).some((d) => /stripe/i.test(d)), "No Stripe or external payment SDK in the app (3.1.1)");
check(Boolean(pkg.dependencies?.["@revenuecat/purchases-capacitor"]), "In-App Purchase via RevenueCat/StoreKit");
check(subscriptions.includes("uk.co.drvik.smilecompose.pro.monthly") && subscriptions.includes("uk.co.drvik.smilecompose.pro.annual"), "Product IDs centrally configured");
check(paywall.includes("Restore Purchases"), "Paywall: Restore Purchases (3.1.1)");
check(paywall.includes("Redeem Code") && paywall.includes("redeemOfferCode"), "Paywall: Apple offer-code redemption");
check(paywall.includes("priceString") && !/£\d|\$\d|€\d/.test(paywall), "Paywall: localized StoreKit prices, none hardcoded");
check(paywall.includes("renews automatically") && paywall.includes("TermsLink") && paywall.includes("PrivacyLink"), "Paywall: auto-renew terms, Terms and Privacy links (3.1.2)");
check(settings.includes("Delete account") && settings.includes("doesn’t cancel your App Store subscription"), "In-app account deletion with subscription notice (5.1.1(v))");
check(settings.includes("Delete all data on this device"), "Delete all local data control");
check(settings.includes("Manage Subscription") && settings.includes("Restore Purchases") && settings.includes("Redeem Offer Code"), "Settings: Manage Subscription, Restore Purchases, Redeem Offer Code");
check(onboarding.includes("<ProPlans") && onboarding.includes("Not now"), "Onboarding paywall reuses the StoreKit plan picker and can be dismissed");
check(onboarding.includes("Explore without an account"), "App usable without an account (test mode) — guideline 5.1.1(v)");

check(privacy.includes("ico.org.uk") && privacy.includes('id="patient-data"'), "Privacy policy: patient-data section and ICO complaint route");
check(terms.includes("Concept visualisation only"), "Terms: clinical boundary statement");
action(!pendingItems(privacy), `Resolve public/privacy.html owner/legal items (${pendingItems(privacy)} open) — legal entity, contact, lawful bases, retention; solicitor/DPO review`);
action(!pendingItems(terms), `Resolve public/terms.html (${pendingItems(terms)} open) — LEGAL REVIEW REQUIRED`);
action(Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for the release build");
action((process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY ?? "").startsWith("appl_"), "Set NEXT_PUBLIC_REVENUECAT_IOS_API_KEY (appl_…, not a test_ key) for the release build");

let failed = 0;
for (const r of results) {
  const mark = r.ok ? "PASS  " : r.action ? "ACTION" : "FAIL  ";
  if (!r.ok && !r.action) failed++;
  console.log(`${mark} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} satisfied. See APP_STORE_SUBMISSION.md for App Store Connect steps.`);
if (failed) process.exit(1);
