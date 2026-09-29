/**
 * The clinician's smile-design allowance, as shown in the app: how many are
 * left, how urgent that is, and what to say about it. Pure, so it is tested.
 */
export type AllowanceLevel = "ok" | "low" | "critical" | "empty";

export interface AllowanceInput {
  included: number;
  used: number;
  remaining: number;
  purchased: number;
  periodEnd: string | null;
}

export interface Allowance {
  remaining: number;
  total: number;
  level: AllowanceLevel;
  trial: boolean;
  /** "1 Oct", when the allowance renews. */
  renews: string | null;
  /** Short line for the Home indicator, e.g. "38 of 50 smile designs left". */
  summary: string;
  /** The announcement for low / critical / empty, or null when all is well. */
  announcement: string | null;
}

/** Remaining counts that trigger a one-off heads-up as they are reached. */
export const ANNOUNCE_AT = [10, 5, 3, 1, 0] as const;

function renewDate(periodEnd: string | null): string | null {
  if (!periodEnd) return null;
  const date = new Date(periodEnd);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const designs = (n: number) => `${n} smile design${n === 1 ? "" : "s"}`;

export function allowanceLevel(remaining: number, total: number, trial = false): AllowanceLevel {
  if (remaining <= 0) return "empty";
  // A trial has only a handful: warn on the last one.
  if (trial) return remaining <= 1 ? "critical" : "ok";
  if (remaining <= Math.max(2, Math.ceil(total * 0.05))) return "critical";
  if (remaining <= Math.max(5, Math.ceil(total * 0.2))) return "low";
  return "ok";
}

export function describeAllowance(input: AllowanceInput, trial = false): Allowance {
  const total = Math.max(0, input.included + input.purchased);
  const remaining = Math.max(0, input.remaining);
  const level = allowanceLevel(remaining, total, trial);
  const renews = renewDate(input.periodEnd);
  const summary = trial
    ? `Free trial · ${remaining} of ${total} smile designs left`
    : `${remaining} of ${total} smile designs left`;
  const when = renews ? ` on ${renews}` : "";
  const announcement =
    level === "empty"
      ? trial
        ? `You’ve used your ${designs(total)} for the free trial. Your full allowance starts when the trial ends${when}.`
        : `You’ve used all your smile designs for this period. They renew${when}.`
      : level === "critical"
        ? `Only ${designs(remaining)} left${trial ? " in your free trial" : ` this period. Your allowance renews${when}`}.`
        : level === "low"
          ? `Running low: ${designs(remaining)} left. Your allowance renews${when}.`
          : null;
  return { remaining, total, level, trial, renews, summary, announcement };
}

/**
 * The heads-up to show when a generation takes the remaining count down to one
 * of ANNOUNCE_AT, or null. Only on a decrease, and only for thresholds below the total.
 */
export function crossedAnnouncement(previous: number | null, next: number, total: number, trial = false): string | null {
  if (previous === null || next >= previous) return null;
  const hit = ANNOUNCE_AT.find(n => n < total && next <= n && previous > n);
  if (hit === undefined) return null;
  if (next <= 0) return trial ? "That was the last smile design in your free trial." : "That was your last smile design for this period.";
  return `${designs(next)} left${trial ? " in your free trial" : " this period"}.`;
}
