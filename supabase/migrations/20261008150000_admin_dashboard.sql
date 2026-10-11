-- Admin dashboard (web portal): who may use it, enquiry follow-up, and server-only functions for
-- the overview, the account list, unlimited access and the notification feed.
-- Everything here is service-role only; the Worker checks admin_users before calling any of it.

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  note text check (char_length(note) <= 200)
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant all on public.admin_users to service_role;

-- Enquiry follow-up.
alter table public.website_leads
  add column status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  add column admin_note text check (char_length(admin_note) <= 1000);
create index website_leads_status on public.website_leads (status, created_at desc);

-- Headline figures for the dashboard.
create function public.admin_overview(p_days integer default 30)
returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(days => least(greatest(p_days, 1), 365)) as at)
  select jsonb_build_object(
    'accounts', (select count(*) from profiles),
    'accounts_new', (select count(*) from profiles, since where profiles.created_at >= since.at),
    'subscribers', (select count(*) from profiles where subscription_status in ('active', 'billing_issue')),
    'complimentary', (select count(distinct user_id) from access_overrides where revoked_at is null and (expires_at is null or expires_at > now())),
    'generations', (select count(*) from generation_reservations, since where status = 'committed' and generation_reservations.created_at >= since.at),
    'generations_today', (select count(*) from generation_reservations where status = 'committed' and created_at >= date_trunc('day', now())),
    'failed', (select count(*) from generation_reservations, since where status = 'released' and generation_reservations.created_at >= since.at),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'count', d.n) order by d.day)
      from (
        select date_trunc('day', g)::date as day,
          (select count(*) from generation_reservations r where r.status = 'committed' and r.created_at >= g and r.created_at < g + interval '1 day') as n
        from generate_series(date_trunc('day', now()) - make_interval(days => least(greatest(p_days, 1), 365) - 1), date_trunc('day', now()), interval '1 day') g
      ) d), '[]'::jsonb),
    'cases', (select count(*) from patient_cases where deleted_at is null),
    'leads_new', (select count(*) from website_leads where status = 'new'),
    'leads', (select count(*) from website_leads, since where website_leads.created_at >= since.at),
    'lab_links', (select count(*) from lab_shares, since where lab_shares.created_at >= since.at),
    'lab_links_opened', (select count(*) from lab_shares, since where lab_shares.created_at >= since.at and first_viewed_at is not null),
    'lab_replies', (select count(*) from lab_share_replies, since where lab_share_replies.created_at >= since.at)
  );
$$;

-- Accounts, newest first, optionally filtered by email or name.
create function public.admin_accounts(p_query text default null, p_limit integer default 50)
returns table (
  id uuid, email text, display_name text, created_at timestamptz, subscription_status text, subscription_product_id text,
  remaining integer, generations_30d bigint, last_generation_at timestamptz, unlimited boolean, complimentary boolean, is_admin boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.display_name, p.created_at, p.subscription_status, p.subscription_product_id,
    generation_remaining(p.id),
    (select count(*) from generation_reservations r where r.user_id = p.id and r.status = 'committed' and r.created_at >= now() - interval '30 days'),
    (select max(r.created_at) from generation_reservations r where r.user_id = p.id and r.status = 'committed'),
    exists (select 1 from access_overrides o where o.user_id = p.id and o.revoked_at is null and (o.expires_at is null or o.expires_at > now()) and o.monthly_generation_allowance >= 10000),
    exists (select 1 from access_overrides o where o.user_id = p.id and o.revoked_at is null and (o.expires_at is null or o.expires_at > now())),
    exists (select 1 from admin_users a where a.user_id = p.id)
  from profiles p
  where p_query is null or p_query = ''
    or p.email ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%'
    or p.display_name ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%'
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

-- Turn unlimited (complimentary) generations on or off. Audited.
create function public.admin_set_unlimited(p_user uuid, p_on boolean, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
begin
  if not exists (select 1 from profiles where id = p_user) then raise exception 'account_not_found'; end if;
  if p_on then
    if not exists (select 1 from access_overrides where user_id = p_user and revoked_at is null
                   and (expires_at is null or expires_at > now()) and monthly_generation_allowance >= 10000) then
      insert into access_overrides (user_id, monthly_generation_allowance, reason, created_by)
      values (p_user, 100000, coalesce(nullif(left(trim(p_note), 500), ''), 'Unlimited access from the admin dashboard'), 'admin_dashboard');
    end if;
    update allowance_periods set included_allowance = greatest(included_allowance, 100000)
    where user_id = p_user and source = 'override' and now() >= period_start and now() < period_end;
  else
    update access_overrides set revoked_at = now()
    where user_id = p_user and revoked_at is null and monthly_generation_allowance >= 10000;
    select coalesce(max(monthly_generation_allowance), 0) into v_next from access_overrides
    where user_id = p_user and revoked_at is null and (expires_at is null or expires_at > now());
    update allowance_periods set included_allowance = greatest(used, v_next)
    where user_id = p_user and source = 'override' and now() >= period_start and now() < period_end and included_allowance >= 10000;
  end if;
  perform sync_profile_allowance(p_user);
  perform record_security_event(p_user, 'admin', case when p_on then 'unlimited_access_on' else 'unlimited_access_off' end,
    jsonb_build_object('note', left(p_note, 200)));
end;
$$;

-- What's happened recently, newest first: enquiries, new accounts and subscription events.
-- Lab activity stays as totals in admin_overview; clinicians' case references never appear here.
create function public.admin_events(p_limit integer default 40)
returns table (kind text, at timestamptz, title text, detail text, ref text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'lead'::text, l.created_at, l.name || case when l.practice is not null then ' · ' || l.practice else '' end,
      case when l.interest = 'demo' then 'Booked a demo' else 'Asked for early access' end, l.id::text
    from website_leads l
    union all
    select 'account', p.created_at, coalesce(nullif(p.display_name, ''), p.email, 'New account'), 'Created an account', p.id::text
    from profiles p
    union all
    select 'subscription', e.received_at, coalesce(nullif(p.display_name, ''), p.email, 'An account'),
      e.type || case when e.environment = 'sandbox' then ' (sandbox)' else '' end, e.app_user_id
    from revenuecat_events e left join profiles p on p.id::text = e.app_user_id
    where e.outcome <> 'ignored'
  ) e(kind, at, title, detail, ref)
  order by at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function
  public.admin_overview(integer),
  public.admin_accounts(text, integer),
  public.admin_set_unlimited(uuid, boolean, text),
  public.admin_events(integer)
from public, anon, authenticated;
grant execute on function
  public.admin_overview(integer),
  public.admin_accounts(text, integer),
  public.admin_set_unlimited(uuid, boolean, text),
  public.admin_events(integer)
to service_role;
