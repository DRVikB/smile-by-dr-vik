/**
 * Public account and purchase configuration, inlined at build time.
 * Only values their providers intend for clients belong here:
 *   - Supabase project URL and anon/publishable key (protected by Row Level Security)
 *   - RevenueCat public Apple SDK key (starts with "appl_")
 * The Supabase service-role key, RevenueCat secret key and Apple private keys
 * are server-only (see src/server/env.ts) and must never be NEXT_PUBLIC_.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const REVENUECAT_IOS_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";

export function accountsConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Deep link Supabase redirects to after email verification / password reset in the iOS app. */
export const NATIVE_AUTH_CALLBACK = "uk.co.drvik.smilecompose://auth-callback";

export const LEGAL_LINKS = {
  privacy: "/privacy.html",
  terms: "/terms.html",
  /** Apple's standard EULA for App Store subscriptions (the Terms refer to it). */
  appleEula: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  manageSubscriptions: "https://apps.apple.com/account/subscriptions",
} as const;

/** Generated legal pages (scripts/build-legal.ts), bundled in the app and served on the web. */
export function legalPath(document: "privacy" | "terms"): string {
  return LEGAL_LINKS[document];
}
