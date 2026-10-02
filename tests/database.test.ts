import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// The Supabase migration running on real Postgres (PGlite), with a minimal
// stand-in for Supabase's auth schema and roles.
const db = new PGlite();
const alice = "00000000-0000-4000-8000-00000000000a";
const bob = "00000000-0000-4000-8000-00000000000b";

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, encrypted_password text);
    create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade, provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    -- Minimal stand-in for Supabase Storage (buckets, objects with RLS, foldername()).
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, created_at timestamptz default now(), unique (bucket_id, name));
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant select on storage.buckets to authenticated;
    grant all on storage.objects, storage.buckets to service_role;
  `);
  await db.exec(readFileSync("supabase/migrations/20260927120000_accounts_subscriptions_generation.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260927180000_privacy_security_controls.sql", "utf8"));
  await db.exec(`grant all on all tables in schema public to service_role;`);
  await db.query(`insert into auth.users (id, email) values ($1, 'alice@example.test'), ($2, 'bob@example.test')`, [alice, bob]);
  // An existing account whose Apple name was saved as display_name before names were split.
  await db.query(`update profiles set display_name = E'Bob\tExample ' where id = $1`, [bob]);
  await db.exec(readFileSync("supabase/migrations/20260928100000_profile_onboarding_storage.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260928140000_case_library_avatars.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260929120000_generation_rollover.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261002093305_patient_case_sync.sql", "utf8"));
  await db.exec(`grant all on all tables in schema public to service_role;`);
});

const period = (user: string, allowance: number, start = "now() - interval '1 day'", end = "now() + interval '29 days'", source = "subscription") =>
  db.query<{ id: string }>(`select ensure_allowance_period($1, '${source}', 'production', 'uk.co.drvik.smilecompose.pro.monthly', ${start}, ${end}, $2) as id`, [user, allowance]);
const reserve = (user: string, id: string) => db.query<{ remaining: number }>(`select * from reserve_generation($1, $2, 'case-1')`, [user, id]);
const uuid = () => crypto.randomUUID();

test("new auth users get a profile", async () => {
  const { rows } = await db.query<{ email: string; subscription_tier: string }>(`select email, subscription_tier from profiles where id = $1`, [alice]);
  assert.deepEqual(rows[0], { email: "alice@example.test", subscription_tier: "free" });
});

test("a billing period's allowance is granted exactly once", async () => {
  const first = await db.query<{ id: string }>(`select ensure_allowance_period($1, 'subscription', 'production', 'p', timestamptz '2099-01-01', timestamptz '2099-02-01', 5) as id`, [bob]);
  const again = await db.query<{ id: string }>(`select ensure_allowance_period($1, 'subscription', 'production', 'p', timestamptz '2099-01-01', timestamptz '2099-02-01', 5) as id`, [bob]);
  assert.equal(first.rows[0].id, again.rows[0].id);
  const grants = await db.query(`select 1 from generation_ledger where user_id = $1 and event_type = 'monthly_generation'`, [bob]);
  assert.equal(grants.rows.length, 1);
});

test("reserve, commit and refund keep allowance and ledger consistent", async () => {
  await period(alice, 2);
  const a = uuid(), b = uuid(), c = uuid();
  assert.equal((await reserve(alice, a)).rows[0].remaining, 1);
  await db.query(`select commit_generation($1, 'google', 'gemini-3.1-flash-image', 'variation-1')`, [a]);
  assert.equal((await reserve(alice, b)).rows[0].remaining, 0);
  await assert.rejects(reserve(alice, c), /allowance_exhausted/);
  await db.query(`select release_generation($1, 'provider failed')`, [b]);
  await db.query(`select release_generation($1, 'provider failed')`, [b]); // idempotent
  assert.equal((await db.query<{ remaining: number }>(`select remaining from generation_balance($1)`, [alice])).rows[0].remaining, 1);
  await assert.rejects(reserve(alice, a), /duplicate_request/);

  const ledger = await db.query<{ event_type: string; quantity: number; status: string }>(
    `select event_type, quantity, status from generation_ledger where user_id = $1 order by id`, [alice]);
  assert.deepEqual(ledger.rows.map(r => `${r.event_type}:${r.quantity}:${r.status}`), [
    "monthly_generation:2:granted", "generation:-1:reserved", "generation:0:committed",
    "generation:-1:reserved", "generation_refund:1:released",
  ]);
  const net = await db.query<{ sum: number }>(`select sum(quantity)::int as sum from generation_ledger where user_id = $1`, [alice]);
  assert.equal(net.rows[0].sum, 1);
  const profile = await db.query<{ generation_allowance: number; generation_used: number }>(`select generation_allowance, generation_used from profiles where id = $1`, [alice]);
  assert.deepEqual(profile.rows[0], { generation_allowance: 2, generation_used: 1 });
});

test("the ledger is append-only", async () => {
  await assert.rejects(db.query(`update generation_ledger set quantity = 100 where user_id = $1`, [alice]), /append-only/);
});

test("no active period means no generation; purchased credits are used after the period runs out", async () => {
  const carol = "00000000-0000-4000-8000-00000000000c";
  await db.query(`insert into auth.users (id, email) values ($1, 'carol@example.test')`, [carol]);
  await assert.rejects(reserve(carol, uuid()), /no_active_allowance/);
  await db.query(`select admin_adjust_generations($1, 1, 'support credit')`, [carol]);
  const id = uuid();
  assert.equal((await reserve(carol, id)).rows[0].remaining, 0);
  await db.query(`select release_generation($1, 'failed')`, [id]);
  assert.equal((await db.query<{ purchased_generation_balance: number }>(`select purchased_generation_balance from profiles where id = $1`, [carol])).rows[0].purchased_generation_balance, 1);
});

test("stale reservations return to the allowance", async () => {
  const dave = "00000000-0000-4000-8000-00000000000d";
  await db.query(`insert into auth.users (id, email) values ($1, 'dave@example.test')`, [dave]);
  await period(dave, 1);
  const abandoned = uuid();
  await reserve(dave, abandoned);
  await db.query(`update generation_reservations set created_at = now() - interval '1 hour' where id = $1`, [abandoned]);
  assert.equal((await reserve(dave, uuid())).rows[0].remaining, 0);
  const status = await db.query<{ status: string }>(`select status from generation_reservations where id = $1`, [abandoned]);
  assert.equal(status.rows[0].status, "released");
});

test("RevenueCat events apply once; duplicates and unknown users are harmless", async () => {
  const erin = "00000000-0000-4000-8000-00000000000e";
  await db.query(`insert into auth.users (id, email) values ($1, 'erin@example.test')`, [erin]);
  const apply = (id: string, type: string, user: string | null) => db.query<{ outcome: string }>(
    `select apply_revenuecat_event($1, $2, $3, 'sandbox', 'uk.co.drvik.smilecompose.pro.monthly', now() - interval '1 minute', now() + interval '30 days', 50) as outcome`,
    [id, type, user]);
  assert.equal((await apply("evt-1", "INITIAL_PURCHASE", erin)).rows[0].outcome, "applied");
  assert.equal((await apply("evt-1", "INITIAL_PURCHASE", erin)).rows[0].outcome, "duplicate");
  const periods = await db.query(`select 1 from allowance_periods where user_id = $1`, [erin]);
  assert.equal(periods.rows.length, 1);
  const profile = await db.query<{ subscription_status: string; subscription_environment: string }>(`select subscription_status, subscription_environment from profiles where id = $1`, [erin]);
  assert.deepEqual(profile.rows[0], { subscription_status: "active", subscription_environment: "sandbox" });
  assert.equal((await apply("evt-2", "BILLING_ISSUE", erin)).rows[0].outcome, "applied");
  assert.equal((await apply("evt-3", "EXPIRATION", erin)).rows[0].outcome, "applied");
  assert.equal((await db.query<{ subscription_tier: string }>(`select subscription_tier from profiles where id = $1`, [erin])).rows[0].subscription_tier, "free");
  assert.equal((await apply("evt-4", "INITIAL_PURCHASE", null)).rows[0].outcome, "ignored_unknown_user");
  assert.equal((await apply("evt-5", "TEST", erin)).rows[0].outcome, "ignored_type");
});

test("row level security: users read only their own data and cannot write allowances or overrides", async () => {
  await db.query(`insert into access_overrides (user_id, reason) values ($1, 'QA account')`, [alice]);
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
  try {
    assert.equal((await db.query(`select * from profiles`)).rows.length, 1);
    assert.equal((await db.query(`select * from generation_ledger where user_id <> '${alice}'`)).rows.length, 0);
    assert.equal((await db.query(`select * from allowance_periods`)).rows.every((r: unknown) => (r as { user_id: string }).user_id === alice), true);
    await assert.rejects(db.query(`select * from access_overrides`), /permission denied/);
    await assert.rejects(db.query(`insert into access_overrides (user_id, reason) values ('${alice}', 'self grant')`), /permission denied/);
    await assert.rejects(db.query(`update profiles set subscription_tier = 'pro'`), /permission denied/);
    await assert.rejects(db.query(`update allowance_periods set included_allowance = 9999`), /permission denied/);
    await assert.rejects(db.query(`select * from reserve_generation('${alice}', gen_random_uuid(), null)`), /permission denied/);
    await assert.rejects(db.query(`select ensure_allowance_period('${alice}', 'override', 'production', null, now(), now() + interval '1 year', 9999)`), /permission denied/);
    const renamed = await db.query(`update profiles set display_name = 'Dr A' where id = '${alice}'`);
    assert.equal(renamed.affectedRows, 1);
    const other = await db.query(`update profiles set display_name = 'x' where id = '${bob}'`);
    assert.equal(other.affectedRows, 0);
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
});

test("consent records are versioned, recorded once per version (or case) and append-only", async () => {
  await db.query(`select record_consent($1, 'terms', '2026-09-27', null)`, [bob]);
  await db.query(`select record_consent($1, 'terms', '2026-09-27', null)`, [bob]);
  await db.query(`select record_consent($1, 'upload_authority', 'v1', 'case-a')`, [bob]);
  await db.query(`select record_consent($1, 'upload_authority', 'v1', 'case-b')`, [bob]);
  const rows = await db.query(`select record_type, case_id from consent_records where user_id = $1 order by id`, [bob]);
  assert.equal(rows.rows.length, 3);
  await assert.rejects(db.query(`update consent_records set document_version = 'x' where user_id = $1`, [bob]), /append-only/);
  await assert.rejects(db.query(`select record_consent($1, 'upload_authority', 'v1', 'Jane Smith')`, [bob]), /check/i);
});

test("security events are audited by triggers without copying secrets or patient data", async () => {
  const frank = "00000000-0000-4000-8000-00000000000f";
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, 'frank@example.test', 'hash-1')`, [frank]);
  await db.query(`update auth.users set encrypted_password = 'hash-2' where id = $1`, [frank]);
  await db.query(`insert into auth.identities (user_id, provider) values ($1, 'apple')`, [frank]);
  await db.query(`insert into access_overrides (user_id, reason, created_by) values ($1, 'QA account', 'owner')`, [frank]);
  await db.query(`update access_overrides set revoked_at = now() where user_id = $1`, [frank]);
  await db.query(`select admin_adjust_generations($1, 5, 'support credit')`, [frank]);
  await db.query(`select apply_revenuecat_event('evt-audit', 'RENEWAL', $1, 'production', 'p', now(), now() + interval '30 days', 50)`, [frank]);
  const events = await db.query<{ event_type: string; metadata: Record<string, unknown> }>(`select event_type, metadata from security_audit_log where user_id = $1 order by id`, [frank]);
  assert.deepEqual(events.rows.map(e => e.event_type), [
    "password_changed", "sign_in_method_linked", "complimentary_access_granted", "complimentary_access_revoked",
    "generation_credit_adjusted", "subscription_event",
  ]);
  assert.equal(JSON.stringify(events.rows).includes("hash-"), false);
  await assert.rejects(db.query(`update security_audit_log set event_type = 'x' where user_id = $1`, [frank]), /append-only/);
});

test("generation attempts are rate limited per account", async () => {
  const gina = "00000000-0000-4000-8000-000000000010";
  await db.query(`insert into auth.users (id, email) values ($1, 'gina@example.test')`, [gina]);
  await period(gina, 100);
  for (let i = 0; i < 6; i++) await reserve(gina, uuid());
  await assert.rejects(reserve(gina, uuid()), /rate_limited/);
});

test("generation audit records prompt version and treatment type, never patient data", async () => {
  const hana = "00000000-0000-4000-8000-000000000011";
  await db.query(`insert into auth.users (id, email) values ($1, 'hana@example.test')`, [hana]);
  await period(hana, 5);
  const id = uuid();
  await reserve(hana, id);
  await db.query(`select commit_generation($1, 'google', 'gemini-3.1-flash-image', 'var-1', 'prompt-v9', 'Porcelain / Reshape')`, [id]);
  const row = await db.query<{ prompt_version: string; treatment_type: string }>(`select prompt_version, treatment_type from generation_ledger where reservation_id = $1 and status = 'committed'`, [id]);
  assert.deepEqual(row.rows[0], { prompt_version: "prompt-v9", treatment_type: "Porcelain / Reshape" });
  const failed = uuid();
  await reserve(hana, failed);
  await db.query(`select release_generation($1, 'provider_unavailable')`, [failed]);
  const refund = await db.query<{ failure_code: string }>(`select failure_code from generation_ledger where reservation_id = $1 and event_type = 'generation_refund'`, [failed]);
  assert.equal(refund.rows[0].failure_code, "provider_unavailable");
});

test("data-subject helpers export one account and locate one case", async () => {
  const exported = await db.query<{ data: Record<string, unknown[]> & { user_id: string } }>(`select export_account_data($1) as data`, [bob]);
  assert.equal(exported.rows[0].data.user_id, bob);
  assert.ok(Array.isArray(exported.rows[0].data.consent_records));
  assert.ok(exported.rows[0].data.consent_records.length >= 3);
  const located = await db.query<{ data: { consent_records: unknown[] } }>(`select locate_case_records($1, 'case-a') as data`, [bob]);
  assert.equal(located.rows[0].data.consent_records.length, 1);
});

test("cross-tenant and privileged operations are denied to a normal user", async () => {
  await db.query(`insert into organisations (id, name) values ('00000000-0000-4000-8000-0000000000aa', 'Practice A')`);
  await db.query(`insert into organisation_members (organisation_id, user_id, role) values ('00000000-0000-4000-8000-0000000000aa', $1, 'owner')`, [bob]);
  await db.query(`insert into incident_register (date_detected, summary) values (now(), 'test incident')`);
  const eve = "00000000-0000-4000-8000-000000000012";
  await db.query(`insert into auth.users (id, email) values ($1, 'eve@example.test')`, [eve]);
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${eve}';`);
  try {
    assert.equal((await db.query(`select * from profiles where id = '${bob}'`)).rows.length, 0);
    assert.equal((await db.query(`select * from consent_records where user_id = '${bob}'`)).rows.length, 0);
    assert.equal((await db.query(`select * from generation_ledger where user_id = '${bob}'`)).rows.length, 0);
    assert.equal((await db.query(`select * from organisations`)).rows.length, 0);
    assert.equal((await db.query(`select * from organisation_members`)).rows.length, 0);
    await assert.rejects(db.query(`select * from incident_register`), /permission denied/);
    await assert.rejects(db.query(`insert into organisation_members (organisation_id, user_id) values ('00000000-0000-4000-8000-0000000000aa', '${eve}')`), /permission denied/);
    await assert.rejects(db.query(`insert into security_audit_log (actor, event_type) values ('user', 'forged')`), /permission denied/);
    await assert.rejects(db.query(`insert into consent_records (user_id, record_type, document_version) values ('${eve}', 'terms', 'x')`), /permission denied/);
    await assert.rejects(db.query(`select record_consent('${eve}', 'terms', 'x', null)`), /permission denied/);
    await assert.rejects(db.query(`select export_account_data('${bob}')`), /permission denied/);
    await assert.rejects(db.query(`select admin_adjust_generations('${eve}', 100, 'self credit')`), /permission denied/);
    await assert.rejects(db.query(`select apply_revenuecat_event('forged', 'INITIAL_PURCHASE', '${eve}', 'production', 'p', now(), now() + interval '1 year', 9999)`), /permission denied/);
    await assert.rejects(db.query(`update profiles set subscription_status = 'active', purchased_generation_balance = 999 where id = '${eve}'`), /permission denied/);
    await assert.rejects(db.query(`delete from profiles where id = '${bob}'`), /permission denied/);
    await assert.rejects(db.query(`update generation_ledger set quantity = 999`), /permission denied|append-only/);
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
});

test("account names are backfilled once, validated, and writable only by the server", async () => {
  const backfilled = await db.query<{ full_name: string; preferred_name: string | null }>(`select full_name, preferred_name from profiles where id = $1`, [bob]);
  assert.deepEqual(backfilled.rows[0], { full_name: "Bob Example", preferred_name: null }, "control characters and extra spaces tidied; preferred name left for the user");
  await db.query(`update profiles set preferred_name = 'Dr Bob', onboarding_completed_at = now() where id = $1`, [bob]);
  await assert.rejects(db.query(`update profiles set preferred_name = $2 where id = $1`, [bob, "x".repeat(41)]), /check/);
  await assert.rejects(db.query(`update profiles set full_name = $2 where id = $1`, [bob, "Bob\u0007"]), /check/);
  await assert.rejects(db.query(`update profiles set full_name = '' where id = $1`, [bob]), /check/);

  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${bob}';`);
  try {
    const own = await db.query<{ preferred_name: string }>(`select preferred_name from profiles where id = '${bob}'`);
    assert.equal(own.rows[0].preferred_name, "Dr Bob", "users can read their own names");
    await assert.rejects(db.query(`update profiles set preferred_name = 'Hacked' where id = '${bob}'`), /permission denied/);
    await assert.rejects(db.query(`update profiles set onboarding_completed_at = null where id = '${bob}'`), /permission denied/);
    await assert.rejects(db.query(`update profiles set full_name = 'Someone' where id = '${alice}'`), /permission denied/);
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
});

test("storage accounting is byte-based, private to its owner, exported and deleted with the account", async () => {
  const gina = "00000000-0000-4000-8000-000000000031";
  const hal = "00000000-0000-4000-8000-000000000032";
  await db.query(`insert into auth.users (id, email) values ($1, 'gina2@example.test'), ($2, 'hal@example.test')`, [gina, hal]);
  await db.query(`insert into storage_accounts (user_id, used_bytes, limit_bytes) values ($1, 1800000000, 10000000000), ($2, 5, null)`, [gina, hal]);
  await assert.rejects(db.query(`insert into storage_accounts (user_id, used_bytes) values ($1, -1)`, [bob]), /check/);

  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${gina}';`);
  try {
    const visible = await db.query<{ user_id: string; used_bytes: string }>(`select user_id, used_bytes from storage_accounts`);
    assert.deepEqual(visible.rows.map(r => r.user_id), [gina], "other users' storage is invisible");
    await assert.rejects(db.query(`update storage_accounts set limit_bytes = null where user_id = '${gina}'`), /permission denied/);
    await assert.rejects(db.query(`insert into storage_accounts (user_id) values ('${gina}')`), /permission denied|duplicate/);
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }

  const exported = await db.query<{ data: { storage: { used_bytes: number; limit_bytes: number }; profile: Record<string, unknown> } }>(`select export_account_data($1) as data`, [gina]);
  assert.equal(Number(exported.rows[0].data.storage.used_bytes), 1800000000);
  assert.ok("preferred_name" in exported.rows[0].data.profile && "onboarding_completed_at" in exported.rows[0].data.profile);

  await db.query(`delete from auth.users where id = $1`, [gina]);
  assert.equal((await db.query(`select 1 from storage_accounts where user_id = $1`, [gina])).rows.length, 0);
});

const ivy = "00000000-0000-4000-8000-000000000041";
const jon = "00000000-0000-4000-8000-000000000042";
async function asUser<T>(user: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`);
  try { return await run(); } finally { await db.exec(`reset role; reset request.jwt.claim.sub;`); }
}

test("storage buckets for avatars and the Case Library are private", async () => {
  const { rows } = await db.query<{ id: string; public: boolean }>(`select id, public from storage.buckets order by id`);
  assert.deepEqual(rows, [{ id: "case-library", public: false }, { id: "patient-cases", public: false }, { id: "profile-avatars", public: false }]);
});

test("profile photos: users can upload, read, replace and remove only their own avatar objects", async () => {
  await db.query(`insert into auth.users (id, email) values ($1, 'ivy@example.test'), ($2, 'jon@example.test')`, [ivy, jon]);
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('profile-avatars', $1, $2)`, [`${jon}/jon.jpg`, jon]);
  await asUser(ivy, async () => {
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('profile-avatars', $1, $2)`, [`${ivy}/ivy.jpg`, ivy]);
    await assert.rejects(db.query(`insert into storage.objects (bucket_id, name, owner) values ('profile-avatars', $1, $2)`, [`${jon}/overwrite.jpg`, ivy]), /row-level security/);
    assert.equal((await db.query(`select name from storage.objects where bucket_id = 'profile-avatars'`)).rows.length, 1, "Jon's avatar is invisible to Ivy");
    const replaced = await db.query(`update storage.objects set name = name where bucket_id = 'profile-avatars' and name = $1`, [`${jon}/jon.jpg`]);
    assert.equal(replaced.affectedRows, 0, "cannot overwrite another user's avatar");
    const removed = await db.query(`delete from storage.objects where bucket_id = 'profile-avatars' and name = $1`, [`${jon}/jon.jpg`]);
    assert.equal(removed.affectedRows, 0, "cannot delete another user's avatar");
    assert.equal((await db.query(`delete from storage.objects where name = $1`, [`${ivy}/ivy.jpg`])).affectedRows, 1, "can remove own avatar");
  });
  assert.equal((await db.query(`select 1 from storage.objects where name = $1`, [`${jon}/jon.jpg`])).rows.length, 1);
  // The profile can only point at the owner's own folder.
  await assert.rejects(db.query(`update profiles set avatar_path = $2 where id = $1`, [ivy, `${jon}/jon.jpg`]), /check/);
  await db.query(`update profiles set avatar_path = $2 where id = $1`, [ivy, `${ivy}/0f8e2c7a.jpg`]);
});

test("Case Library: private per user, server-written, and never mixed with another clinician's work", async () => {
  const caseId = "00000000-0000-4000-8000-0000000000c1";
  await db.query(`insert into reference_cases (id, user_id, material, label, teeth_treated) values ($1, $2, 'Porcelain', 'Upper 8', '{13,12,11,21,22,23}')`, [caseId, jon]);
  await db.query(`insert into reference_case_images (reference_case_id, user_id, kind, storage_path, bytes) values ($1, $2, 'reference', $3, 1000)`, [caseId, jon, `${jon}/${caseId}/reference.jpg`]);
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('case-library', $1, $2)`, [`${jon}/${caseId}/reference.jpg`, jon]);
  await assert.rejects(db.query(`insert into reference_case_images (reference_case_id, user_id, kind, storage_path, bytes) values ($1, $2, 'original', $3, 1)`, [caseId, jon, `${ivy}/${caseId}/original.jpg`]), /check/);
  await assert.rejects(db.query(`insert into reference_cases (user_id, material) values ($1, 'Gold foil')`, [jon]), /check/);

  await asUser(ivy, async () => {
    assert.equal((await db.query(`select * from reference_cases`)).rows.length, 0);
    assert.equal((await db.query(`select * from reference_case_images`)).rows.length, 0);
    assert.equal((await db.query(`select * from storage.objects where bucket_id = 'case-library'`)).rows.length, 0);
    await assert.rejects(db.query(`update reference_cases set label = 'mine' where id = '${caseId}'`), /permission denied/);
    await assert.rejects(db.query(`delete from reference_cases where id = '${caseId}'`), /permission denied/);
    await assert.rejects(db.query(`insert into reference_cases (user_id, material) values ('${ivy}', 'Porcelain')`), /permission denied/);
    await assert.rejects(db.query(`insert into storage.objects (bucket_id, name, owner) values ('case-library', '${ivy}/x/original.jpg', '${ivy}')`), /row-level security/, "uploads go through the API");
    assert.equal((await db.query(`delete from storage.objects where name = '${jon}/${caseId}/reference.jpg'`)).affectedRows, 0);
  });
  await asUser(jon, async () => {
    assert.equal((await db.query(`select * from reference_cases`)).rows.length, 1, "the owner can read their own library");
    assert.equal((await db.query(`select * from storage.objects where bucket_id = 'case-library'`)).rows.length, 1);
  });
});

test("generation records only the owner's reference IDs; consent and export cover the Case Library", async () => {
  const jonCase = "00000000-0000-4000-8000-0000000000c1";
  const ivyCase = "00000000-0000-4000-8000-0000000000c2";
  await db.query(`insert into reference_cases (id, user_id, material) values ($1, $2, 'Porcelain')`, [ivyCase, ivy]);
  await period(jon, 5);
  const reservation = uuid();
  await reserve(jon, reservation);
  await db.query(`select commit_generation($1, 'google', 'gemini', 'v1', 'p1', 'Porcelain / Auto', $2)`, [reservation, [jonCase, ivyCase]]);
  const ledger = await db.query<{ reference_case_ids: string[] }>(`select reference_case_ids from generation_ledger where reservation_id = $1 and status = 'committed'`, [reservation]);
  assert.deepEqual(ledger.rows[0].reference_case_ids, [jonCase], "another user's case ID is dropped");

  await db.query(`select record_consent($1, 'case_library_authority', 'case-library-authority-v1', null)`, [jon]);
  await db.query(`select adjust_storage_usage($1, 1000)`, [jon]);
  const exported = await db.query<{ data: { case_library: { id: string; images: unknown[] }[]; storage: { used_bytes: number } } }>(`select export_account_data($1) as data`, [jon]);
  assert.equal(exported.rows[0].data.case_library[0].id, jonCase);
  assert.equal(exported.rows[0].data.case_library[0].images.length, 1);
  assert.equal(Number(exported.rows[0].data.storage.used_bytes), 1000);
  await asUser(ivy, async () => {
    await assert.rejects(db.query(`select adjust_storage_usage('${ivy}', -999999)`), /permission denied/);
  });

  await db.query(`delete from auth.users where id = $1`, [jon]);
  for (const table of ["reference_cases", "reference_case_images", "style_feedback"])
    assert.equal((await db.query(`select 1 from ${table} where user_id = $1`, [jon])).rows.length, 0, table);
});

test("deleting an auth user removes their data", async () => {
  await db.query(`delete from auth.users where id = $1`, [alice]);
  for (const table of ["profiles", "allowance_periods", "generation_reservations", "generation_ledger", "access_overrides", "consent_records"]) {
    const column = table === "profiles" ? "id" : "user_id";
    assert.equal((await db.query(`select 1 from ${table} where ${column} = $1`, [alice])).rows.length, 0, table);
  }
  // The security trail survives, pseudonymised (no user link).
  const orphaned = await db.query(`select 1 from security_audit_log where user_id is null and event_type = 'complimentary_access_granted'`);
  assert.ok(orphaned.rows.length >= 1);
});
