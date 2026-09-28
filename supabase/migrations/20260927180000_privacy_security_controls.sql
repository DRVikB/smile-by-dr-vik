-- SmileCompose: privacy, accountability and security controls.
--
--   * consent_records        — versioned Terms/Privacy acceptance, clinician upload
--                               authority and AI-processing confirmations (no patient data)
--   * security_audit_log     — append-only security/account events (no patient content)
--   * incident_register      — breach/incident log, service role only
--   * organisations/members  — future practice accounts; ownership stays per user for V1
--   * generation audit       — prompt version, treatment type, failure code on the ledger
--   * rate limiting          — per-user generation throttle inside the reservation lock
--   * DSAR helpers           — locate and export a user's or a case's server-side records
--
-- Patient photographs, patient references and clinical notes are never stored
-- server-side in V1; none of these tables may hold them.

-- ---------------------------------------------------------------------------
-- Shared append-only guard
-- ---------------------------------------------------------------------------
create function public.reject_update() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organisations (prepared, not used by V1 screens)
-- ---------------------------------------------------------------------------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);
create index organisation_members_user_idx on public.organisation_members (user_id);

-- ---------------------------------------------------------------------------
-- Consent and document-version records
-- ---------------------------------------------------------------------------
create table public.consent_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  record_type text not null
    check (record_type in ('terms', 'privacy', 'upload_authority', 'ai_processing', 'customer_dpa')),
  document_version text not null check (char_length(document_version) between 1 and 64),
  -- Random case identifier only; never a patient name or reference.
  case_id text check (case_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  created_at timestamptz not null default now()
);
-- Unchanged documents are accepted once; per-case confirmations once per case.
create unique index consent_records_once
  on public.consent_records (user_id, record_type, document_version, coalesce(case_id, ''));
create trigger consent_records_append_only before update on public.consent_records
  for each row execute function public.reject_update();

-- ---------------------------------------------------------------------------
-- Security audit log
-- ---------------------------------------------------------------------------
create table public.security_audit_log (
  id bigint generated always as identity primary key,
  -- Set to null when the account is deleted, keeping a pseudonymous trail.
  user_id uuid references auth.users (id) on delete set null,
  actor text not null check (actor in ('user', 'admin', 'system', 'webhook')),
  event_type text not null check (char_length(event_type) between 3 and 64),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_audit_log_user_idx on public.security_audit_log (user_id, created_at desc);
-- Append-only, except the account-deletion cascade that removes the user link
-- (pseudonymisation). Any other change is rejected.
create function public.guard_security_audit_log() returns trigger
language plpgsql as $$
begin
  if old.user_id is not null and new.user_id is null
     and new.id = old.id and new.actor = old.actor and new.event_type = old.event_type
     and new.metadata = old.metadata and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'security_audit_log is append-only';
end;
$$;
create trigger security_audit_log_append_only before update on public.security_audit_log
  for each row execute function public.guard_security_audit_log();

create function public.record_security_event(p_user uuid, p_actor text, p_event text, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into security_audit_log (user_id, actor, event_type, metadata)
  values (p_user, p_actor, p_event, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Complimentary access changes are always audited, whoever makes them.
create function public.audit_access_override() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform record_security_event(new.user_id, 'admin',
    case when tg_op = 'INSERT' then 'complimentary_access_granted'
         when new.revoked_at is not null and old.revoked_at is null then 'complimentary_access_revoked'
         else 'complimentary_access_changed' end,
    jsonb_build_object('override_id', new.id, 'access_level', new.access_level, 'expires_at', new.expires_at,
      'monthly_generation_allowance', new.monthly_generation_allowance, 'created_by', new.created_by,
      'db_user', current_user, 'reason', left(new.reason, 200)));
  return new;
end;
$$;
create trigger access_overrides_audit after insert or update on public.access_overrides
  for each row execute function public.audit_access_override();

-- Password, email and sign-in method changes (values are never copied).
create function public.audit_auth_user_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    perform record_security_event(new.id, 'user', 'password_changed', '{}'::jsonb);
  end if;
  if new.email is distinct from old.email then
    perform record_security_event(new.id, 'user', 'email_changed', '{}'::jsonb);
  end if;
  return new;
end;
$$;
create trigger on_auth_user_security_change after update of encrypted_password, email on auth.users
  for each row execute function public.audit_auth_user_change();

create function public.audit_identity_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform record_security_event(new.user_id, 'user', 'sign_in_method_linked', jsonb_build_object('provider', new.provider));
    return new;
  end if;
  perform record_security_event(old.user_id, 'user', 'sign_in_method_unlinked', jsonb_build_object('provider', old.provider));
  return old;
end;
$$;
create trigger on_auth_identity_change after insert or delete on auth.identities
  for each row execute function public.audit_identity_change();

-- ---------------------------------------------------------------------------
-- Incident / breach register (service role only; never exposed to the app)
-- ---------------------------------------------------------------------------
create table public.incident_register (
  incident_id bigint generated always as identity primary key,
  date_detected timestamptz not null,
  date_awareness_established timestamptz,
  summary text not null,
  data_involved text,
  number_affected integer check (number_affected >= 0),
  risk_assessment text,
  containment text,
  ico_notification_required boolean,
  ico_notified_at timestamptz,
  individual_notification_required boolean,
  individuals_notified_at timestamptz,
  customers_notified_at timestamptz,
  actions text,
  status text not null default 'open' check (status in ('open', 'contained', 'closed')),
  closed_at timestamptz,
  recorded_by text not null default current_user,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Generation audit fields (ledger stays append-only; new rows only)
-- ---------------------------------------------------------------------------
alter table public.generation_ledger
  add column prompt_version text,
  add column treatment_type text check (char_length(treatment_type) <= 80),
  add column failure_code text check (char_length(failure_code) <= 64);

drop function public.commit_generation(uuid, text, text, text);
create function public.commit_generation(
  p_reservation uuid, p_provider text, p_model text, p_provider_request_id text,
  p_prompt_version text default null, p_treatment_type text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_res generation_reservations%rowtype;
begin
  update generation_reservations set status = 'committed'
  where id = p_reservation and status = 'reserved'
  returning * into v_res;
  if not found then
    return;
  end if;
  insert into generation_ledger (user_id, case_id, reservation_id, period_id, event_type, quantity, source,
    provider, model, status, provider_request_id, prompt_version, treatment_type)
  values (v_res.user_id, v_res.case_id, v_res.id, v_res.period_id, 'generation', 0, v_res.funding,
    p_provider, p_model, 'committed', p_provider_request_id, p_prompt_version, left(p_treatment_type, 80));
end;
$$;

create or replace function public.release_generation(p_reservation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_res generation_reservations%rowtype;
begin
  update generation_reservations set status = 'released'
  where id = p_reservation and status = 'reserved'
  returning * into v_res;
  if not found then
    return;
  end if;
  if v_res.funding = 'period' and v_res.period_id is not null then
    update allowance_periods set used = greatest(used - 1, 0) where id = v_res.period_id;
  elsif v_res.funding = 'purchased' then
    update profiles set purchased_generation_balance = purchased_generation_balance + 1 where id = v_res.user_id;
  end if;
  insert into generation_ledger (user_id, case_id, reservation_id, period_id, event_type, quantity, source, status, note, failure_code)
  values (v_res.user_id, v_res.case_id, v_res.id, v_res.period_id, 'generation_refund', 1, v_res.funding, 'released',
    left(p_reason, 200), left(p_reason, 64));
  perform sync_profile_allowance(v_res.user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-user rate limit, enforced inside the same lock as the allowance
-- ---------------------------------------------------------------------------
create or replace function public.reserve_generation(p_user uuid, p_reservation uuid, p_case text)
returns table (reservation_id uuid, remaining integer)
language plpgsql security definer set search_path = public as $$
declare
  v_period allowance_periods%rowtype;
  v_purchased integer;
  v_funding text;
  v_period_id uuid;
  v_source text;
begin
  perform 1 from profiles where id = p_user for update;
  if not found then
    raise exception 'account_not_found';
  end if;

  if exists (select 1 from generation_reservations where id = p_reservation) then
    raise exception 'duplicate_request';
  end if;

  -- At most 6 generation attempts per minute per account (a "three options"
  -- batch is 3), limiting credit abuse from a compromised session.
  if (select count(*) from generation_reservations
      where user_id = p_user and created_at > now() - interval '60 seconds') >= 6 then
    raise exception 'rate_limited';
  end if;

  perform release_stale_reservations(p_user, interval '15 minutes');

  select * into v_period from allowance_periods
  where user_id = p_user and now() >= period_start and now() < period_end and used < included_allowance
  order by (source = 'subscription') desc, period_end asc
  limit 1
  for update;

  if found then
    update allowance_periods set used = used + 1 where id = v_period.id;
    v_funding := 'period';
    v_period_id := v_period.id;
    v_source := v_period.source;
  else
    select purchased_generation_balance into v_purchased from profiles where id = p_user;
    if coalesce(v_purchased, 0) > 0 then
      update profiles set purchased_generation_balance = purchased_generation_balance - 1 where id = p_user;
      v_funding := 'purchased';
      v_source := 'purchased';
    elsif exists (select 1 from allowance_periods where user_id = p_user and now() >= period_start and now() < period_end) then
      raise exception 'allowance_exhausted';
    else
      raise exception 'no_active_allowance';
    end if;
  end if;

  insert into generation_reservations (id, user_id, case_id, period_id, funding)
  values (p_reservation, p_user, p_case, v_period_id, v_funding);

  insert into generation_ledger (user_id, case_id, reservation_id, period_id, event_type, quantity, source, status)
  values (p_user, p_case, p_reservation, v_period_id, 'generation', -1, v_source, 'reserved');

  perform sync_profile_allowance(p_user);

  return query select p_reservation, generation_remaining(p_user);
end;
$$;

-- Administrator credit adjustments are audited.
create or replace function public.admin_adjust_generations(p_user uuid, p_quantity integer, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_quantity = 0 then return; end if;
  update profiles
    set purchased_generation_balance = greatest(purchased_generation_balance + p_quantity, 0)
  where id = p_user;
  if not found then raise exception 'account_not_found'; end if;
  insert into generation_ledger (user_id, event_type, quantity, source, status, note)
  values (p_user, 'admin_adjustment', p_quantity, 'admin', 'adjusted', left(p_note, 200));
  perform record_security_event(p_user, 'admin', 'generation_credit_adjusted',
    jsonb_build_object('quantity', p_quantity, 'db_user', current_user, 'note', left(p_note, 200)));
end;
$$;

-- Subscription changes from RevenueCat are audited (event type, environment, product only).
create function public.audit_revenuecat_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if new.app_user_id ~* '^[0-9a-f-]{36}$' then
    select id into v_user from profiles where id = new.app_user_id::uuid;
  end if;
  if v_user is not null then
    perform record_security_event(v_user, 'webhook', 'subscription_event',
      jsonb_build_object('type', new.type, 'environment', new.environment, 'event_id', new.id));
  end if;
  return new;
end;
$$;
create trigger revenuecat_events_audit after insert on public.revenuecat_events
  for each row execute function public.audit_revenuecat_event();

-- ---------------------------------------------------------------------------
-- Consent recording and data-subject-request helpers (backend only)
-- ---------------------------------------------------------------------------
create function public.record_consent(p_user uuid, p_type text, p_version text, p_case text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into consent_records (user_id, record_type, document_version, case_id)
  values (p_user, p_type, p_version, p_case)
  on conflict do nothing;
end;
$$;

-- Everything SmileCompose holds server-side about one account (for export and access requests).
create function public.export_account_data(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'generated_at', now(),
    'user_id', p_user,
    'profile', (select to_jsonb(p) from profiles p where p.id = p_user),
    'allowance_periods', coalesce((select jsonb_agg(to_jsonb(a) order by a.period_start) from allowance_periods a where a.user_id = p_user), '[]'::jsonb),
    'generation_ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from generation_ledger l where l.user_id = p_user), '[]'::jsonb),
    'consent_records', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from consent_records c where c.user_id = p_user), '[]'::jsonb),
    'security_events', coalesce((select jsonb_agg(jsonb_build_object('event_type', s.event_type, 'actor', s.actor, 'created_at', s.created_at) order by s.id) from security_audit_log s where s.user_id = p_user), '[]'::jsonb),
    'complimentary_access', coalesce((select jsonb_agg(jsonb_build_object('access_level', o.access_level, 'expires_at', o.expires_at, 'revoked_at', o.revoked_at, 'created_at', o.created_at)) from access_overrides o where o.user_id = p_user), '[]'::jsonb),
    'organisations', coalesce((select jsonb_agg(jsonb_build_object('organisation_id', m.organisation_id, 'role', m.role)) from organisation_members m where m.user_id = p_user), '[]'::jsonb)
  );
$$;

-- Server-side records linked to one case ID (to help a practice answer a patient request).
create function public.locate_case_records(p_user uuid, p_case text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'case_id', p_case,
    'generation_ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from generation_ledger l where l.user_id = p_user and l.case_id = p_case), '[]'::jsonb),
    'consent_records', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from consent_records c where c.user_id = p_user and c.case_id = p_case), '[]'::jsonb),
    'note', 'SmileCompose stores no patient photographs, references or notes server-side in V1; those exist only on the clinician''s device.'
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.consent_records enable row level security;
alter table public.security_audit_log enable row level security;
alter table public.incident_register enable row level security;

revoke all on public.organisations, public.organisation_members, public.consent_records,
  public.security_audit_log, public.incident_register from anon, authenticated;

grant select on public.organisations, public.organisation_members, public.consent_records,
  public.security_audit_log to authenticated;

create policy "Members read their organisations" on public.organisations
  for select to authenticated using (exists (
    select 1 from public.organisation_members m where m.organisation_id = id and m.user_id = (select auth.uid())));
create policy "Members read their memberships" on public.organisation_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own consent records" on public.consent_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own security events" on public.security_audit_log
  for select to authenticated using (user_id = (select auth.uid()));
-- incident_register: no client policies (service role / dashboard only).

revoke execute on function
  public.record_security_event(uuid, text, text, jsonb),
  public.commit_generation(uuid, text, text, text, text, text),
  public.record_consent(uuid, text, text, text),
  public.export_account_data(uuid),
  public.locate_case_records(uuid, text),
  public.audit_access_override(),
  public.audit_auth_user_change(),
  public.audit_identity_change(),
  public.audit_revenuecat_event()
from public, anon, authenticated;

grant execute on function
  public.record_security_event(uuid, text, text, jsonb),
  public.commit_generation(uuid, text, text, text, text, text),
  public.record_consent(uuid, text, text, text),
  public.export_account_data(uuid),
  public.locate_case_records(uuid, text)
to service_role;
