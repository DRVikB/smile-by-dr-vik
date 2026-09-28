-- SmileCompose: account name, preferred name, onboarding completion and
-- generic storage accounting.
--
-- * full_name       the account holder's name (from Apple on first sign-in, or typed)
-- * preferred_name  how SmileCompose addresses the user ("Dr Vik")
-- * onboarding_completed_at  first-run onboarding finished (or skipped for an existing account)
--
-- Names are written only by the server (service role) after validation; the
-- existing client grant on display_name is unchanged. Subscription truth stays
-- with RevenueCat; generation usage stays in the allowance/ledger tables.

alter table public.profiles
  add column full_name text
    check (full_name is null or (char_length(full_name) between 1 and 80 and full_name !~ '[[:cntrl:]]')),
  add column preferred_name text
    check (preferred_name is null or (char_length(preferred_name) between 1 and 40 and preferred_name !~ '[[:cntrl:]]')),
  add column onboarding_completed_at timestamptz;

-- display_name has only ever held the name Apple supplied at first sign-in, so
-- it is the account name. preferred_name is deliberately not backfilled: it is
-- the user's own choice and is asked for once.
update public.profiles
   set full_name = left(btrim(regexp_replace(display_name, '[[:cntrl:][:space:]]+', ' ', 'g')), 80)
 where full_name is null
   and display_name is not null
   and btrim(regexp_replace(display_name, '[[:cntrl:][:space:]]+', ' ', 'g')) <> '';

-- Generic, byte-based storage accounting for account-held files (photos,
-- generated images, video, STL/PLY, face captures, lab exports). V1 keeps all
-- patient media on the clinician's device, so no rows exist yet and the API
-- reports 0 bytes used with no limit. Maintained only by the server.
create table public.storage_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  limit_bytes bigint check (limit_bytes is null or limit_bytes >= 0),
  updated_at timestamptz not null default now()
);

alter table public.storage_accounts enable row level security;
revoke all on public.storage_accounts from anon, authenticated;
grant select on public.storage_accounts to authenticated;
grant all on public.storage_accounts to service_role;
create policy "Read own storage" on public.storage_accounts
  for select to authenticated using ((select auth.uid()) = user_id);

-- Include storage in the account export (the profile row already carries the new columns).
create or replace function public.export_account_data(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'generated_at', now(),
    'user_id', p_user,
    'profile', (select to_jsonb(p) from profiles p where p.id = p_user),
    'storage', (select jsonb_build_object('used_bytes', s.used_bytes, 'limit_bytes', s.limit_bytes, 'updated_at', s.updated_at) from storage_accounts s where s.user_id = p_user),
    'allowance_periods', coalesce((select jsonb_agg(to_jsonb(a) order by a.period_start) from allowance_periods a where a.user_id = p_user), '[]'::jsonb),
    'generation_ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from generation_ledger l where l.user_id = p_user), '[]'::jsonb),
    'consent_records', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from consent_records c where c.user_id = p_user), '[]'::jsonb),
    'security_events', coalesce((select jsonb_agg(jsonb_build_object('event_type', s.event_type, 'actor', s.actor, 'created_at', s.created_at) order by s.id) from security_audit_log s where s.user_id = p_user), '[]'::jsonb),
    'complimentary_access', coalesce((select jsonb_agg(jsonb_build_object('access_level', o.access_level, 'expires_at', o.expires_at, 'revoked_at', o.revoked_at, 'created_at', o.created_at)) from access_overrides o where o.user_id = p_user), '[]'::jsonb),
    'organisations', coalesce((select jsonb_agg(jsonb_build_object('organisation_id', m.organisation_id, 'role', m.role)) from organisation_members m where m.user_id = p_user), '[]'::jsonb)
  );
$$;
revoke execute on function public.export_account_data(uuid) from public, anon, authenticated;
grant execute on function public.export_account_data(uuid) to service_role;
