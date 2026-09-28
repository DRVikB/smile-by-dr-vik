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

/**
 * Sign-in session storage for the iOS app: the Keychain instead of WebView
 * localStorage. A session saved by an earlier version in localStorage is moved
 * into the Keychain on first read and removed from localStorage.
 */
export function keychainSessionStorage(
  plugin: SecureStoragePlugin = SmileSecureStorage,
  legacy: Pick<Storage, "getItem" | "removeItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): SessionStorageAdapter {
  return {
    async getItem(key) {
      const { value } = await plugin.get({ key });
      if (value !== null) return value;
      const old = legacy?.getItem(key) ?? null;
      if (old !== null) {
        await plugin.set({ key, value: old });
        legacy?.removeItem(key);
      }
      return old;
    },
    async setItem(key, value) {
      await plugin.set({ key, value });
      legacy?.removeItem(key);
    },
    async removeItem(key) {
      await plugin.remove({ key });
      legacy?.removeItem(key);
    },
  };
}
