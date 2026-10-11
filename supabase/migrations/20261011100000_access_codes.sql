-- Tester access codes: single-use codes the owner creates in the admin dashboard. Redeeming one
-- gives that account complimentary access (an access_overrides row) for a set number of days.
-- Only the SHA-256 of each code is stored; the code itself is shown once, when it is created.
-- Everything here is service-role only; the Worker authenticates the caller first.

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  -- The last four characters, so the owner can tell codes apart in the list.
  hint text not null check (char_length(hint) between 2 and 8),
  label text check (char_length(label) <= 80),
  monthly_generations integer not null default 50 check (monthly_generations between 1 and 100000),
  access_days integer not null default 30 check (access_days between 1 and 366),
  -- The code itself stops working after this, redeemed or not.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz
);
create index access_codes_recent on public.access_codes (created_at desc);
alter table public.access_codes enable row level security;
revoke all on public.access_codes from anon, authenticated;
grant all on public.access_codes to service_role;

-- Wrong guesses, for rate limiting only. Removed with the account.
create table public.access_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index access_code_attempts_user on public.access_code_attempts (user_id, created_at desc);
alter table public.access_code_attempts enable row level security;
revoke all on public.access_code_attempts from anon, authenticated;
grant all on public.access_code_attempts to service_role;

-- Redeem a code for an account. One code, one account, once: the row is locked while it is claimed.
-- A wrong, used, revoked or expired code returns ok = false (not an error), so the failed attempt is
-- recorded and counted; ten in an hour and further tries are refused.
create function public.redeem_access_code(p_user uuid, p_code_hash text)
returns table (ok boolean, access_expires_at timestamptz, monthly_generations integer)
language plpgsql security definer set search_path = public as $$
declare
  v_code access_codes%rowtype;
  v_expires timestamptz;
begin
  if not exists (select 1 from profiles where id = p_user) then raise exception 'account_not_found'; end if;
  if (select count(*) from access_code_attempts where user_id = p_user and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  select * into v_code from access_codes where code_hash = p_code_hash for update;
  if not found or v_code.revoked_at is not null or v_code.redeemed_by is not null
     or (v_code.expires_at is not null and v_code.expires_at <= now()) then
    insert into access_code_attempts (user_id) values (p_user);
    return query select false, null::timestamptz, null::integer;
    return;
  end if;

  v_expires := now() + make_interval(days => v_code.access_days);
  update access_codes set redeemed_by = p_user, redeemed_at = now() where id = v_code.id;
  insert into access_overrides (user_id, monthly_generation_allowance, expires_at, reason, created_by)
  values (p_user, v_code.monthly_generations, v_expires,
          'Access code' || coalesce(' · ' || nullif(v_code.label, ''), '') || ' (…' || v_code.hint || ')', 'access_code');
  perform record_security_event(p_user, 'user', 'access_code_redeemed', jsonb_build_object('code', v_code.id, 'days', v_code.access_days));
  return query select true, v_expires, v_code.monthly_generations;
end;
$$;

revoke execute on function public.redeem_access_code(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_access_code(uuid, text) to service_role;
