-- SmileCompose: generation allowance with monthly rollover, annual reset and expiry.
--
-- Rules (the numbers come from src/config/subscriptions.ts through the server, never from a client):
--   Trial    its own allowance (3) for the trial period; never carried over, never added to a paid allowance.
--   Monthly  first paid period: 50. Each successful renewal: min(remaining + 50, 100), while the
--            subscription stays continuously active.
--   Annual   each paid year: 600. Nothing carries into the next year.
--   Expiry   the balance ends. A later subscription starts afresh (50 / 600); nothing is restored.
--   Plan change  the new plan's allowance: monthly → annual = 600, annual → monthly = 50.
--
-- Existing data: every current period keeps its remaining balance (included_allowance - used).
-- This migration grants nothing and resets nothing; the next successful renewal applies the rules.
-- Grants stay idempotent: one per (account, billing period start), whichever path reports it first
-- (the RevenueCat webhook or the server's live RevenueCat check), and RevenueCat event ids are
-- recorded once in revenuecat_events.

-- ---------------------------------------------------------------------------
-- Periods: what kind of allowance, what rolled over, which billing event, why it closed
-- ---------------------------------------------------------------------------
alter table public.allowance_periods
  add column kind text check (kind in ('trial', 'monthly', 'annual', 'override')),
  add column carried_over integer not null default 0 check (carried_over >= 0),
  add column rollover_cap integer check (rollover_cap >= 0),
  add column billing_event_id text,
  add column closed_reason text check (closed_reason in ('renewed', 'plan_changed', 'expired'));

-- Backfill from what each existing period already records. Trial periods were granted the trial
-- allowance (3) for the App Store's 3-day introductory offer.
update public.allowance_periods set kind = case
    when source = 'override' then 'override'
    when included_allowance = 3 and period_end - period_start <= interval '8 days' then 'trial'
    when product_id like '%.annual%' then 'annual'
    else 'monthly'
  end
where kind is null;

-- ---------------------------------------------------------------------------
-- Ledger: new entry types, the balance after each entry, and the billing event
-- (new columns and constraints only; existing rows are never edited)
-- ---------------------------------------------------------------------------
alter table public.generation_ledger drop constraint generation_ledger_event_type_check;
alter table public.generation_ledger add constraint generation_ledger_event_type_check check (event_type in (
  'monthly_generation', 'generation', 'generation_refund', 'credit_purchase', 'admin_adjustment',
  'trial_grant', 'subscription_activation', 'monthly_renewal', 'annual_renewal', 'plan_change',
  'allowance_lapsed', 'subscription_expired'));
alter table public.generation_ledger drop constraint generation_ledger_status_check;
alter table public.generation_ledger add constraint generation_ledger_status_check
  check (status in ('granted', 'reserved', 'committed', 'released', 'adjusted', 'expired'));
alter table public.generation_ledger
  add column balance_after integer,
  add column billing_event_id text;

-- ---------------------------------------------------------------------------
-- Complimentary periods are marked as such (no other change)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_allowance_period(
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
  insert into allowance_periods (user_id, source, environment, product_id, period_start, period_end, included_allowance, kind)
  values (p_user, p_source, p_environment, p_product, p_start, p_end, p_allowance, case when p_source = 'override' then 'override' end)
  on conflict (user_id, source, period_start) do nothing
  returning id into v_id;

  if v_id is null then
    update allowance_periods set period_end = greatest(period_end, p_end)
    where user_id = p_user and source = p_source and period_start = p_start
    returning id into v_id;
    return v_id;
  end if;

  insert into generation_ledger (user_id, period_id, event_type, quantity, source, status, environment, note, balance_after)
  values (p_user, v_id, 'monthly_generation', p_allowance, p_source, 'granted', p_environment,
          coalesce(p_product, p_source) || ' period ' || p_start::text || ' to ' || p_end::text, generation_remaining(p_user));

  perform sync_profile_allowance(p_user);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The subscription allowance for one billing period, granted once
-- ---------------------------------------------------------------------------
create function public.grant_subscription_period(
  p_user uuid,
  p_environment text,
  p_product text,
  p_kind text,            -- 'trial', 'monthly' or 'annual'
  p_start timestamptz,
  p_end timestamptz,
  p_allowance integer,    -- the plan's allowance for a period (3 / 50 / 600)
  p_rollover_cap integer, -- the most a monthly balance may hold (100); ignored for other kinds
  p_event_id text         -- the RevenueCat event that reported this period, when known
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  -- The webhook reports milliseconds and the live check whole seconds: both name the same period.
  v_start timestamptz := date_trunc('second', p_start);
  v_existing allowance_periods%rowtype;
  v_prev allowance_periods%rowtype;
  v_has_prev boolean;
  v_continuous boolean := false;
  v_remaining integer := 0;
  v_carry integer := 0;
  v_included integer;
  v_id uuid;
  v_type text;
begin
  if p_kind not in ('trial', 'monthly', 'annual') then raise exception 'invalid_period_kind'; end if;
  if p_end <= v_start or p_allowance < 0 then raise exception 'invalid_period'; end if;

  -- Grants for one account happen one at a time.
  perform 1 from profiles where id = p_user for update;
  if not found then raise exception 'account_not_found'; end if;

  select * into v_existing from allowance_periods
  where user_id = p_user and source = 'subscription' and period_start = v_start;
  if found then
    -- Already granted (a repeated webhook, or the live check before or after it): never again.
    -- An open period may run later (grace period, extension); a closed one stays closed.
    update allowance_periods set
      period_end = case when closed_reason is null then greatest(period_end, p_end) else period_end end,
      billing_event_id = coalesce(billing_event_id, p_event_id)
    where id = v_existing.id;
    perform sync_profile_allowance(p_user);
    return v_existing.id;
  end if;

  -- The period this one follows.
  select * into v_prev from allowance_periods
  where user_id = p_user and source = 'subscription' and period_start < v_start
  order by period_start desc
  limit 1
  for update;
  v_has_prev := found;

  -- Continuously subscribed: the previous period didn't expire, and it ran up to this one (allowing
  -- the App Store's longest billing grace period between them).
  v_continuous := v_has_prev and v_prev.closed_reason is distinct from 'expired'
    and v_prev.period_end >= v_start - interval '16 days';

  if v_has_prev then
    v_remaining := greatest(v_prev.included_allowance - v_prev.used, 0);
  end if;
  -- Only monthly carries into monthly. Trial credits, annual credits and a lapsed balance don't.
  if p_kind = 'monthly' and v_continuous and v_prev.kind = 'monthly' then
    v_carry := v_remaining;
  end if;
  v_included := case
    when p_kind = 'monthly' then least(v_carry + p_allowance, greatest(p_rollover_cap, p_allowance))
    else p_allowance
  end;
  v_carry := least(v_carry, v_included);

  -- Close the previous period so it stops counting; whatever didn't carry over lapses.
  if v_has_prev and v_prev.closed_reason is null then
    update allowance_periods set
      period_end = least(period_end, v_start),
      closed_reason = case
        when not v_continuous then 'expired'
        when v_prev.kind is distinct from p_kind and v_prev.kind <> 'trial' then 'plan_changed'
        else 'renewed'
      end
    where id = v_prev.id;
    if v_remaining - v_carry > 0 then
      insert into generation_ledger (user_id, period_id, event_type, quantity, source, status, environment, note, billing_event_id, balance_after)
      values (p_user, v_prev.id, 'allowance_lapsed', -(v_remaining - v_carry), 'subscription', 'expired', p_environment,
              coalesce(v_prev.kind, 'subscription') || ' allowance not carried into the ' || p_kind || ' period', p_event_id,
              generation_remaining(p_user));
    end if;
  end if;

  insert into allowance_periods (user_id, source, environment, product_id, period_start, period_end,
    included_allowance, kind, carried_over, rollover_cap, billing_event_id)
  values (p_user, 'subscription', p_environment, p_product, v_start, p_end, v_included, p_kind, v_carry,
    case when p_kind = 'monthly' then greatest(p_rollover_cap, p_allowance) else p_allowance end, p_event_id)
  returning id into v_id;

  v_type := case
    when p_kind = 'trial' then 'trial_grant'
    when not v_continuous or v_prev.kind = 'trial' then 'subscription_activation'
    when v_prev.kind is distinct from p_kind then 'plan_change'
    when p_kind = 'annual' then 'annual_renewal'
    else 'monthly_renewal'
  end;

  insert into generation_ledger (user_id, period_id, event_type, quantity, source, status, environment, note, billing_event_id, balance_after)
  values (p_user, v_id, v_type, v_included - v_carry, 'subscription', 'granted', p_environment,
          left(p_kind || ' ' || coalesce(p_product, '') || ' ' || v_start::text || ' to ' || p_end::text
            || case when v_carry > 0 then ' (' || v_carry || ' carried over)' else '' end, 200),
          p_event_id, generation_remaining(p_user));

  perform sync_profile_allowance(p_user);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expiry: the subscription allowance ends when the entitlement actually expires
-- ---------------------------------------------------------------------------
create function public.expire_subscription(p_user uuid, p_event_id text, p_expired_at timestamptz)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz := least(coalesce(p_expired_at, now()), now());
  v_period allowance_periods%rowtype;
  v_lapsed integer := 0;
  v_closed integer := 0;
begin
  perform 1 from profiles where id = p_user for update;
  if not found then return 0; end if;

  -- Only periods that began before the expiry: a resubscription reported first is left alone.
  for v_period in
    select * from allowance_periods
    where user_id = p_user and source = 'subscription' and closed_reason is null and period_start < v_at
    for update
  loop
    if v_period.period_end > now() then
      v_lapsed := v_lapsed + greatest(v_period.included_allowance - v_period.used, 0);
    end if;
    update allowance_periods set closed_reason = 'expired', period_end = least(period_end, v_at)
    where id = v_period.id;
    v_closed := v_closed + 1;
  end loop;

  if v_closed > 0 then
    insert into generation_ledger (user_id, event_type, quantity, source, status, note, billing_event_id, balance_after)
    values (p_user, 'subscription_expired', -v_lapsed, 'subscription', 'expired', 'subscription expired', p_event_id,
            generation_remaining(p_user));
    perform sync_profile_allowance(p_user);
  end if;
  return v_lapsed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generation reservations record the balance after each change
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
  -- The profile row lock serialises requests for one account: two simultaneous requests can never
  -- both take the last generation.
  perform 1 from profiles where id = p_user for update;
  if not found then
    raise exception 'account_not_found';
  end if;

  if exists (select 1 from generation_reservations where id = p_reservation) then
    raise exception 'duplicate_request';
  end if;

  -- At most 6 generation attempts per minute per account (a "three options" batch is 3).
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

  insert into generation_ledger (user_id, case_id, reservation_id, period_id, event_type, quantity, source, status, balance_after)
  values (p_user, p_case, p_reservation, v_period_id, 'generation', -1, v_source, 'reserved', generation_remaining(p_user));

  perform sync_profile_allowance(p_user);

  return query select p_reservation, generation_remaining(p_user);
end;
$$;

-- A failed generation returns its reservation. If the period renewed while it was running, the
-- generation goes back to the account's current period rather than the closed one.
create or replace function public.release_generation(p_reservation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_res generation_reservations%rowtype;
  v_period allowance_periods%rowtype;
begin
  update generation_reservations set status = 'released'
  where id = p_reservation and status = 'reserved'
  returning * into v_res;
  if not found then
    return; -- idempotent
  end if;
  if v_res.funding = 'period' and v_res.period_id is not null then
    select * into v_period from allowance_periods where id = v_res.period_id for update;
    if found and v_period.period_end > now() then
      update allowance_periods set used = greatest(used - 1, 0) where id = v_period.id;
    elsif found then
      -- The renewal counted this generation as used when it carried the balance over: give it back
      -- (a monthly balance never beyond its rollover cap).
      update allowance_periods set
        used = greatest(used - 1, 0),
        included_allowance = case when used > 0 then included_allowance
                                  else least(included_allowance + 1, coalesce(rollover_cap, included_allowance)) end
      where id = (
        select id from allowance_periods
        where user_id = v_res.user_id and source = v_period.source and now() >= period_start and now() < period_end
        order by period_start desc
        limit 1
      );
    end if;
  elsif v_res.funding = 'purchased' then
    update profiles set purchased_generation_balance = purchased_generation_balance + 1 where id = v_res.user_id;
  end if;
  insert into generation_ledger (user_id, case_id, reservation_id, period_id, event_type, quantity, source, status, note, failure_code, balance_after)
  values (v_res.user_id, v_res.case_id, v_res.id, v_res.period_id, 'generation_refund', 1, v_res.funding, 'released',
    left(p_reason, 200), left(p_reason, 64), generation_remaining(v_res.user_id));
  perform sync_profile_allowance(v_res.user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Balance summary: adds the current subscription period's detail
-- ---------------------------------------------------------------------------
drop function public.generation_balance(uuid);
create function public.generation_balance(p_user uuid)
returns table (
  included integer, used integer, remaining integer, purchased integer, period_end timestamptz,
  plan_kind text, period_start timestamptz, subscription_remaining integer, carried_over integer,
  last_event_id text, last_granted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with live as (
    select * from allowance_periods where user_id = p_user and now() >= period_start and now() < period_end
  ), sub as (
    select * from live where source = 'subscription' order by period_start desc limit 1
  )
  select
    coalesce((select sum(included_allowance) from live), 0)::integer,
    coalesce((select sum(used) from live), 0)::integer,
    generation_remaining(p_user),
    coalesce((select purchased_generation_balance from profiles where id = p_user), 0),
    (select max(period_end) from live),
    (select kind from sub),
    (select period_start from sub),
    (select included_allowance - used from sub),
    (select carried_over from sub),
    (select billing_event_id from sub),
    (select created_at from sub);
$$;

-- ---------------------------------------------------------------------------
-- RevenueCat webhook application
-- ---------------------------------------------------------------------------
-- RevenueCat event types (https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields):
--   INITIAL_PURCHASE   trial started, or first paid purchase                → grant (trial / plan allowance)
--   RENEWAL            successful renewal, trial conversion, recovery after
--                      a billing issue, or a plan change taking effect      → grant (renewal / conversion / plan change)
--   PRODUCT_CHANGE     a plan change was requested (effective later)         → status only
--   CANCELLATION       auto-renew turned off; access continues to period end → status only
--   UNCANCELLATION     auto-renew turned back on                             → status only
--   BILLING_ISSUE      a renewal payment failed (grace period may apply)     → status only; never a grant
--   SUBSCRIPTION_EXTENDED  the current period was extended                   → the open period runs later
--   EXPIRATION         the entitlement has actually expired                  → allowance ends
drop function public.apply_revenuecat_event(text, text, uuid, text, text, timestamptz, timestamptz, integer);
create function public.apply_revenuecat_event(
  p_event_id text,
  p_type text,
  p_user uuid,
  p_environment text,
  p_product text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance integer,
  p_kind text default null,
  p_rollover_cap integer default null
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
    -- A new allowance only for a confirmed purchase or successful renewal of a current period.
    if p_type in ('INITIAL_PURCHASE', 'RENEWAL') and p_period_start is not null and p_period_end is not null and p_period_end > now() then
      perform grant_subscription_period(p_user, p_environment, p_product, coalesce(p_kind, 'monthly'),
        p_period_start, p_period_end, p_allowance, coalesce(p_rollover_cap, p_allowance), p_event_id);
    elsif p_type = 'SUBSCRIPTION_EXTENDED' and p_period_end is not null then
      update allowance_periods set period_end = greatest(period_end, p_period_end)
      where user_id = p_user and source = 'subscription' and closed_reason is null and period_end > now();
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
    perform expire_subscription(p_user, p_event_id, p_period_end);
  else
    v_outcome := 'ignored_type';
  end if;

  update revenuecat_events set outcome = v_outcome where id = p_event_id;
  return v_outcome;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: backend only
-- ---------------------------------------------------------------------------
revoke execute on function
  public.grant_subscription_period(uuid, text, text, text, timestamptz, timestamptz, integer, integer, text),
  public.expire_subscription(uuid, text, timestamptz),
  public.generation_balance(uuid),
  public.apply_revenuecat_event(text, text, uuid, text, text, timestamptz, timestamptz, integer, text, integer)
from public, anon, authenticated;

grant execute on function
  public.grant_subscription_period(uuid, text, text, text, timestamptz, timestamptz, integer, integer, text),
  public.expire_subscription(uuid, text, timestamptz),
  public.generation_balance(uuid),
  public.apply_revenuecat_event(text, text, uuid, text, text, timestamptz, timestamptz, integer, text, integer)
to service_role;
