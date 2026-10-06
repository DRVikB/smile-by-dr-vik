import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, greeting, initials, isPrivateRelayEmail, maskEmail, normaliseName, providerLabel, NAME_LIMITS } from "../src/lib/profile";
import { onboardingDecision, readLocalOnboarding, updateAccountFlags, writeLocalOnboarding, type OnboardingInput } from "../src/lib/onboarding";
import { osVersionFromUserAgent, problemReportUrl } from "../src/lib/appInfo";
import {
  addLogEntry, caseCounts, emptyRecentlyDeleted, listActiveLog, listAllLog, listLog, moveAllToRecentlyDeleted,
  moveToRecentlyDeleted, purgeRecentlyDeleted, readLogMedia, restoreCase, setCaseArchived, clearLog,
} from "../src/lib/caseLog";
import { buildDataExport } from "../src/lib/dataExport";

test("names are normalised, length-limited and never taken from an email address", () => {
  assert.equal(normaliseName("  Dr​   Vik \n", NAME_LIMITS.preferredName), "Dr Vik");
  assert.equal(normaliseName("   ", 40), null);
  assert.equal(normaliseName(null, 40), null);
  assert.equal(normaliseName(42, 40), undefined);
  assert.equal(normaliseName("x".repeat(41), 40), undefined);
  assert.equal(displayName({ preferredName: "Dr Vik", fullName: "Vikas Bajaj" }), "Dr Vik");
  assert.equal(displayName({ preferredName: null, fullName: "Vikas Bajaj" }), "Vikas");
  assert.equal(displayName({ preferredName: "", fullName: null }), null);
  assert.equal(initials("Dr Vik"), "DV");
  assert.equal(initials("Vikas Bajaj"), "VB");
  assert.equal(initials("Vikas Kumar Bajaj"), "VB");
  assert.equal(initials(""), "");
});

test("Apple private relay addresses are recognised and emails are masked", () => {
  assert.equal(isPrivateRelayEmail("abc123@privaterelay.appleid.com"), true);
  assert.equal(isPrivateRelayEmail("dr@example.co.uk"), false);
  assert.equal(maskEmail("vikas@example.co.uk"), "v••••@••••.co.uk");
  assert.equal(maskEmail(null), "");
  assert.equal(providerLabel("apple"), "Apple");
  assert.equal(providerLabel("email"), "Email & Password");
});

test("greetings follow the local time and fall back to a generic greeting", () => {
  assert.equal(greeting("Dr Vik", new Date(2026, 8, 28, 9)), "Good morning, Dr Vik");
  assert.equal(greeting("Dr Vik", new Date(2026, 8, 28, 14)), "Good afternoon, Dr Vik");
  assert.equal(greeting(null, new Date(2026, 8, 28, 20)), "Good evening");
});

const base: OnboardingInput = {
  accountsConfigured: true, userId: null, statusLoaded: false, statusFailed: false,
  profile: null, hasPro: false, deviceHasCases: false, local: {},
};
const signedIn = (overrides: Partial<OnboardingInput> = {}): OnboardingInput => ({
  ...base, userId: "user-1", statusLoaded: true,
  profile: { preferredName: null, onboardingCompletedAt: null, hasGenerationHistory: false }, ...overrides,
});
const stepOf = (input: OnboardingInput) => { const d = onboardingDecision(input); return d.kind === "step" ? d.step : d.kind; };

test("a cold launch restarts incomplete onboarding while preserving names and completion", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  const progress = { welcomeSeen: true, accountDeferred: true, preferredName: "Dr Vik", howItWorksSeen: true, styleLibrarySeen: true, subscriptionSeen: true, accounts: { "user-1": { subscriptionDeferred: true }, "finished": { completed: true } } };
  writeLocalOnboarding(progress, storage);
  const restarted = readLocalOnboarding(storage, { forLaunch: true });
  assert.equal(stepOf({ ...base, local: restarted }), "welcome");
  assert.equal(stepOf(signedIn({ local: restarted, profile: { preferredName: "Dr Vik", onboardingCompletedAt: null, hasGenerationHistory: false } })), "welcome");
  assert.equal(restarted.preferredName, "Dr Vik");
  assert.equal(stepOf(signedIn({ userId: "finished", local: restarted })), "none");
  assert.deepEqual(readLocalOnboarding(storage), progress, "normal in-session reads keep progress");
  writeLocalOnboarding({ ...progress, completedAt: 123 }, storage);
  assert.equal(stepOf({ ...base, local: readLocalOnboarding(storage, { forLaunch: true }) }), "none");
});

test("a new user goes welcome → account → how it works → your style → subscription → personalise → ready", () => {
  assert.equal(stepOf(base), "welcome");
  assert.equal(stepOf({ ...base, local: { welcomeSeen: true } }), "account");
  assert.equal(stepOf(signedIn({ local: { welcomeSeen: true } })), "howItWorks");
  assert.equal(stepOf(signedIn({ local: { howItWorksSeen: true } })), "styleLibrary");
  assert.equal(stepOf(signedIn({ local: { howItWorksSeen: true, styleLibrarySeen: true } })), "subscription");
  // The name comes last, just before "You're all set".
  assert.equal(stepOf(signedIn({ local: { howItWorksSeen: true, styleLibrarySeen: true }, hasPro: true })), "personalise");
  const named = { preferredName: "Dr Vik", onboardingCompletedAt: null, hasGenerationHistory: false };
  assert.equal(stepOf(signedIn({ profile: named, local: { howItWorksSeen: true, styleLibrarySeen: true }, hasPro: true })), "ready");
});

test("the Case Library step is optional and needs somewhere private to keep cases", () => {
  // Signed out with accounts on: no Case Library until they sign in, so the step is skipped (straight to the plans).
  assert.equal(stepOf({ ...base, local: { welcomeSeen: true, accountDeferred: true, nameSkipped: true, howItWorksSeen: true } }), "subscription");
  // Accounts off: the library lives on this device.
  assert.equal(stepOf({ ...base, accountsConfigured: false, local: { welcomeSeen: true, nameSkipped: true, howItWorksSeen: true } }), "styleLibrary");
  // Existing users are never sent through it.
  assert.equal(stepOf(signedIn({ profile: { preferredName: "Dr Vik", onboardingCompletedAt: null, hasGenerationHistory: true } })), "completeSilently");
});

test("an interrupted onboarding resumes at the subscription step", () => {
  const input = signedIn({ profile: { preferredName: "Dr Vik", onboardingCompletedAt: null, hasGenerationHistory: false }, local: { welcomeSeen: true, howItWorksSeen: true, styleLibrarySeen: true } });
  assert.equal(stepOf(input), "subscription");
  // "Not now" on the paywall moves on to Ready for this account only.
  assert.equal(stepOf({ ...input, local: updateAccountFlags(input.local, "user-1", { subscriptionDeferred: true }) }), "ready");
  assert.equal(stepOf({ ...input, userId: "user-2", local: updateAccountFlags(input.local, "user-1", { subscriptionDeferred: true }) }), "subscription");
});

test("exploring without an account still shows the plans once, then moves on", () => {
  const exploring = { ...base, local: { welcomeSeen: true, accountDeferred: true, nameSkipped: true, howItWorksSeen: true } };
  assert.equal(stepOf(exploring), "subscription");
  assert.equal(stepOf({ ...exploring, local: { ...exploring.local, subscriptionSeen: true } }), "ready");
  // Without accounts there is nothing to subscribe to.
  assert.equal(stepOf({ ...exploring, accountsConfigured: false, local: { ...exploring.local, styleLibrarySeen: true } }), "ready");
  // Signing in afterwards shows the App Store plans for that account, unless it already has Pro.
  const named = { preferredName: "Dr Vik", onboardingCompletedAt: null, hasGenerationHistory: false };
  const afterSignIn = signedIn({ profile: named, local: { ...exploring.local, subscriptionSeen: true, styleLibrarySeen: true } });
  assert.equal(stepOf(afterSignIn), "subscription");
  assert.equal(stepOf({ ...afterSignIn, hasPro: true }), "ready");
});

test("Pro and complimentary users are never sent through the paywall again", () => {
  const named = { preferredName: "Dr Vik", onboardingCompletedAt: null, hasGenerationHistory: false };
  assert.equal(stepOf(signedIn({ profile: named, local: { howItWorksSeen: true, styleLibrarySeen: true }, hasPro: true })), "ready");
});

test("existing users are not forced through onboarding", () => {
  const history = { preferredName: null, onboardingCompletedAt: null, hasGenerationHistory: true };
  const decision = onboardingDecision(signedIn({ profile: history }));
  assert.deepEqual(decision, { kind: "step", step: "personalise", returning: true });
  assert.equal(stepOf(signedIn({ profile: { ...history, preferredName: "Dr Vik" } })), "completeSilently");
  assert.equal(stepOf(signedIn({ deviceHasCases: true, profile: { ...history, hasGenerationHistory: false, preferredName: "Dr Vik" } })), "completeSilently");
  // A device already holding cases, used without an account, skips onboarding.
  assert.equal(stepOf({ ...base, deviceHasCases: true }), "completeSilently");
  assert.equal(stepOf(signedIn({ profile: { ...history, onboardingCompletedAt: "2026-09-01T00:00:00Z" } })), "done");
  assert.equal(stepOf(signedIn({ local: updateAccountFlags({}, "user-1", { completed: true }) })), "none");
});

test("onboarding waits for the account, but never traps an offline user", () => {
  assert.equal(stepOf({ ...base, userId: "user-1" }), "loading");
  assert.equal(stepOf({ ...base, userId: "user-1", statusFailed: true }), "none");
  assert.equal(stepOf(signedIn({ profile: null })), "none");
});

test("without accounts the flow is welcome → how it works → your style → personalise → ready, stored on the device", () => {
  const local = { accountsConfigured: false } as const;
  assert.equal(stepOf({ ...base, ...local }), "welcome");
  assert.equal(stepOf({ ...base, ...local, local: { welcomeSeen: true } }), "howItWorks");
  assert.equal(stepOf({ ...base, ...local, local: { welcomeSeen: true, howItWorksSeen: true } }), "styleLibrary");
  assert.equal(stepOf({ ...base, ...local, local: { welcomeSeen: true, howItWorksSeen: true, styleLibrarySeen: true } }), "personalise");
  assert.equal(stepOf({ ...base, ...local, local: { welcomeSeen: true, preferredName: "Dr Vik", howItWorksSeen: true, styleLibrarySeen: true } }), "ready");
  assert.equal(stepOf({ ...base, ...local, local: { completedAt: 1 } }), "none");
  // Exploring without an account keeps the account step from returning.
  assert.equal(stepOf({ ...base, local: { welcomeSeen: true, accountDeferred: true } }), "howItWorks");
});

test("device onboarding state round-trips and tolerates corrupt storage", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  writeLocalOnboarding({ welcomeSeen: true, preferredName: "Dr Vik" }, storage);
  assert.deepEqual(readLocalOnboarding(storage), { welcomeSeen: true, preferredName: "Dr Vik" });
  store.set("smile.onboarding", "{not json");
  assert.deepEqual(readLocalOnboarding(storage), {});
  assert.ok([...store.keys()].every(key => key.startsWith("smile.")), "cleared by Delete all data on this device");
});

test("problem reports carry technical details only", () => {
  assert.equal(osVersionFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15"), "iOS 27.0");
  assert.equal(osVersionFromUserAgent("Mozilla/5.0 (iPad; CPU OS 26_1_2 like Mac OS X)"), "iOS 26.1.2");
  const url = problemReportUrl("support@example.test", { version: "1.0", build: "7", platform: "iOS", osVersion: "iOS 27.0" });
  const body = decodeURIComponent(url.split("body=")[1]);
  assert.match(body, /App version: 1\.0 \(7\)/);
  assert.match(body, /Platform: iOS/);
  assert.doesNotMatch(body, /data:image|@example\.test|user|case id/i);
});

const entry = (id: string, createdAt: number, patientName = "AB") => ({ id, caseId: `case-${id}`, patientName, createdAt, mode: "live" as const, summary: "Composite", thumb: "t" });
const media = (id: string) => ({ id, image: "data:image/png;base64,AA==", originalImage: "data:image/png;base64,AA==" });

test("cases can be archived, moved to Recently Deleted, restored and purged after the window", async () => {
  await clearLog();
  for (const [id, at] of [["a", 1], ["b", 2], ["c", 3]] as const) await addLogEntry(entry(id, at), media(id));
  await setCaseArchived("b", true, 100);
  await moveToRecentlyDeleted("c", 1_000);
  assert.deepEqual((await listActiveLog()).map(e => e.id), ["a"]);
  assert.deepEqual((await listLog()).map(e => e.id), ["b", "a"], "default lists exclude Recently Deleted");
  assert.deepEqual((await listAllLog()).map(e => e.id), ["c", "b", "a"]);
  assert.deepEqual(await caseCounts(), { active: 1, archived: 1, deleted: 1 });

  await restoreCase("c");
  await setCaseArchived("b", false);
  assert.deepEqual(await caseCounts(), { active: 3, archived: 0, deleted: 0 });

  await moveToRecentlyDeleted("c", 1_000);
  assert.equal(await purgeRecentlyDeleted(1_000 + 29 * 86_400_000, 30), 0, "kept within the window");
  assert.equal(await purgeRecentlyDeleted(1_000 + 30 * 86_400_000, 30), 1);
  assert.equal(await readLogMedia("c"), null, "photos are removed with the case");
  assert.deepEqual(await caseCounts(), { active: 2, archived: 0, deleted: 0 });

  await moveAllToRecentlyDeleted(5);
  assert.deepEqual(await caseCounts(), { active: 0, archived: 0, deleted: 2 });
  await emptyRecentlyDeleted();
  assert.deepEqual(await caseCounts(), { active: 0, archived: 0, deleted: 0 });
});

test("the data export includes archived and Recently Deleted cases", async () => {
  await clearLog();
  await addLogEntry(entry("x", 1), media("x"));
  await addLogEntry(entry("y", 2), media("y"));
  await moveToRecentlyDeleted("y");
  const exported = await buildDataExport(null) as unknown as { device: { cases: { entry: { id: string } }[] } };
  assert.deepEqual(exported.device.cases.map(c => c.entry.id).sort(), ["x", "y"]);
});
