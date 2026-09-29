import test from "node:test";
import assert from "node:assert/strict";
import { allowanceLevel, crossedAnnouncement, describeAllowance } from "../src/lib/allowance";

const period = (remaining: number, included = 50) => ({ included, used: included - remaining, remaining, purchased: 0, periodEnd: "2026-10-01T00:00:00Z" });

test("the level rises as the allowance runs down", () => {
  assert.equal(allowanceLevel(38, 50), "ok");
  assert.equal(allowanceLevel(10, 50), "low");
  assert.equal(allowanceLevel(2, 50), "critical");
  assert.equal(allowanceLevel(0, 50), "empty");
  // Annual: 20% of 600 is 120 left.
  assert.equal(allowanceLevel(120, 600), "low");
  assert.equal(allowanceLevel(30, 600), "critical");
});

test("a trial only warns on its last design", () => {
  assert.equal(allowanceLevel(2, 3, true), "ok");
  assert.equal(allowanceLevel(1, 3, true), "critical");
  assert.equal(allowanceLevel(0, 3, true), "empty");
});

test("the summary and announcements say what is left and when it renews", () => {
  const ok = describeAllowance(period(38));
  assert.equal(ok.summary, "38 of 50 smile designs left");
  assert.equal(ok.announcement, null);
  assert.equal(ok.renews, "1 Oct");
  assert.match(describeAllowance(period(8)).announcement!, /^Running low: 8 smile designs left\. Your allowance renews on 1 Oct\.$/);
  assert.match(describeAllowance(period(1)).announcement!, /^Only 1 smile design left this period/);
  assert.match(describeAllowance(period(0)).announcement!, /used all your smile designs.*renew on 1 Oct/);
  assert.equal(describeAllowance(period(2, 3), true).summary, "Free trial · 2 of 3 smile designs left");
});

test("a heads-up fires once as each threshold is reached", () => {
  assert.equal(crossedAnnouncement(11, 10, 50), "10 smile designs left this period.");
  assert.equal(crossedAnnouncement(10, 9, 50), null);
  assert.equal(crossedAnnouncement(6, 5, 50), "5 smile designs left this period.");
  assert.equal(crossedAnnouncement(1, 0, 50), "That was your last smile design for this period.");
  // No announcement on the first reading, on a renewal, or above the total.
  assert.equal(crossedAnnouncement(null, 5, 50), null);
  assert.equal(crossedAnnouncement(0, 50, 50), null);
  assert.equal(crossedAnnouncement(3, 2, 3, true), null);
  assert.equal(crossedAnnouncement(2, 1, 3, true), "1 smile design left in your free trial.");
});
