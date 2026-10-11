-- Website enquiries: "Book a demo" and "Early access" requests from the landing page.
-- Server-written only (the public form posts to the Worker); no browser role can read or write.
-- Kept for up to 12 months, then removed by the owner's retention routine.
create table public.website_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  practice text check (char_length(practice) <= 160),
  role text not null check (role in ('dentist', 'coordinator', 'lab', 'other')),
  interest text not null check (interest in ('demo', 'early_access')),
  message text check (char_length(message) <= 1000),
  -- SHA-256 of the sender's IP address, for rate limiting only.
  ip_hash text check (ip_hash ~ '^[a-f0-9]{64}$'),
  contacted_at timestamptz
);
create index website_leads_recent on public.website_leads(created_at desc);
create index website_leads_ip on public.website_leads(ip_hash, created_at);
create index website_leads_email on public.website_leads(email, created_at);
alter table public.website_leads enable row level security;
revoke all on public.website_leads from anon, authenticated;
grant all on public.website_leads to service_role;
