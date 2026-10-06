/**
 * First-run onboarding: which step to show, derived from facts rather than a
 * stored state machine. Progress continues within the session; a cold launch
 * restarts unfinished onboarding from Welcome, preserving names and completion.
 *
 *   WELCOME → ACCOUNT → HOW IT WORKS → YOUR STYLE → SUBSCRIPTION → PERSONALISE → READY
 *
 * SUBSCRIPTION shows the Pro plans to everyone while accounts are on. Signed
 * in, it offers the App Store plans (skipped for Pro or complimentary users).
 * Exploring without an account, it shows the plans and prices with "Start
 * your free trial", which creates the account first (a subscription belongs
 * to an account); seeing it once is remembered on the device.
 *
 * YOUR STYLE invites the clinician to add finished cases to their Case Library
 * (optional; "I'll do this later" moves on). It needs somewhere private to
 * keep them: a signed-in account, or this device when accounts are off.
 *
 * Completion is stored against the account (profiles.onboarding_completed_at)
 * and cached on the device. Without an account (accounts not configured, or
 * "Explore without an account") it is stored on the device only.
 *
 * Existing-user rule: a signed-in account with generation history, or a device
 * that already holds saved cases, is an existing user. They are only asked for
 * a preferred name if they have none, then onboarding is marked complete.
 * A device with saved cases and no account skips onboarding entirely.
 */
export type OnboardingStep = "welcome" | "account" | "personalise" | "howItWorks" | "styleLibrary" | "subscription" | "ready";

export interface AccountOnboardingFlags {
  completed?: boolean;
  nameSkipped?: boolean;
  subscriptionDeferred?: boolean;
}

/** Device-local onboarding progress. Cleared by "Delete all data on this device" (smile.* prefix). */
export interface LocalOnboarding {
  welcomeSeen?: boolean;
  accountDeferred?: boolean;
  /** Preferred name chosen before signing in (or without accounts). */
  preferredName?: string;
  nameSkipped?: boolean;
  howItWorksSeen?: boolean;
  /** The Case Library step was shown (cases added, or "I'll do this later"). */
  styleLibrarySeen?: boolean;
  /** The Pro plans were shown before signing in ("Not now", or went on to create an account). */
  subscriptionSeen?: boolean;
  /** Device-level completion when not signed in. */
  completedAt?: number;
  /** Per account (random user ID): completion cache and choices made during onboarding. */
  accounts?: Record<string, AccountOnboardingFlags>;
}

export interface OnboardingInput {
  accountsConfigured: boolean;
  userId: string | null;
  /** The server status for the signed-in user has loaded / failed to load. */
  statusLoaded: boolean;
  statusFailed: boolean;
  profile: { preferredName: string | null; onboardingCompletedAt: string | null; hasGenerationHistory: boolean } | null;
  hasPro: boolean;
  deviceHasCases: boolean;
  local: LocalOnboarding;
}

export type OnboardingDecision =
  | { kind: "none" }
  /** Completed on the server but not cached on this device yet. */
  | { kind: "done" }
  | { kind: "loading" }
  /** Existing user with nothing to ask: mark complete without showing anything. */
  | { kind: "completeSilently" }
  | { kind: "step"; step: OnboardingStep; returning: boolean };

export function onboardingDecision(input: OnboardingInput): OnboardingDecision {
  const { local, userId } = input;
  const step = (s: OnboardingStep, returning = false): OnboardingDecision => ({ kind: "step", step: s, returning });

  if (!userId) {
    if (local.completedAt) return { kind: "none" };
    if (input.deviceHasCases) return { kind: "completeSilently" };
    if (!local.welcomeSeen) return step("welcome");
    if (input.accountsConfigured && !local.accountDeferred) return step("account");
    if (!local.howItWorksSeen) return step("howItWorks");
    if (!input.accountsConfigured && !local.styleLibrarySeen) return step("styleLibrary");
    if (input.accountsConfigured && !local.subscriptionSeen) return step("subscription");
    // The name comes last, just before "You're all set".
    if (!local.preferredName && !local.nameSkipped) return step("personalise");
    return step("ready");
  }

  const flags = local.accounts?.[userId] ?? {};
  if (flags.completed) return { kind: "none" };
  // Never trap someone behind a loading screen: offline or failing status means no onboarding now.
  if (!input.statusLoaded) return input.statusFailed ? { kind: "none" } : { kind: "loading" };
  const profile = input.profile;
  if (!profile) return { kind: "none" };
  if (profile.onboardingCompletedAt) return { kind: "done" };

  const needsName = !profile.preferredName && !flags.nameSkipped;
  if (profile.hasGenerationHistory || input.deviceHasCases)
    return needsName ? step("personalise", true) : { kind: "completeSilently" };

  if (local.welcomeSeen === false) return step("welcome");
  if (!local.howItWorksSeen) return step("howItWorks");
  if (!local.styleLibrarySeen) return step("styleLibrary");
  if (!input.hasPro && !flags.subscriptionDeferred) return step("subscription");
  // The name comes last, just before "You're all set".
  if (needsName) return step("personalise");
  return step("ready");
}

/** Visible progress (the welcome screen is not counted). */
export const ONBOARDING_PROGRESS: OnboardingStep[] = ["account", "howItWorks", "styleLibrary", "subscription", "personalise", "ready"];

const KEY = "smile.onboarding";

/** TEMPORARY (testing): ask the onboarding to play every step again, saving nothing. */
export const ONBOARDING_REPLAY_EVENT = "smile:onboarding-replay";
export function replayOnboarding(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ONBOARDING_REPLAY_EVENT));
}

export function readLocalOnboarding(storage: Pick<Storage, "getItem"> | null = safeStorage(), { forLaunch = false }: { forLaunch?: boolean } = {}): LocalOnboarding {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? "{}") as unknown;
    const local = parsed && typeof parsed === "object" ? parsed as LocalOnboarding : {};
    if (!forLaunch) return local;
    return {
      ...local, welcomeSeen: false, accountDeferred: false, nameSkipped: false,
      howItWorksSeen: false, styleLibrarySeen: false, subscriptionSeen: false,
      accounts: Object.fromEntries(Object.entries(local.accounts ?? {}).map(([id, flags]) =>
        [id, flags.completed ? flags : { ...flags, nameSkipped: false, subscriptionDeferred: false }])),
    };
  } catch {
    return {};
  }
}

export function writeLocalOnboarding(next: LocalOnboarding, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try { storage?.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: onboarding may show again */ }
}

export function updateAccountFlags(local: LocalOnboarding, userId: string, flags: AccountOnboardingFlags): LocalOnboarding {
  return { ...local, accounts: { ...local.accounts, [userId]: { ...local.accounts?.[userId], ...flags } } };
}

function safeStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
