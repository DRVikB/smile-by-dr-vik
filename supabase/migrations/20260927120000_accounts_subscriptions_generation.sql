-- SmileCompose: accounts, subscription cache, complimentary access and
-- server-controlled generation accounting.
--
-- Principles
--   * auth.users(id) is the only account identifier (also the RevenueCat App User ID).
--   * Clients can read their own rows; every write goes through SECURITY DEFINER
--     functions callable only by the backend (service_role).
--   * generation_ledger is append-only: an audit trail, never edited.
--   * Allowances belong to real billing periods and are granted once per period.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cache of the latest RevenueCat state. Access decisions ask RevenueCat first.
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro')),
  subscription_status text not null default 'none'
    check (subscription_status in ('none', 'active', 'cancelled', 'billing_issue', 'expired')),
  subscription_product_id text,
  subscription_environment text check (subscription_environment in ('production', 'sandbox')),
  subscription_expires_at timestamptz,
  -- Mirror of the current allowance period, for display.
  generation_allowance integer not null default 0 check (generation_allowance >= 0),
  generation_used integer not null default 0 check (generation_used >= 0),
  purchased_generation_balance integer not null default 0 check (purchased_generation_balance >= 0),
  storage_limit_bytes bigint not null default 0 check (storage_limit_bytes >= 0),
  storage_used_bytes bigint not null default 0 check (storage_used_bytes >= 0)
);

-- Server-controlled complimentary access (owner, QA, support). Never client-writable.
create table public.access_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  access_level text not null default 'pro' check (access_level in ('pro')),
  monthly_generation_allowance integer not null default 50 check (monthly_generation_allowance >= 0),
  expires_at timestamptz,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  created_by text not null default current_user,
  revoked_at timestamptz
);
create index access_overrides_user_idx on public.access_overrides (user_id);

create table public.allowance_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('subscription', 'override')),
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  product_id text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  included_allowance integer not null check (included_allowance >= 0),
  used integer not null default 0 check (used >= 0),
  created_at timestamptz not null default now(),
  check (period_end > period_start),
  check (used <= included_allowance),
  -- One grant per billing period, however many webhooks or checks report it.
  unique (user_id, source, period_start)
);
create index allowance_periods_current_idx on public.allowance_periods (user_id, period_end);

create table public.generation_reservations (
  id uuid primary key, -- the client's X-Smile-Request-Id
  user_id uuid not null references auth.users (id) on delete cascade,
  case_id text check (char_length(case_id) <= 100),
  period_id uuid references public.allowance_periods (id) on delete set null,
  funding text not null check (funding in ('period', 'purchased')),
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index generation_reservations_open_idx on public.generation_reservations (user_id, status, created_at);

create table public.generation_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  case_id text,
  reservation_id uuid,
  period_id uuid,
  event_type text not null
    check (event_type in ('monthly_generation', 'generation', 'generation_refund', 'credit_purchase', 'admin_adjustment')),
  quantity integer not null,
  source text not null,
  provider text,
  model text,
  status text not null check (status in ('granted', 'reserved', 'committed', 'released', 'adjusted')),
  provider_request_id text,
  environment text,
  note text,
  created_at timestamptz not null default now()
);
create index generation_ledger_user_idx on public.generation_ledger (user_id, created_at desc);

-- Idempotency record for RevenueCat webhooks. Processing and this insert share
-- one transaction, so a failed delivery is retried and a duplicate is a no-op.
create table public.revenuecat_events (
  id text primary key,
  type text not null,
  app_user_id text,
  environment text,
  outcome text not null,
  received_at timestamptz not null default now()
);

-- Minimal, pseudonymous record that an account was deleted (no email, no id).
create table public.account_deletions (
  id bigint generated always as identity primary key,
  user_hash text not null,
  deleted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Append-only ledger and housekeeping triggers
-- ---------------------------------------------------------------------------

create function public.reject_ledger_update() returns trigger
language plpgsql as $$
begin
  raise exception 'generation_ledger is append-only';
end;
$$;
create trigger generation_ledger_append_only
  before update on public.generation_ledger
  for each row execute function public.reject_ledger_update();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger generation_reservations_touch before update on public.generation_reservations
  for each row execute function public.touch_updated_at();

-- A profile row for every new account; email kept in sync (display only).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Allowance functions (backend only)
-- ---------------------------------------------------------------------------

-- Establish a billing period's allowance exactly once. Returns the period id.
create function public.ensure_allowance_period(
  p_user uuid,
  p_source text,
  p_environment text,
  p_product text,
  p_start timestamptz,
  p_end timestamptz,
  p_allowance integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into allowance_periods (user_id, source, environment, product_id, period_start, period_end, included_allowance)
  values (p_user, p_source, p_environment, p_product, p_start, p_end, p_allowance)
  on conflict (user_id, source, period_start) do nothing
  returning id into v_id;

  if v_id is null then
    -- Already granted. A renewal can extend the end (e.g. billing retry) but never re-grants.
    update allowance_periods set period_end = greatest(period_end, p_end)
    where user_id = p_user and source = p_source and period_start = p_start
    returning id into v_id;
    return v_id;
  end if;

  insert into generation_ledger (user_id, period_id, event_type, quantity, source, status, environment, note)
  values (p_user, v_id, 'monthly_generation', p_allowance, p_source, 'granted', p_environment,
          coalesce(p_product, p_source) || ' period ' || p_start::text || ' to ' || p_end::text);

  perform sync_profile_allowance(p_user);
  return v_id;
end;
$$;

-- Keep the profile's display mirror in step with the current period.
create function public.sync_profile_allowance(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_included integer := 0;
  v_used integer := 0;
begin
  select coalesce(sum(included_allowance), 0), coalesce(sum(used), 0)
    into v_included, v_used
  from allowance_periods
  where user_id = p_user and now() >= period_start and now() < period_end;
  update profiles set generation_allowance = v_included, generation_used = v_used where id = p_user;
end;
$$;

-- Reserve one generation before calling the AI provider. The profile row lock
-- serialises concurrent requests for the same user, so two simultaneous
-- requests can never both take the last remaining generation.
create function public.reserve_generation(p_user uuid, p_reservation uuid, p_case text)
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

  -- Reservations abandoned by a crashed request return to the allowance.
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

-- Mark a reservation as used after the provider returned a result.
create function public.commit_generation(
  p_reservation uuid, p_provider text, p_model text, p_provider_request_id text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_res generation_reservations%rowtype;
begin
  update generation_reservations set status = 'committed'
  where id = p_reservation and status = 'reserved'
  returning * into v_res;
  if not found then
    return; -- already committed or released: idempotent
  end if;
  insert into generation_ledger (user_id, case_id, reservation_id, period_id, event_type, quantity, source, provider, model, status, provider_request_id)
  values (v_res.user_id, v_res.case_id, v_res.id, v_res.period_id, 'generation', 0, v_res.funding, p_provider, p_model, 'committed', p_provider_request_id);
end;
$$;

-- Return a reserved generation after a failure before completion.
create function public.release_generation(p_reservation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_res generation_reservations%rowtype;
begin
  update generation_reservations set status = 'released'
  where id = p_reservation and status = 'reserved'
  returning * into v_res;
  if not found then
    return; -- idempotent
  end if;
  if v_res.funding = 'period' and v_res.period_id is not null then
    update allowance_periods set used = greatest(used - 1, 0) where id = v_res.period_id;
  elsif v_res.funding = 'purchased' then
    update profiles set purchased_generation_balance = purchased_generation_balance + 1 where id = v_res.user_id;
  end if;
  insert into generation_ledger (user_id, case_id, reservation_id, period_id, event_type, quantity, source, status, note)
  values (v_res.user_id, v_res.case_id, v_res.id, v_res.period_id, 'generation_refund', 1, v_res.funding, 'released', left(p_reason, 200));
  perform sync_profile_allowance(v_res.user_id);
end;
$$;

create function public.release_stale_reservations(p_user uuid, p_older_than interval) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from generation_reservations
    where user_id = p_user and status = 'reserved' and created_at < now() - p_older_than
  loop
    perform release_generation(v_id, 'stale reservation released automatically');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.generation_remaining(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((
    select sum(included_allowance - used) from allowance_periods
    where user_id = p_user and now() >= period_start and now() < period_end
  ), 0)::integer
  + coalesce((select purchased_generation_balance from profiles where id = p_user), 0);
$$;

-- Balance summary for the account screen.
create function public.generation_balance(p_user uuid)
returns table (included integer, used integer, remaining integer, purchased integer, period_end timestamptz)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(p.included_allowance), 0)::integer,
    coalesce(sum(p.used), 0)::integer,
    generation_remaining(p_user),
    coalesce((select purchased_generation_balance from profiles where id = p_user), 0),
    max(p.period_end)
  from allowance_periods p
  where p.user_id = p_user and now() >= p.period_start and now() < p.period_end;
$$;

-- Credits or corrections by an administrator, always written to the ledger.
create function public.admin_adjust_generations(p_user uuid, p_quantity integer, p_note text)
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
end;
$$;

-- ---------------------------------------------------------------------------
-- RevenueCat webhook application (backend only)
-- ---------------------------------------------------------------------------

create function public.apply_revenuecat_event(
  p_event_id text,
  p_type text,
  p_user uuid,
  p_environment text,
  p_product text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance integer
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_outcome text := 'applied';
begin
  begin
    insert into revenuecat_events (id, type, app_user_id, environment, outcome)
    values (p_event_id, p_type, p_user::text, p_environment, 'processing');
  exception when unique_violation then
    return 'duplicate';
  end;

  if p_user is null or not exists (select 1 from profiles where id = p_user) then
    v_outcome := 'ignored_unknown_user';
  elsif p_type in ('INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED') then
    if p_period_start is not null and p_period_end is not null and p_period_end > now()
       and p_type in ('INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION') then
      perform ensure_allowance_period(p_user, 'subscription', p_environment, p_product, p_period_start, p_period_end, p_allowance);
    end if;
    update profiles set
      subscription_tier = case when p_period_end > now() then 'pro' else subscription_tier end,
      subscription_status = case when p_period_end > now() then 'active' else subscription_status end,
      subscription_product_id = coalesce(p_product, subscription_product_id),
      subscription_environment = p_environment,
      subscription_expires_at = coalesce(p_period_end, subscription_expires_at)
    where id = p_user;
  elsif p_type = 'CANCELLATION' then
    update profiles set subscription_status = 'cancelled' where id = p_user and subscription_status <> 'expired';
  elsif p_type = 'BILLING_ISSUE' then
    update profiles set subscription_status = 'billing_issue' where id = p_user;
  elsif p_type = 'EXPIRATION' then
    update profiles set subscription_tier = 'free', subscription_status = 'expired' where id = p_user;
  else
    v_outcome := 'ignored_type';
  end if;

  update revenuecat_events set outcome = v_outcome where id = p_event_id;
  return v_outcome;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.access_overrides enable row level security;
alter table public.allowance_periods enable row level security;
alter table public.generation_reservations enable row level security;
alter table public.generation_ledger enable row level security;
alter table public.revenuecat_events enable row level security;
alter table public.account_deletions enable row level security;

-- Clients read only; the backend writes through the functions above.
revoke all on public.profiles, public.access_overrides, public.allowance_periods,
  public.generation_reservations, public.generation_ledger, public.revenuecat_events,
  public.account_deletions from anon, authenticated;

grant select on public.profiles, public.allowance_periods, public.generation_ledger,
  public.generation_reservations to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Update own display name" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Read own allowance periods" on public.allowance_periods
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own ledger" on public.generation_ledger
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own reservations" on public.generation_reservations
  for select to authenticated using ((select auth.uid()) = user_id);
-- access_overrides, revenuecat_events and account_deletions: no client policies at all.

-- Functions are backend-only.
revoke execute on function
  public.ensure_allowance_period(uuid, text, text, text, timestamptz, timestamptz, integer),
  public.sync_profile_allowance(uuid),
  public.reserve_generation(uuid, uuid, text),
  public.commit_generation(uuid, text, text, text),
  public.release_generation(uuid, text),
  public.release_stale_reservations(uuid, interval),
  public.generation_remaining(uuid),
  public.generation_balance(uuid),
  public.admin_adjust_generations(uuid, integer, text),
  public.apply_revenuecat_event(text, text, uuid, text, text, timestamptz, timestamptz, integer),
  public.handle_new_user(),
  public.handle_user_email_change()
from public, anon, authenticated;

grant execute on function
  public.ensure_allowance_period(uuid, text, text, text, timestamptz, timestamptz, integer),
  public.reserve_generation(uuid, uuid, text),
  public.commit_generation(uuid, text, text, text),
  public.release_generation(uuid, text),
  public.generation_balance(uuid),
  public.admin_adjust_generations(uuid, integer, text),
  public.apply_revenuecat_event(text, text, uuid, text, text, timestamptz, timestamptz, integer)
to service_role;
