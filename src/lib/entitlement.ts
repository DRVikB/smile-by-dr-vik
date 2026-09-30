import type { PeriodKind } from "@/config/subscriptions";

/**
 * The generation entitlement: the one description of what an account can
 * generate, built on the server (src/server/entitlement.ts) from the live
 * RevenueCat check and the allowance ledger. Clients only display it; a copy
 * held on a device is display state and is never trusted for access.
 */
export type SubscriptionState =
  | "trial"          // App Store free trial
  | "active"         // renews automatically
  | "cancelling"     // cancelled, access continues until the paid period ends
  | "billing_issue"  // a renewal payment failed; access may continue in a grace period
  | "complimentary"  // server-side complimentary access
  | "expired"        // the subscription has ended
  | "none";          // never subscribed

export type EntitlementPlan = PeriodKind | "complimentary";

export interface GenerationEntitlement {
  subscriptionStatus: SubscriptionState;
  plan: EntitlementPlan | null;
  /** Generations the account can use now. */
  balance: number;
  /** The plan's allowance for a period (trial 3, monthly 50, annual 600). */
  allowance: number | null;
  /** Monthly only: unused generations roll over up to this balance (100). */
  rolloverCap: number | null;
  periodStart: string | null;
  /** When the current period ends: the renewal date, or when access ends if cancelled. */
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canGenerate: boolean;
  /** Development builds only. */
  debug?: EntitlementDebug;
}

export interface EntitlementDebug {
  verifiedWith: "revenuecat" | "cache";
  source: "subscription" | "override" | null;
  environment: "production" | "sandbox" | null;
  planKind: PeriodKind | null;
  subscriptionRemaining: number | null;
  carriedOver: number | null;
  lastAllowanceEventId: string | null;
  lastAllowanceGrantedAt: string | null;
}
