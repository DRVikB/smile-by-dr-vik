-- Replies from a lab on a shared lab pack: a message and optional photos or PDFs (e.g. the finished work).
-- The lab posts through the link's public page; files go to the private lab-shares bucket under the share.
-- Owner-only reads; server-only writes. Replies stay with the clinician's account (deleted with it) after the
-- link itself has expired.
create table public.lab_share_replies (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.lab_shares(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  message text check (char_length(message) <= 2000),
  files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 5),
  check (message is not null or jsonb_array_length(files) > 0)
);
create index lab_share_replies_share on public.lab_share_replies(share_id, created_at);
create index lab_share_replies_owner on public.lab_share_replies(owner_user_id, created_at desc);
alter table public.lab_share_replies enable row level security;
revoke all on public.lab_share_replies from anon, authenticated;
grant select on public.lab_share_replies to authenticated;
grant all on public.lab_share_replies to service_role;
create policy lab_share_replies_owner_read on public.lab_share_replies for select to authenticated using (owner_user_id = (select auth.uid()));
