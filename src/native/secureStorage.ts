import { registerPlugin } from "@capacitor/core";

interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

/** Local plugin: ios/App/App/SecureStoragePlugin.swift (iOS Keychain, this device only). */
const SmileSecureStorage = registerPlugin<SecureStoragePlugin>("SmileSecureStorage");

/** The subset of Storage that Supabase Auth needs (`auth.storage`). */
export interface SessionStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** How long the app waits on the Keychain before carrying on without it (a stalled Keychain must never freeze the app on its loading screen). */
export const KEYCHAIN_TIMEOUT_MS = 4000;

/** The result of `work`, or `undefined` if it fails or takes longer than `ms`. */
async function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), ms); })]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sign-in session storage for the iOS app: the Keychain instead of WebView
 * localStorage. A session saved by an earlier version in localStorage is moved
 * into the Keychain on first read and removed from localStorage.
 *
 * If the Keychain doesn't answer in time (or errors), the app carries on as if
 * nothing were stored: the person can still use the app and sign in again, and
 * a session already in the Keychain is untouched and read on a later launch.
 */
export function keychainSessionStorage(
  plugin: SecureStoragePlugin = SmileSecureStorage,
  legacy: Pick<Storage, "getItem" | "removeItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
  timeoutMs: number = KEYCHAIN_TIMEOUT_MS,
): SessionStorageAdapter {
  return {
    async getItem(key) {
      const stored = await within(plugin.get({ key }), timeoutMs);
      if (!stored) return legacy?.getItem(key) ?? null;
      if (stored.value !== null) return stored.value;
      const old = legacy?.getItem(key) ?? null;
      if (old !== null) {
        await within(plugin.set({ key, value: old }), timeoutMs);
        legacy?.removeItem(key);
      }
      return old;
    },
    async setItem(key, value) {
      await within(plugin.set({ key, value }), timeoutMs);
      legacy?.removeItem(key);
    },
    async removeItem(key) {
      await within(plugin.remove({ key }), timeoutMs);
      legacy?.removeItem(key);
    },
  };
}
