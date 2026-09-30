import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  ANNUAL_GENERATIONS, MONTHLY_GENERATIONS, MONTHLY_ROLLOVER_CAP, SUBSCRIPTION_PRODUCTS, TRIAL_GENERATIONS, periodAllowance, type PeriodKind,
} from "../src/config/subscriptions";

// The generation allowance rules on real Postgres (PGlite): monthly rollover capped at 100, annual
// reset to 600, trial kept separate, expiry, plan changes, idempotent billing events and atomic use.
const db = new PGlite();
const MIGRATIONS = [
  "20260927120000_accounts_subscriptions_generation.sql",
  "20260927180000_privacy_security_controls.sql",
  "20260928100000_profile_onboarding_storage.sql",
  "20260928140000_case_library_avatars.sql",
];
const ROLLOVER = "20260929120000_generation_rollover.sql";
const MONTHLY = SUBSCRIPTION_PRODUCTS.monthly.productId;
const ANNUAL = SUBSCRIPTION_PRODUCTS.annual.productId;
let legacy: Record<string, string> = {};

// Fixed instants (relative to when the tests start) so every query names exactly the same times.
const T0 = Date.now();
const at = (days: number, ms = 0) => `timestamptz '${new Date(T0 + days * 86400000 + ms).toISOString()}'`;
const HOUR = 3600000;

const person = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function addUser(id: string) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id.slice(-4)}@example.test`]);
}

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, encrypted_password text);
    create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade, provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, created_at timestamptz default now(), unique (bucket_id, name));
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema storage to anon, authenticated, service_role;
  `);
  for (const file of MIGRATIONS) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));

  // Existing subscribers before this migration: a monthly subscriber with 38 left, an annual one
  // with 500 left and a trial with 2 left. The migration must keep all three exactly.
  legacy = { monthly: person(901), annual: person(902), trial: person(903) };
  for (const id of Object.values(legacy)) await addUser(id);
  const old = async (user: string, product: string, start: string, end: string, allowance: number, used: number) => {
    const { rows } = await db.query<{ id: string }>(
      `select ensure_allowance_period($1, 'subscription', 'production', $2, ${start}, ${end}, $3) as id`, [user, product, allowance]);
    await db.query(`update allowance_periods set used = $2 where id = $1`, [rows[0].id, used]);
  };
  await old(legacy.monthly, MONTHLY, "now() - interval '10 days'", "now() + interval '20 days'", 50, 12);
  await old(legacy.annual, ANNUAL, "now() - interval '100 days'", "now() + interval '265 days'", 600, 100);
  await old(legacy.trial, MONTHLY, "now() - interval '1 day'", "now() + interval '2 days'", 3, 1);

  await db.exec(readFileSync(`supabase/migrations/${ROLLOVER}`, "utf8"));
  await db.exec(`grant all on all tables in schema public to service_role;`);
});

// --- helpers ---------------------------------------------------------------

/** Grant a subscription period through the server's canonical function, as the webhook and live check do. */
function grant(user: string, kind: PeriodKind, start: string, end: string, eventId: string | null = null, product = kind === "annual" ? ANNUAL : MONTHLY) {
  const { allowance, rolloverCap } = periodAllowance(kind);
  return db.query<{ id: string }>(
    `select grant_subscription_period($1, 'production', $2, $3, ${start}, ${end}, $4, $5, $6) as id`,
    [user, product, kind, allowance, rolloverCap, eventId]);
}

/** A RevenueCat webhook event, as the server applies it. */
function event(id: string, type: string, user: string, kind: PeriodKind, start: string, end: string) {
  const { allowance, rolloverCap } = periodAllowance(kind);
  return db.query<{ outcome: string }>(
    `select apply_revenuecat_event($1, $2, $3, 'production', $4, ${start}, ${end}, $5, $6, $7) as outcome`,
    [id, type, user, kind === "annual" ? ANNUAL : MONTHLY, allowance, kind, rolloverCap]);
}

/** Remaining in the period that starts at `start` (its balance, whether or not it is current). */
async function periodRemaining(user: string, start: string) {
  const { rows } = await db.query<{ remaining: number }>(
    `select included_allowance - used as remaining from allowance_periods where user_id = $1 and source = 'subscription' and period_start = date_trunc('second', ${start})`, [user]);
  assert.equal(rows.length, 1, "exactly one period for that start");
  return rows[0].remaining;
}

/** Use n generations from the period that starts at `start`. */
const use = (user: string, start: string, n: number) => db.query(
  `update allowance_periods set used = used + $2 where user_id = $1 and source = 'subscription' and period_start = date_trunc('second', ${start})`, [user, n]);

async function balance(user: string) {
  return (await db.query<{ remaining: number }>(`select remaining from generation_balance($1)`, [user])).rows[0].remaining;
}
const reserve = (user: string, id = crypto.randomUUID()) => db.query<{ remaining: number }>(`select * from reserve_generation($1, $2, 'case-1')`, [user, id]);
async function ledger(user: string, type: string) {
  return (await db.query<{ quantity: number; balance_after: number | null }>(
    `select quantity, balance_after from generation_ledger where user_id = $1 and event_type = $2 order by id`, [user, type])).rows;
}

// Consecutive monthly periods ending with the current one.
const m = (k: number) => at(-((4 - k) * 30 + 10));

// --- the plan numbers come from one server-side source --------------------

test("plan constants: 50 a month with a 100 rollover cap, 600 a year, 3 in the trial", () => {
  assert.equal(MONTHLY_GENERATIONS, 50);
  assert.equal(MONTHLY_ROLLOVER_CAP, 100);
  assert.equal(ANNUAL_GENERATIONS, 600);
  assert.equal(TRIAL_GENERATIONS, 3);
  assert.deepEqual(periodAllowance("monthly"), { allowance: 50, rolloverCap: 100 });
  assert.deepEqual(periodAllowance("annual"), { allowance: 600, rolloverCap: 600 });
  assert.deepEqual(periodAllowance("trial"), { allowance: 3, rolloverCap: 3 });
});

// --- monthly rollover --------------------------------------------------------

test("1–4. monthly: 50 to start, then remaining + 50 on each renewal, capped at 100", async () => {
  const mona = person(1);
  await addUser(mona);
  await grant(mona, "monthly", m(0), m(1));
  assert.equal(await periodRemaining(mona, m(0)), 50, "1. new monthly subscriber");
  await use(mona, m(0), 20);
  assert.equal(await periodRemaining(mona, m(0)), 30);

  await grant(mona, "monthly", m(1), m(2));
  assert.equal(await periodRemaining(mona, m(1)), 80, "2. 30 + 50");
  await use(mona, m(1), 10);

  await grant(mona, "monthly", m(2), m(3));
  assert.equal(await periodRemaining(mona, m(2)), 100, "3. 70 + 50, capped at 100");

  await grant(mona, "monthly", m(3), at(20));
  assert.equal(await periodRemaining(mona, m(3)), 100, "4. 100 + 50, still 100");
  assert.equal(await balance(mona), 100, "only the current period counts");

  assert.deepEqual((await ledger(mona, "subscription_activation")).map(r => r.quantity), [50]);
  assert.deepEqual((await ledger(mona, "monthly_renewal")).map(r => r.quantity), [50, 30, 0], "what each renewal actually added");
  const periods = await db.query<{ carried_over: number; closed_reason: string | null }>(
    `select carried_over, closed_reason from allowance_periods where user_id = $1 order by period_start`, [mona]);
  assert.deepEqual(periods.rows.map(r => [r.carried_over, r.closed_reason]), [[0, "renewed"], [30, "renewed"], [70, "renewed"], [100, null]]);
});

test("5. a renewal delivered three times (and seen by the live check) grants once", async () => {
  const rhea = person(5);
  await addUser(rhea);
  await grant(rhea, "monthly", at(-40), at(-10), "rc-initial");
  const start = at(-10);
  const end = at(20);
  const outcomes = [];
  for (let i = 0; i < 3; i++) outcomes.push((await event("rc-renewal-5", "RENEWAL", rhea, "monthly", start, end)).rows[0].outcome);
  assert.deepEqual(outcomes, ["applied", "duplicate", "duplicate"]);
  // The live RevenueCat check reports the same period in whole seconds: still the same grant.
  await grant(rhea, "monthly", `date_trunc('second', ${start})`, end, null);
  assert.equal(await balance(rhea), 100, "50 carried + 50 once, not + 150");
  assert.equal((await ledger(rhea, "monthly_renewal")).length, 1);
  const recorded = await db.query<{ billing_event_id: string }>(
    `select billing_event_id from allowance_periods where user_id = $1 and period_start = date_trunc('second', ${start})`, [rhea]);
  assert.equal(recorded.rows[0].billing_event_id, "rc-renewal-5");
});

// --- using generations -------------------------------------------------------

test("6–7. a successful generation uses one; a failed one is refunded", async () => {
  const gina = person(6);
  await addUser(gina);
  await event("rc-gina-1", "INITIAL_PURCHASE", gina, "monthly", at(-1), at(29));
  assert.equal(await balance(gina), 50);

  const ok = crypto.randomUUID();
  assert.equal((await reserve(gina, ok)).rows[0].remaining, 49);
  await db.query(`select commit_generation($1, 'google', 'model', 'request-1')`, [ok]);
  assert.equal(await balance(gina), 49, "6. 50 → 49");

  const failed = crypto.randomUUID();
  assert.equal((await reserve(gina, failed)).rows[0].remaining, 48, "7. reserved");
  await db.query(`select release_generation($1, 'provider_unavailable')`, [failed]);
  await db.query(`select release_generation($1, 'provider_unavailable')`, [failed]); // idempotent
  assert.equal(await balance(gina), 49, "7. refunded");
  const refunds = await ledger(gina, "generation_refund");
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].balance_after, 49, "the ledger records the balance after the refund");
});

test("8. two simultaneous requests at a balance of 1: only one proceeds", async () => {
  const ivy = person(8);
  await addUser(ivy);
  await grant(ivy, "monthly", at(-1), at(29));
  await use(ivy, at(-1), 49);
  assert.equal(await balance(ivy), 1);
  const results = await Promise.allSettled([reserve(ivy), reserve(ivy)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rejected.reason), /allowance_exhausted/);
  assert.equal(await balance(ivy), 0);
});

// --- annual ------------------------------------------------------------------

test("9–10. annual: 600 on activation; renewal replaces the balance with 600", async () => {
  const ann = person(9);
  await addUser(ann);
  const year1 = at(-370);
  const year2 = at(-5);
  await grant(ann, "annual", year1, year2);
  assert.equal(await periodRemaining(ann, year1), 600, "9. annual activation");
  await use(ann, year1, 427);
  assert.equal(await periodRemaining(ann, year1), 173);

  await event("rc-ann-2", "RENEWAL", ann, "annual", year2, at(360));
  assert.equal(await balance(ann), 600, "10. 173 left → 600, not 773");
  assert.deepEqual((await ledger(ann, "annual_renewal")).map(r => r.quantity), [600]);
  assert.deepEqual((await ledger(ann, "allowance_lapsed")).map(r => r.quantity), [-173]);
});

// --- cancellation, expiry, resubscribing ----------------------------------------

test("11–13. cancelled keeps access to the period's end; expiry ends it; resubscribing starts at 50", async () => {
  const cara = person(11);
  await addUser(cara);
  await grant(cara, "monthly", at(-40), at(-10));
  await event("rc-cara-2", "RENEWAL", cara, "monthly", at(-10), at(20));
  assert.equal(await balance(cara), 100);

  assert.equal((await event("rc-cara-3", "CANCELLATION", cara, "monthly", at(-10), at(20))).rows[0].outcome, "applied");
  assert.equal((await reserve(cara)).rows[0].remaining, 99, "11. cancelled, paid period still active: can generate");

  await event("rc-cara-4", "EXPIRATION", cara, "monthly", at(-10), at(0));
  await assert.rejects(reserve(cara), /no_active_allowance/, "12. expired: cannot generate");
  assert.equal(await balance(cara), 0);
  assert.deepEqual((await ledger(cara, "subscription_expired")).map(r => r.quantity), [-99]);
  const status = await db.query<{ subscription_status: string; subscription_tier: string }>(`select subscription_status, subscription_tier from profiles where id = $1`, [cara]);
  assert.deepEqual(status.rows[0], { subscription_status: "expired", subscription_tier: "free" });

  await event("rc-cara-5", "INITIAL_PURCHASE", cara, "monthly", at(0, 1*1000), at(30));
  // The resubscription starts a second from now: count its period directly.
  assert.equal(await periodRemaining(cara, at(0, 1*1000)), 50, "13. 50, the old 99 does not return");
  assert.deepEqual((await ledger(cara, "subscription_activation")).map(r => r.quantity), [50, 50]);
});

test("an expiry reported after a resubscription doesn't end the new period", async () => {
  const olly = person(12);
  await addUser(olly);
  await grant(olly, "monthly", at(0, -2*HOUR), at(30));
  // A late EXPIRATION for a subscription that ended three hours ago.
  await db.query(`select expire_subscription($1, 'rc-late', ${at(0, -3*HOUR)})`, [olly]);
  assert.equal(await balance(olly), 50);
});

// --- trial -------------------------------------------------------------------

test("14–17. trial: 3 generations, never carried; conversion starts the plan's allowance", async () => {
  const tom = person(14);
  const tia = person(15);
  await addUser(tom);
  await addUser(tia);
  const trialStart = at(-3);
  const trialEnd = at(0, -1*60000);

  await event("rc-tom-1", "INITIAL_PURCHASE", tom, "trial", trialStart, at(1));
  assert.equal(await balance(tom), 3, "14. trial begins with 3");
  await reserve(tom);
  await reserve(tom);
  assert.equal(await balance(tom), 1, "15. trial uses 2: 1 remains");

  // The App Store trial ends and converts to monthly: the conversion is a RENEWAL.
  await db.query(`update allowance_periods set period_end = ${trialEnd} where user_id = $1`, [tom]);
  await event("rc-tom-2", "RENEWAL", tom, "monthly", trialEnd, at(30));
  assert.equal(await balance(tom), 50, "16. 50, not 51");
  assert.deepEqual((await ledger(tom, "allowance_lapsed")).map(r => r.quantity), [-1]);

  await grant(tia, "trial", trialStart, trialEnd);
  await use(tia, trialStart, 1);
  await event("rc-tia-2", "RENEWAL", tia, "annual", trialEnd, at(365));
  assert.equal(await balance(tia), 600, "17. 600, not 602");
  assert.deepEqual((await ledger(tia, "subscription_activation")).map(r => r.quantity), [600]);
});

// --- plan changes --------------------------------------------------------------

test("plan changes start the new plan's allowance: monthly → annual = 600, annual → monthly = 50", async () => {
  const max = person(20);
  await addUser(max);
  await grant(max, "monthly", at(-70), at(-40));
  await grant(max, "monthly", at(-40), at(-10));
  assert.equal(await periodRemaining(max, at(-40)), 100);
  await event("rc-max-annual", "RENEWAL", max, "annual", at(-10), at(355));
  assert.equal(await balance(max), 600, "not 700");
  assert.deepEqual((await ledger(max, "plan_change")).map(r => r.quantity), [600]);

  const ada = person(21);
  await addUser(ada);
  await grant(ada, "annual", at(-370), at(-5));
  await event("rc-ada-monthly", "RENEWAL", ada, "monthly", at(-5), at(25));
  assert.equal(await balance(ada), 50, "annual credits don't carry into monthly");
});

test("an upgrade part-way through a period closes the old period so nothing counts twice", async () => {
  const uma = person(22);
  await addUser(uma);
  await grant(uma, "monthly", at(-10), at(20));
  await grant(uma, "annual", at(0, -1*HOUR), at(365));
  assert.equal(await balance(uma), 600);
  const old = await db.query<{ closed_reason: string; ended: boolean }>(
    `select closed_reason, period_end <= now() as ended from allowance_periods where user_id = $1 and kind = 'monthly'`, [uma]);
  assert.deepEqual(old.rows[0], { closed_reason: "plan_changed", ended: true });
});

// --- failed payments and grace -------------------------------------------------------

test("a failed renewal grants nothing; a grace period keeps the existing balance without a new grant", async () => {
  const gus = person(23);
  await addUser(gus);
  const start = at(-31);
  await grant(gus, "monthly", start, at(-1));
  await use(gus, start, 30);
  assert.equal((await event("rc-gus-bill", "BILLING_ISSUE", gus, "monthly", start, at(-1))).rows[0].outcome, "applied");
  assert.equal(await balance(gus), 0, "the period ended and no renewal was paid");
  // The live check sees the App Store grace period: the same period runs on, nothing new is granted.
  await grant(gus, "monthly", start, at(15));
  assert.equal(await balance(gus), 20, "the existing balance is usable during grace");
  assert.equal((await ledger(gus, "monthly_renewal")).length, 0);
  // Payment recovers: a real renewal, which rolls over.
  await event("rc-gus-renew", "RENEWAL", gus, "monthly", at(0, -1*HOUR), at(30));
  assert.equal(await balance(gus), 70, "20 + 50");
});

test("a lapse longer than any grace period is not continuous: no rollover without an expiry event", async () => {
  const lia = person(24);
  await addUser(lia);
  await grant(lia, "monthly", at(-90), at(-60));
  await grant(lia, "monthly", at(-1), at(29));
  assert.equal(await balance(lia), 50);
});

test("a refund after the period renewed goes back to the current period", async () => {
  const ren = person(25);
  await addUser(ren);
  await grant(ren, "monthly", at(-1), at(29));
  const pending = crypto.randomUUID();
  await reserve(ren, pending);
  // The renewal lands while that generation is still running (carrying 49, the pending one counted as used).
  await grant(ren, "monthly", at(0, -1*1000), at(30));
  assert.equal(await balance(ren), 99);
  await db.query(`select release_generation($1, 'generation_timeout')`, [pending]);
  assert.equal(await balance(ren), 100);
});

// --- migrating existing users -------------------------------------------------------

test("migration keeps existing balances exactly and grants nothing", async () => {
  assert.equal(await balance(legacy.monthly), 38, "monthly subscriber keeps 38 (not reset, not + 50)");
  assert.equal(await balance(legacy.annual), 500, "annual subscriber keeps 500 (not reset to 600)");
  assert.equal(await balance(legacy.trial), 2, "trial keeps 2");
  const kinds = await db.query<{ user_id: string; kind: string }>(
    `select user_id, kind from allowance_periods where user_id = any($1::uuid[])`, [Object.values(legacy)]);
  const byUser = Object.fromEntries(kinds.rows.map(r => [r.user_id, r.kind]));
  assert.deepEqual([byUser[legacy.monthly], byUser[legacy.annual], byUser[legacy.trial]], ["monthly", "annual", "trial"]);
  for (const user of Object.values(legacy)) {
    const grants = await db.query(`select 1 from generation_ledger where user_id = $1 and status = 'granted'`, [user]);
    assert.equal(grants.rows.length, 1, "only the original grant");
  }
  // Their next renewal follows the new rules.
  await grant(legacy.monthly, "monthly", at(20), at(50));
  assert.equal(await periodRemaining(legacy.monthly, at(20)), 88, "38 + 50");
});

test("the rollover functions are backend-only", async () => {
  const eve = person(30);
  await addUser(eve);
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${eve}';`);
  try {
    await assert.rejects(db.query(`select grant_subscription_period('${eve}', 'production', 'p', 'monthly', now(), ${at(30)}, 5000, 5000, null)`), /permission denied/);
    await assert.rejects(db.query(`select expire_subscription('${eve}', null, now())`), /permission denied/);
    await assert.rejects(db.query(`update allowance_periods set included_allowance = 999`), /permission denied/);
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
});
