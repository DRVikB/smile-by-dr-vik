import { periodAllowance, periodKind } from "@/config/subscriptions";
import type { EntitlementPlan, GenerationEntitlement, SubscriptionState } from "@/lib/entitlement";

/**
 * How the generation allowance is shown: the remaining balance (never "38 / 50",
 * because a monthly balance can legitimately roll over to 72, 95 or 100), when
 * it renews, and a quiet word when it runs low. Pure, so it is tested.
 */
export type AllowanceLevel = "ok" | "low" | "critical" | "empty";

export interface AllowanceView {
  remaining: number;
  level: AllowanceLevel;
  plan: EntitlementPlan | null;
  trial: boolean;
  /** "38 generations remaining". */
  summary: string;
  /** "Renews 14 October", "Annual allowance renews 14 September 2027", "Trial ends 2 October", "Ends 14 October". */
  renewal: string | null;
  /** Monthly only: how rollover works. */
  rolloverNote: string | null;
  /** At 10 or fewer, 5 or fewer, and none left; otherwise null. */
  announcement: string | null;
  /** None left: what happens next. */
  emptyDetail: string | null;
}

/** Remaining counts that trigger a one-off heads-up as they are reached. */
export const ANNOUNCE_AT = [10, 5, 0] as const;

export const EMPTY_MESSAGE = "You’ve used your available SmileCompose generations.";
export const ROLLOVER_NOTE = (cap: number) => `Unused monthly generations roll over up to ${cap} while your subscription remains active.`;

const generations = (n: number) => `${n} generation${n === 1 ? "" : "s"}`;

function day(iso: string | null, withYear: boolean): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", withYear ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "long" });
}

export function allowanceLevel(remaining: number, trial = false): AllowanceLevel {
  if (remaining <= 0) return "empty";
  // A trial holds only a handful: a word on the last one.
  if (trial) return remaining <= 1 ? "critical" : "ok";
  if (remaining <= 5) return "critical";
  if (remaining <= 10) return "low";
  return "ok";
}

function renewalLine(e: GenerationEntitlement): string | null {
  const status: SubscriptionState = e.subscriptionStatus;
  if (status === "trial") return e.periodEnd ? `Trial ends ${day(e.periodEnd, false)}` : null;
  if (status === "cancelling") return e.periodEnd ? `Ends ${day(e.periodEnd, e.plan === "annual")}` : null;
  if (status === "billing_issue") return "Payment problem — update your payment method";
  if (status === "complimentary") return "Complimentary access";
  if (status !== "active" || !e.periodEnd) return null;
  return e.plan === "annual" ? `Annual allowance renews ${day(e.periodEnd, true)}` : `Renews ${day(e.periodEnd, false)}`;
}

function emptyDetail(e: GenerationEntitlement): string | null {
  const when = (withYear: boolean) => day(e.periodEnd, withYear);
  switch (e.subscriptionStatus) {
    case "trial": return e.periodEnd ? `Your plan’s allowance begins when your trial converts on ${when(false)}.` : "Your plan’s allowance begins when your trial converts.";
    case "cancelling": return e.periodEnd ? `Your subscription ends on ${when(true)}.` : null;
    case "billing_issue": return "Your next allowance is added once your renewal payment succeeds.";
    case "active": return e.periodEnd
      ? e.plan === "annual" ? `Your annual allowance renews on ${when(true)}.` : `Your monthly allowance renews on ${when(false)}.`
      : null;
    default: return null;
  }
}

export function describeAllowance(e: GenerationEntitlement): AllowanceView {
  const trial = e.plan === "trial";
  const remaining = Math.max(0, e.balance);
  const level = allowanceLevel(remaining, trial);
  const announcement =
    level === "empty" ? EMPTY_MESSAGE
      : level === "critical" ? (trial ? `${generations(remaining)} remaining in your free trial` : `Only ${generations(remaining)} remaining`)
        : level === "low" ? `${generations(remaining)} remaining`
          : null;
  return {
    remaining,
    level,
    plan: e.plan,
    trial,
    summary: trial ? `${generations(remaining)} remaining in your trial` : `${generations(remaining)} remaining`,
    renewal: renewalLine(e),
    rolloverNote: e.plan === "monthly" && e.rolloverCap ? ROLLOVER_NOTE(e.rolloverCap) : null,
    announcement,
    emptyDetail: level === "empty" ? emptyDetail(e) : null,
  };
}

/**
 * The heads-up when a generation takes the balance down to 10, 5 or 0 (in a
 * trial: 1 and 0), or null. Only on a decrease.
 */
export function crossedAnnouncement(previous: number | null, next: number, trial = false): string | null {
  if (previous === null || next >= previous) return null;
  const marks: readonly number[] = trial ? [1, 0] : ANNOUNCE_AT;
  const hit = marks.find(n => next <= n && previous > n);
  if (hit === undefined) return null;
  if (next <= 0) return trial ? "That was the last generation in your free trial." : EMPTY_MESSAGE;
  if (trial) return `${generations(next)} remaining in your free trial`;
  return next <= 5 ? `Only ${generations(next)} remaining` : `${generations(next)} remaining`;
}

/** What an account status carries (structural, so this stays free of service imports). */
export interface StatusForEntitlement {
  entitlement?: GenerationEntitlement;
  pro: boolean;
  source: "subscription" | "override" | null;
  subscription: { active: boolean; productId: string | null; expiresAt: string | null; willRenew: boolean; billingIssue: boolean; trial?: boolean } | null;
  overrideExpiresAt: string | null;
  generations: { remaining: number; periodEnd: string | null };
}

/**
 * The server's entitlement, or, from a server that predates it, the same shape
 * read from the older fields. Display only: the server still decides access.
 */
export function entitlementOf(status: StatusForEntitlement): GenerationEntitlement {
  if (status.entitlement) return status.entitlement;
  const s = status.subscription;
  const fromSubscription = status.source === "subscription" && s;
  const plan: EntitlementPlan | null = status.source === "override" ? "complimentary" : fromSubscription ? periodKind(s.productId, Boolean(s.trial)) : null;
  const numbers = plan && plan !== "complimentary" ? periodAllowance(plan) : null;
  const balance = status.pro ? Math.max(0, status.generations.remaining) : 0;
  return {
    subscriptionStatus: status.source === "override" ? "complimentary"
      : fromSubscription ? (s.billingIssue ? "billing_issue" : s.trial ? "trial" : s.willRenew ? "active" : "cancelling")
        : s?.expiresAt ? "expired" : "none",
    plan,
    balance,
    allowance: numbers?.allowance ?? null,
    rolloverCap: plan === "monthly" && numbers ? numbers.rolloverCap : null,
    periodStart: null,
    periodEnd: fromSubscription ? s.expiresAt ?? status.generations.periodEnd : status.source === "override" ? status.overrideExpiresAt : null,
    cancelAtPeriodEnd: Boolean(fromSubscription && !s.willRenew),
    canGenerate: status.pro && balance > 0,
  };
}

/** What the Home Screen widget shows of the allowance, worded as the app words it. */
export interface WidgetAllowance {
  remaining: number;
  summary: string;
  renewal: string | null;
  plan: string | null;
  /** Of one period's allowance, 0–1: a rolled-over monthly balance shows full. */
  fraction: number;
  /** Past this the widget stops showing the figure until the app next opens. */
  periodEnd: string | null;
}

const WIDGET_PLAN: Record<EntitlementPlan, string> = {
  monthly: "Pro Monthly",
  annual: "Pro Annual",
  trial: "Pro free trial",
  complimentary: "Complimentary access",
};

export function widgetAllowance(e: GenerationEntitlement): WidgetAllowance {
  const view = describeAllowance(e);
  const full = e.allowance ?? Math.max(1, view.remaining);
  return {
    remaining: view.remaining,
    summary: view.summary,
    renewal: view.renewal,
    plan: e.plan ? WIDGET_PLAN[e.plan] : null,
    fraction: Math.round(Math.min(1, Math.max(0, view.remaining / full)) * 1000) / 1000,
    periodEnd: e.periodEnd,
  };
}
