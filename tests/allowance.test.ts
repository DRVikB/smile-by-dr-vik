import test from "node:test";
import assert from "node:assert/strict";
import { allowanceLevel, crossedAnnouncement, describeAllowance, entitlementOf, widgetAllowance } from "../src/lib/allowance";
import type { GenerationEntitlement } from "../src/lib/entitlement";

const monthly = (balance: number, extra: Partial<GenerationEntitlement> = {}): GenerationEntitlement => ({
  subscriptionStatus: "active", plan: "monthly", balance, allowance: 50, rolloverCap: 100,
  periodStart: "2026-09-14T09:00:00Z", periodEnd: "2026-10-14T09:00:00Z", cancelAtPeriodEnd: false, canGenerate: balance > 0, ...extra,
});

test("levels: 10 or fewer is low, 5 or fewer is critical, 0 is empty (a trial only on its last)", () => {
  assert.equal(allowanceLevel(38), "ok");
  assert.equal(allowanceLevel(11), "ok");
  assert.equal(allowanceLevel(10), "low");
  assert.equal(allowanceLevel(5), "critical");
  assert.equal(allowanceLevel(0), "empty");
  assert.equal(allowanceLevel(2, true), "ok");
  assert.equal(allowanceLevel(1, true), "critical");
});

test("monthly: the balance on its own (never 38 / 50), the renewal date and the rollover rule", () => {
  const view = describeAllowance(monthly(38));
  assert.equal(view.summary, "38 generations remaining");
  assert.equal(view.renewal, "Renews 14 October");
  assert.equal(view.rolloverNote, "Unused monthly generations roll over up to 100 while your subscription remains active.");
  assert.equal(view.announcement, null);
  assert.equal(describeAllowance(monthly(72)).summary, "72 generations remaining", "a rolled-over balance above 50");
});

test("annual: its own renewal wording, never described as monthly or rolling over", () => {
  const view = describeAllowance(monthly(487, { plan: "annual", allowance: 600, rolloverCap: null, periodEnd: "2027-09-14T09:00:00Z" }));
  assert.equal(view.summary, "487 generations remaining");
  assert.equal(view.renewal, "Annual allowance renews 14 September 2027");
  assert.equal(view.rolloverNote, null);
});

test("low balance states are quiet and specific", () => {
  assert.equal(describeAllowance(monthly(10)).announcement, "10 generations remaining");
  assert.equal(describeAllowance(monthly(5)).announcement, "Only 5 generations remaining");
  const empty = describeAllowance(monthly(0));
  assert.equal(empty.announcement, "You’ve used your available SmileCompose generations.");
  assert.equal(empty.emptyDetail, "Your monthly allowance renews on 14 October.");
  const annualEmpty = describeAllowance(monthly(0, { plan: "annual", periodEnd: "2027-09-14T09:00:00Z" }));
  assert.equal(annualEmpty.emptyDetail, "Your annual allowance renews on 14 September 2027.");
});

test("trial, cancelling and complimentary", () => {
  const trial = describeAllowance(monthly(2, { subscriptionStatus: "trial", plan: "trial", allowance: 3, rolloverCap: null, periodEnd: "2026-10-02T09:00:00Z" }));
  assert.equal(trial.summary, "2 generations remaining in your trial");
  assert.equal(trial.renewal, "Trial ends 2 October");
  assert.equal(trial.rolloverNote, null);
  const trialEmpty = describeAllowance(monthly(0, { subscriptionStatus: "trial", plan: "trial", periodEnd: "2026-10-02T09:00:00Z" }));
  assert.equal(trialEmpty.emptyDetail, "Your plan’s allowance begins when your trial converts on 2 October.");

  const cancelling = describeAllowance(monthly(12, { subscriptionStatus: "cancelling", cancelAtPeriodEnd: true }));
  assert.equal(cancelling.renewal, "Ends 14 October");
  assert.equal(describeAllowance(monthly(25, { subscriptionStatus: "complimentary", plan: "complimentary", rolloverCap: null })).renewal, "Complimentary access");
});

test("a heads-up fires once as the balance reaches 10, 5 and 0", () => {
  assert.equal(crossedAnnouncement(11, 10), "10 generations remaining");
  assert.equal(crossedAnnouncement(10, 9), null);
  assert.equal(crossedAnnouncement(6, 5), "Only 5 generations remaining");
  assert.equal(crossedAnnouncement(1, 0), "You’ve used your available SmileCompose generations.");
  assert.equal(crossedAnnouncement(null, 5), null, "not on the first reading");
  assert.equal(crossedAnnouncement(0, 50), null, "not on a renewal");
  assert.equal(crossedAnnouncement(3, 2, true), null);
  assert.equal(crossedAnnouncement(2, 1, true), "1 generation remaining in your free trial");
});

test("an older server's status is read into the same entitlement, for display only", () => {
  const e = entitlementOf({
    pro: true, source: "subscription", overrideExpiresAt: null,
    subscription: { active: true, productId: "uk.co.drvik.smilecompose.pro.annual", expiresAt: "2027-09-14T09:00:00Z", willRenew: true, billingIssue: false },
    generations: { remaining: 173, periodEnd: "2027-09-14T09:00:00Z" },
  });
  assert.deepEqual([e.plan, e.balance, e.allowance, e.rolloverCap, e.subscriptionStatus], ["annual", 173, 600, null, "active"]);
  const lapsed = entitlementOf({ pro: false, source: null, overrideExpiresAt: null,
    subscription: { active: false, productId: null, expiresAt: "2026-08-01T00:00:00Z", willRenew: false, billingIssue: false },
    generations: { remaining: 40, periodEnd: null } });
  assert.deepEqual([lapsed.subscriptionStatus, lapsed.balance, lapsed.canGenerate], ["expired", 0, false]);
});

test("the widget shows the app's own wording and a ring filled by one period's allowance", () => {
  const w = widgetAllowance(monthly(38));
  assert.deepEqual(w, { remaining: 38, summary: "38 generations remaining", renewal: "Renews 14 October", plan: "Pro Monthly", fraction: 0.76, periodEnd: "2026-10-14T09:00:00Z" });
  assert.equal(widgetAllowance(monthly(72)).fraction, 1, "a rolled-over balance shows full");
  assert.equal(widgetAllowance(monthly(0)).fraction, 0);
  const annual = widgetAllowance(monthly(487, { plan: "annual", allowance: 600, rolloverCap: null, periodEnd: "2027-09-14T09:00:00Z" }));
  assert.deepEqual([annual.plan, annual.renewal, annual.fraction], ["Pro Annual", "Annual allowance renews 14 September 2027", 0.812]);
  const trial = widgetAllowance(monthly(2, { subscriptionStatus: "trial", plan: "trial", allowance: 3, rolloverCap: null }));
  assert.deepEqual([trial.plan, trial.summary], ["Pro free trial", "2 generations remaining in your trial"]);
  const comp = widgetAllowance(monthly(25, { subscriptionStatus: "complimentary", plan: "complimentary", allowance: null, rolloverCap: null }));
  assert.deepEqual([comp.plan, comp.fraction], ["Complimentary access", 1]);
});
