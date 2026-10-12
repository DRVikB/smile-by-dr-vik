-- A complimentary-access override that grants more than the one already in force this month now
-- takes effect straight away.
--
-- Before: the month's override period was created once with its allowance and never changed, so a
-- tester who redeemed an access code (or was given a larger allowance by an administrator) after
-- already holding a smaller one that month kept the smaller figure until the next month.
-- Now: when the override in force is larger than the period's allowance, the period is raised to it
-- and the difference is entered in the ledger. It is never lowered here, and generations already
-- used stay counted. Subscription periods are unchanged.
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
  v_previous integer;
begin
  insert into allowance_periods (user_id, source, environment, product_id, period_start, period_end, included_allowance, kind)
  values (p_user, p_source, p_environment, p_product, p_start, p_end, p_allowance, case when p_source = 'override' then 'override' end)
  on conflict (user_id, source, period_start) do nothing
  returning id into v_id;

  if v_id is null then
    select id, included_allowance into v_id, v_previous from allowance_periods
    where user_id = p_user and source = p_source and period_start = p_start
    for update;
    update allowance_periods set period_end = greatest(period_end, p_end) where id = v_id;
    if p_source = 'override' and p_allowance > v_previous then
      update allowance_periods set included_allowance = p_allowance where id = v_id;
      insert into generation_ledger (user_id, period_id, event_type, quantity, source, status, environment, note, balance_after)
      values (p_user, v_id, 'monthly_generation', p_allowance - v_previous, p_source, 'granted', p_environment,
              'override allowance raised from ' || v_previous || ' to ' || p_allowance, generation_remaining(p_user));
      perform sync_profile_allowance(p_user);
    end if;
    return v_id;
  end if;

  insert into generation_ledger (user_id, period_id, event_type, quantity, source, status, environment, note, balance_after)
  values (p_user, v_id, 'monthly_generation', p_allowance, p_source, 'granted', p_environment,
          coalesce(p_product, p_source) || ' period ' || p_start::text || ' to ' || p_end::text, generation_remaining(p_user));

  perform sync_profile_allowance(p_user);
  return v_id;
end;
$$;
