import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, accountsConfigured } from "@/config/accounts";
import { isNativeApp } from "@/native/platform";
import { keychainSessionStorage } from "@/native/secureStorage";

let client: SupabaseClient | null = null;

/**
 * The browser/app Supabase client (anon key; Row Level Security applies).
 * PKCE flow: email links return a one-time code that only this device can
 * exchange. On the web the code is read from the page URL; in the iOS app it
 * arrives through the app's deep link (see AccountProvider).
 * In the iOS app the session is kept in the Keychain (this device only);
 * on the website it stays in the browser's localStorage.
 */
export function supabase(): SupabaseClient | null {
  if (!accountsConfigured()) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !isNativeApp(),
      storageKey: "smilecompose.auth",
      ...(isNativeApp() ? { storage: keychainSessionStorage() } : {}),
    },
  });
  return client;
}
