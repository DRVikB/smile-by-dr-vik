import { periodAllowance, periodKind } from "@/config/subscriptions";
import type { EntitlementPlan, GenerationEntitlement, SubscriptionState } from "@/lib/entitlement";
import type { AuthenticatedUser, GenerationBalance } from "./accountStore";
import { evaluateAccess, type AccessDecision, type AccountServices } from "./access";

/**
 * The canonical generation entitlement for one account. Every screen reads this
 * (via /api/account/status); nothing on a device recalculates billing status.
 * Generation itself is gated again, atomically, by reserve_generation.
 */
export async function getGenerationEntitlement(user: AuthenticatedUser, services: AccountServices, options: { debug?: boolean } = {}): Promise<GenerationEntitlement> {
  const access = await evaluateAccess(user, services);
  const balance = await services.store.balance(user.id);
  return buildEntitlement(access, balance, options);
}

/** Pure: combine the access decision (RevenueCat or override) with the ledger balance. */
export function buildEntitlement(access: AccessDecision, balance: GenerationBalance, options: { debug?: boolean } = {}): GenerationEntitlement {
  const subscription = access.subscription;
  const fromSubscription = access.source === "subscription" && subscription;
  const plan: EntitlementPlan | null = access.source === "override" ? "complimentary"
    : fromSubscription ? (balance.planKind ?? periodKind(subscription.productId, Boolean(subscription.trial)))
      : null;
  const subscriptionStatus: SubscriptionState = access.source === "override" ? "complimentary"
    : fromSubscription
      ? subscription.billingIssue ? "billing_issue" : subscription.trial ? "trial" : subscription.willRenew ? "active" : "cancelling"
      : subscription?.expiresAt ? "expired" : "none";
  const numbers = plan && plan !== "complimentary" ? periodAllowance(plan) : null;
  const available = access.pro ? Math.max(0, balance.remaining) : 0;
  return {
    subscriptionStatus,
    plan,
    balance: available,
    allowance: numbers?.allowance ?? null,
    rolloverCap: plan === "monthly" && numbers ? numbers.rolloverCap : null,
    periodStart: fromSubscription ? balance.periodStart ?? null : null,
    periodEnd: fromSubscription ? subscription.expiresAt ?? balance.periodEnd
      : access.source === "override" ? access.overrideExpiresAt ?? balance.periodEnd : null,
    cancelAtPeriodEnd: Boolean(fromSubscription && !subscription.willRenew),
    canGenerate: access.pro && available > 0,
    ...(options.debug ? {
      debug: {
        verifiedWith: access.verifiedWith,
        source: access.source,
        environment: subscription?.environment ?? null,
        planKind: balance.planKind ?? null,
        subscriptionRemaining: balance.subscriptionRemaining ?? null,
        carriedOver: balance.carriedOver ?? null,
        lastAllowanceEventId: balance.lastEventId ?? null,
        lastAllowanceGrantedAt: balance.lastGrantedAt ?? null,
      },
    } : {}),
  };
}
