import type { CapacitorConfig } from "@capacitor/cli";

/**
 * SmileCompose iOS app. The production web build is packaged into the app
 * (webDir) — the app never loads the website remotely. Only API calls go to
 * the hosted backend (see src/config/app.ts). No secrets belong here.
 */
const config: CapacitorConfig = {
  appId: "uk.co.drvik.smilecompose",
  appName: "SmileCompose",
  // Assembled by scripts/build-native.mjs from the Next.js production build.
  webDir: "dist/native",
  // Native views use dynamic Light/Dark colours (SmileComposeColors in the
  // bridge view controller); these are only the pre-load fallback.
  backgroundColor: "#FFFFFF",
  // Bridge debug output can include Keychain session values; keep it off on devices.
  loggingBehavior: "none",
  ios: {
    // The web layout handles notch, Dynamic Island and Home Indicator itself
    // with env(safe-area-inset-*) and viewport-fit=cover.
    contentInset: "never",
    backgroundColor: "#FFFFFF",
    // Report as an iPad rather than desktop Safari, so touch layouts apply.
    preferredContentMode: "mobile",
  },
};

export default config;
