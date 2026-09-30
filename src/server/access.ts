import { periodAllowance, periodKind } from "@/config/subscriptions";
import { styleReferenceLimit } from "@/lib/styleMatching";
import { AccountError, createSupabaseAccountStore, createSupabaseMediaStore, type AccountStore, type AuthenticatedUser, type MediaStore } from "./accountStore";
import { createRevenueCatClient, type ProEntitlement, type RevenueCatClient } from "./revenuecat";
import { accountsMode, allowSandbox, type ServerEnvironment } from "./env";

export interface AccountServices {
  store: AccountStore;
  media: MediaStore;
  revenuecat: RevenueCatClient;
  allowSandbox: boolean;
  /** References attached per generation (STYLE_REFERENCE_LIMIT, 1–5, default 3). */
  styleReferenceLimit?: number;
}

/** Null when accounts are not configured on this deployment. */
export function accountServicesFromEnv(env: ServerEnvironment): AccountServices | null {
  if (accountsMode(env) !== "required") return null;
  return {
    store: createSupabaseAccountStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!),
    media: createSupabaseMediaStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!),
    revenuecat: createRevenueCatClient(env.REVENUECAT_SECRET_API_KEY!),
    allowSandbox: allowSandbox(env),
    styleReferenceLimit: styleReferenceLimit(env.STYLE_REFERENCE_LIMIT),
  };
}

export interface AccessDecision {
  pro: boolean;
  source: "subscription" | "override" | null;
  /** Where the subscription state came from: RevenueCat live, or the webhook cache when RevenueCat was unreachable. */
  verifiedWith: "revenuecat" | "cache";
  subscription: {
    active: boolean;
    productId: string | null;
    expiresAt: string | null;
    environment: "production" | "sandbox" | null;
    willRenew: boolean;
    billingIssue: boolean;
    managementUrl: string | null;
    /** In the free trial: limited generations until it converts. */
    trial?: boolean;
  } | null;
  overrideExpiresAt: string | null;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * The signed-in user, or null. Accounts with a verified second factor must
 * present an aal2 session; otherwise the request is refused with mfa_required.
 */
export async function authenticate(request: Request, services: AccountServices): Promise<AuthenticatedUser | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const user = await services.store.verifyAccessToken(token);
  if (user?.mfaEnrolled && user.aal !== "aal2") throw new AccountError("mfa_required");
  return user;
}

function monthBounds(now: Date): { start: string; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end };
}

/** The later of two ISO instants (either may be missing). */
function later(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * hasAccess = RevenueCat "pro" entitlement OR a valid server-side override.
 * Also establishes the current period's generation allowance (idempotent: one
 * grant per billing period, applying the rollover rules in the database), so a
 * purchase or renewal is usable even before its webhook arrives. During a
 * billing grace period the existing period runs on without a new allowance;
 * when RevenueCat reports the entitlement expired, the allowance ends.
 */
export async function evaluateAccess(user: AuthenticatedUser, services: AccountServices, now = new Date()): Promise<AccessDecision> {
  const { store, revenuecat } = services;
  const override = await store.activeOverride(user.id);

  let entitlement: ProEntitlement | null = null;
  let verifiedWith: AccessDecision["verifiedWith"] = "revenuecat";
  try {
    entitlement = await revenuecat.proEntitlement(user.id);
  } catch {
    verifiedWith = "cache";
  }

  let subscription: AccessDecision["subscription"];
  if (entitlement) {
    const allowed = entitlement.active && (entitlement.environment === "production" || services.allowSandbox);
    subscription = { ...entitlement, active: allowed };
    if (allowed && entitlement.periodStart && entitlement.expiresAt) {
      const kind = periodKind(entitlement.productId, entitlement.trial);
      const { allowance, rolloverCap } = periodAllowance(kind);
      await store.ensurePeriod({
        userId: user.id, source: "subscription", environment: entitlement.environment, productId: entitlement.productId,
        start: entitlement.periodStart, end: later(entitlement.expiresAt, entitlement.graceExpiresAt)!, allowance, kind, rolloverCap,
      });
    } else if (!entitlement.active && entitlement.expiresAt && Date.parse(entitlement.expiresAt) <= now.getTime()) {
      // Expired (and past any grace period): end the allowance, even if the EXPIRATION webhook never arrives.
      await store.expireSubscription(user.id, entitlement.expiresAt).catch(() => {});
    }
  } else {
    // RevenueCat unreachable: fall back to the webhook-maintained cache.
    const cached = await store.cachedSubscription(user.id);
    const active = Boolean(cached && ["active", "cancelled", "billing_issue"].includes(cached.status) && cached.expiresAt && Date.parse(cached.expiresAt) > now.getTime()
      && (cached.environment !== "sandbox" || services.allowSandbox));
    subscription = cached ? {
      active, productId: cached.productId, expiresAt: cached.expiresAt, environment: cached.environment,
      willRenew: cached.status === "active", billingIssue: cached.status === "billing_issue", managementUrl: null, trial: false,
    } : null;
  }

  if (override) {
    const { start, end } = monthBounds(now);
    const periodEnd = override.expiresAt && Date.parse(override.expiresAt) < end.getTime() ? override.expiresAt : end.toISOString();
    await store.ensurePeriod({
      userId: user.id, source: "override", environment: "production", productId: null,
      start, end: periodEnd, allowance: override.monthlyAllowance,
    });
  }

  const subscriptionActive = Boolean(subscription?.active);
  return {
    pro: subscriptionActive || Boolean(override),
    source: subscriptionActive ? "subscription" : override ? "override" : null,
    verifiedWith,
    subscription,
    overrideExpiresAt: override?.expiresAt ?? null,
  };
}
