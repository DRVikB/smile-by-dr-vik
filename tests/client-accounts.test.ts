import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteAllLocalData, LOCAL_DATABASES } from "../src/lib/localData";
import { addLogEntry, listLog } from "../src/lib/caseLog";
import { friendlyGenerationError, GENERATION_MESSAGES } from "../src/services/ai/smileImageService";
import { AuthMessage, completeAuthCallback, signInMethods } from "../src/services/auth/authService";
import { customerHasPro } from "../src/services/purchases/purchases";
import { accountsConfigured, LEGAL_LINKS } from "../src/config/accounts";
import type { User } from "@supabase/supabase-js";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

test("delete all device data removes every case store and SmileCompose preferences, keeping sign-in", async () => {
  await addLogEntry(
    { id: "c1", patientName: "Patient", createdAt: 1, mode: "live", summary: "", thumb: "t" },
    { id: "c1", image: "data:image/png;base64,iVBORw0KGgo=", originalImage: "data:image/png;base64,iVBORw0KGgo=" },
  );
  assert.equal((await listLog()).length, 1);
  const storage = new MemoryStorage();
  storage.setItem("smile.analysis", "on");
  storage.setItem("smilecompose.auth", "session");
  await deleteAllLocalData(indexedDB, storage as unknown as Storage);
  assert.equal((await listLog()).length, 0);
  assert.equal(storage.getItem("smile.analysis"), null);
  assert.equal(storage.getItem("smilecompose.auth"), "session");
  assert.ok(LOCAL_DATABASES.includes("smile-case-library"));
});

test("account refusals from the server map to clear, actionable messages", () => {
  assert.equal(friendlyGenerationError(401, "auth_required").code, "auth_required");
  assert.equal(friendlyGenerationError(402, "subscription_required").message, GENERATION_MESSAGES.subscribe);
  assert.equal(friendlyGenerationError(429, "allowance_exhausted").message, GENERATION_MESSAGES.allowanceUsed);
  assert.equal(friendlyGenerationError(503, "accounts_unavailable").message, GENERATION_MESSAGES.unavailable);
  assert.equal(friendlyGenerationError(402).code, "subscription_required");
});

test("email-link errors are reported without exposing provider detail", async () => {
  await assert.rejects(
    completeAuthCallback("uk.co.drvik.smilecompose://auth-callback?flow=recovery&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"),
    (error: unknown) => error instanceof AuthMessage && !/otp_expired|invalid/i.test(error.message),
  );
});

test("sign-in methods are described in plain language; Pro comes only from the entitlement", () => {
  const user = { identities: [{ provider: "email" }, { provider: "apple" }] } as unknown as User;
  assert.deepEqual(signInMethods(user), ["Email and password", "Sign in with Apple"]);
  const info = (active: boolean) => ({ entitlements: { active: active ? { pro: { isActive: true } } : {}, all: {} } }) as unknown as CustomerInfo;
  assert.equal(customerHasPro(info(true)), true);
  assert.equal(customerHasPro(info(false)), false);
  assert.equal(customerHasPro(null), false);
});

test("accounts stay off until configured; legal links are defined", () => {
  assert.equal(accountsConfigured(), false);
  assert.equal(LEGAL_LINKS.privacy, "/privacy.html");
  assert.equal(LEGAL_LINKS.terms, "/terms.html");
  assert.match(LEGAL_LINKS.appleEula, /^https:\/\/www\.apple\.com\//);
});

test("iOS sign-in sessions live in the Keychain and move out of localStorage", async () => {
  const { keychainSessionStorage } = await import("../src/native/secureStorage");
  const keychain = new Map<string, string>();
  const plugin = {
    async get({ key }: { key: string }) { return { value: keychain.get(key) ?? null }; },
    async set({ key, value }: { key: string; value: string }) { keychain.set(key, value); },
    async remove({ key }: { key: string }) { keychain.delete(key); },
  };
  const legacy = new MemoryStorage();
  legacy.setItem("smilecompose.auth", "old-session");
  const storage = keychainSessionStorage(plugin, legacy);
  assert.equal(await storage.getItem("smilecompose.auth"), "old-session");
  assert.equal(keychain.get("smilecompose.auth"), "old-session");
  assert.equal(legacy.getItem("smilecompose.auth"), null);
  await storage.setItem("smilecompose.auth", "new-session");
  assert.equal(await storage.getItem("smilecompose.auth"), "new-session");
  await storage.removeItem("smilecompose.auth");
  assert.equal(await storage.getItem("smilecompose.auth"), null);
});
