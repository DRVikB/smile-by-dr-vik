import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEntitlement } from "../src/server/entitlement";
import { evaluateAccess, type AccessDecision, type AccountServices } from "../src/server/access";
import { handleRevenueCatWebhook } from "../src/server/revenuecatWebhook";
import type { AccountStore, GenerationBalance, PeriodInput, RevenueCatEventInput } from "../src/server/accountStore";
import type { ProEntitlement } from "../src/server/revenuecat";
import { SUBSCRIPTION_PRODUCTS } from "../src/config/subscriptions";

const future = new Date(Date.now() + 20 * 86400000).toISOString();
const later = new Date(Date.now() + 30 * 86400000).toISOString();
const past = new Date(Date.now() - 10 * 86400000).toISOString();
const MONTHLY = SUBSCRIPTION_PRODUCTS.monthly.productId;
const ANNUAL = SUBSCRIPTION_PRODUCTS.annual.productId;

const balance = (remaining: number, extra: Partial<GenerationBalance> = {}): GenerationBalance => ({
  included: remaining, used: 0, remaining, purchased: 0, periodEnd: future, planKind: "monthly", periodStart: past, ...extra,
});
const access = (subscription: Partial<NonNullable<AccessDecision["subscription"]>> | null, extra: Partial<AccessDecision> = {}): AccessDecision => ({
  pro: Boolean(subscription?.active ?? false),
  source: subscription?.active ? "subscription" : null,
  verifiedWith: "revenuecat",
  subscription: subscription ? {
    active: true, productId: MONTHLY, expiresAt: future, environment: "production", willRenew: true, billingIssue: false, managementUrl: null, trial: false,
    ...subscription,
  } : null,
  overrideExpiresAt: null,
  ...extra,
});

test("entitlement: an active monthly subscriber with rolled-over generations", () => {
  const e = buildEntitlement(access({ active: true }), balance(72));
  assert.equal(e.subscriptionStatus, "active");
  assert.equal(e.plan, "monthly");
  assert.equal(e.balance, 72, "the balance, not 72 / 50");
  assert.equal(e.allowance, 50);
  assert.equal(e.rolloverCap, 100);
  assert.equal(e.periodEnd, future);
  assert.equal(e.cancelAtPeriodEnd, false);
  assert.equal(e.canGenerate, true);
  assert.equal(e.debug, undefined, "no billing detail unless asked for (development)");
});

test("entitlement: cancelled keeps generating until the period ends; annual has no rollover cap", () => {
  const cancelling = buildEntitlement(access({ active: true, willRenew: false }), balance(12));
  assert.equal(cancelling.subscriptionStatus, "cancelling");
  assert.equal(cancelling.cancelAtPeriodEnd, true);
  assert.equal(cancelling.canGenerate, true);

  const annual = buildEntitlement(access({ active: true, productId: ANNUAL }), balance(487, { planKind: "annual" }));
  assert.deepEqual([annual.plan, annual.allowance, annual.rolloverCap], ["annual", 600, null]);
});

test("entitlement: trial, zero balance, expired and complimentary", () => {
  const trial = buildEntitlement(access({ active: true, trial: true }), balance(2, { planKind: "trial" }));
  assert.deepEqual([trial.subscriptionStatus, trial.plan, trial.allowance, trial.balance], ["trial", "trial", 3, 2]);

  const empty = buildEntitlement(access({ active: true }), balance(0));
  assert.equal(empty.canGenerate, false);

  const expired = buildEntitlement(access({ active: false, expiresAt: past }), balance(40));
  assert.deepEqual([expired.subscriptionStatus, expired.balance, expired.canGenerate], ["expired", 0, false], "expired: no generations, whatever the ledger says");

  const none = buildEntitlement(access(null), balance(0, { planKind: null }));
  assert.equal(none.subscriptionStatus, "none");

  const comp = buildEntitlement(access(null, { pro: true, source: "override", overrideExpiresAt: later }), balance(25, { planKind: null }));
  assert.deepEqual([comp.subscriptionStatus, comp.plan, comp.balance, comp.periodEnd], ["complimentary", "complimentary", 25, later]);
});

test("entitlement: development builds can see the billing detail", () => {
  const e = buildEntitlement(access({ active: true }), balance(80, { carriedOver: 30, lastEventId: "rc-9", lastGrantedAt: past, subscriptionRemaining: 80 }), { debug: true });
  assert.deepEqual(e.debug, {
    verifiedWith: "revenuecat", source: "subscription", environment: "production", planKind: "monthly",
    subscriptionRemaining: 80, carriedOver: 30, lastAllowanceEventId: "rc-9", lastAllowanceGrantedAt: past,
  });
});

// --- the server passes the plan's numbers to the database ------------------------

function recordingStore(): { store: AccountStore; periods: PeriodInput[]; events: RevenueCatEventInput[]; expired: string[] } {
  const periods: PeriodInput[] = [];
  const events: RevenueCatEventInput[] = [];
  const expired: string[] = [];
  const store = {
    activeOverride: async () => null,
    cachedSubscription: async () => null,
    ensurePeriod: async (input: PeriodInput) => { periods.push(input); },
    expireSubscription: async (_u: string, at: string) => { expired.push(at); },
    applyRevenueCatEvent: async (e: RevenueCatEventInput) => { events.push(e); return "applied"; },
  } as unknown as AccountStore;
  return { store, periods, events, expired };
}
const user = { id: "11111111-1111-4111-8111-111111111111", email: null, providers: [] };
const services = (store: AccountStore, entitlement: ProEntitlement): AccountServices => ({
  store, media: {} as AccountServices["media"], allowSandbox: true,
  revenuecat: { proEntitlement: async () => entitlement, deleteSubscriber: async () => {} },
});
const pro = (extra: Partial<ProEntitlement> = {}): ProEntitlement => ({
  active: true, productId: MONTHLY, periodStart: past, expiresAt: future, environment: "production", willRenew: true, billingIssue: false,
  managementUrl: null, trial: false, ...extra,
});

test("the live check grants with the plan's kind and rollover cap, and keeps the period open through grace", async () => {
  const monthly = recordingStore();
  await evaluateAccess(user, services(monthly.store, pro()));
  assert.deepEqual([monthly.periods[0].kind, monthly.periods[0].allowance, monthly.periods[0].rolloverCap], ["monthly", 50, 100]);

  const trial = recordingStore();
  await evaluateAccess(user, services(trial.store, pro({ trial: true })));
  assert.deepEqual([trial.periods[0].kind, trial.periods[0].allowance, trial.periods[0].rolloverCap], ["trial", 3, 3]);

  const grace = recordingStore();
  await evaluateAccess(user, services(grace.store, pro({ expiresAt: past, graceExpiresAt: future, billingIssue: true })));
  assert.equal(grace.periods[0].end, future, "the existing period runs to the end of the grace period");
  assert.equal(grace.periods[0].start, past, "same period: no new allowance");
});

test("the live check ends the allowance when RevenueCat reports the subscription expired", async () => {
  const lapsed = recordingStore();
  const decision = await evaluateAccess(user, services(lapsed.store, pro({ active: false, expiresAt: past })));
  assert.equal(decision.pro, false);
  assert.deepEqual(lapsed.expired, [past]);
  assert.equal(lapsed.periods.length, 0);
});

test("webhooks pass the plan's kind and cap: trial, monthly and annual", async () => {
  const { store, events } = recordingStore();
  const send = (type: string, product: string, periodType = "NORMAL") => handleRevenueCatWebhook(new Request("https://smile.test/api/webhooks/revenuecat", {
    method: "POST", headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
    body: JSON.stringify({ event: { id: crypto.randomUUID(), type, app_user_id: user.id, product_id: product, period_type: periodType, environment: "PRODUCTION",
      purchased_at_ms: Date.now() - 1000, expiration_at_ms: Date.now() + 86400000 } }),
  }), { store, authorization: "Bearer secret", allowSandbox: false });
  await send("INITIAL_PURCHASE", MONTHLY, "TRIAL");
  await send("RENEWAL", MONTHLY);
  await send("RENEWAL", ANNUAL);
  assert.deepEqual(events.map(e => [e.type, e.kind, e.allowance, e.rolloverCap]), [
    ["INITIAL_PURCHASE", "trial", 3, 3],
    ["RENEWAL", "monthly", 50, 100],
    ["RENEWAL", "annual", 600, 600],
  ]);
});
