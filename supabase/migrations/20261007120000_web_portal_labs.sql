-- Web portal: the clinical photo set on patient cases, the clinician's labs and secure lab links.
--
-- * CLINICAL_PHOTO: smile left/right, retracted and arch photos kept with a synced patient case
--   (same private `patient-cases` bucket and owner-only policies as the existing case media).
-- * labs: the dental labs a clinician works with (name, email, contact). Owner-only.
-- * lab_shares: a private, expiring link to a *copy* of a case's lab pack. The link token is
--   only ever stored hashed (SHA-256); revoking or expiring a share removes access, and its
--   files live in the private `lab-shares` bucket, readable only by the server.
-- Writes go through the authenticated application API (service role); browsers can read their
-- own rows, never other clinicians' and never the token.

alter table public.patient_case_assets drop constraint if exists patient_case_assets_kind_check;
alter table public.patient_case_assets add constraint patient_case_assets_kind_check check (kind in (
  'ORIGINAL_PHOTO','PREPARED_PHOTO','PRESENTATION_PHOTO','THUMBNAIL','GENERATED_CONCEPT','REPORT','EDIT_MASK','REFERENCE_PHOTO','CLINICAL_PHOTO'));
alter table public.patient_case_assets drop constraint if exists patient_case_assets_provenance_check;
alter table public.patient_case_assets add constraint patient_case_assets_provenance_check check (provenance in (
  'original','legacy-prepared-original','prepared','generated','report','mask','reference','clinical'));

create table public.labs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact text check (char_length(contact) <= 120),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index labs_owner on public.labs(owner_user_id, archived_at, name);

create table public.lab_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete cascade,
  case_id uuid not null,
  case_label text not null check (char_length(case_label) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  contents jsonb not null default '{}' check (jsonb_typeof(contents) = 'object' and octet_length(contents::text) <= 65536),
  consent_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  check (expires_at > created_at and expires_at <= created_at + interval '31 days')
);
create index lab_shares_owner on public.lab_shares(owner_user_id, created_at desc);
create index lab_shares_lab on public.lab_shares(lab_id);

alter table public.labs enable row level security;
alter table public.lab_shares enable row level security;
revoke all on public.labs, public.lab_shares from anon, authenticated;
grant select on public.labs to authenticated;
grant select (id, owner_user_id, lab_id, case_id, case_label, contents, consent_confirmed_at, created_at, expires_at, revoked_at,
  first_viewed_at, last_viewed_at, view_count) on public.lab_shares to authenticated;
grant all on public.labs, public.lab_shares to service_role;
create policy labs_owner_read on public.labs for select to authenticated using (owner_user_id = (select auth.uid()));
create policy lab_shares_owner_read on public.lab_shares for select to authenticated using (owner_user_id = (select auth.uid()));

create trigger labs_touch before update on public.labs for each row execute function public.touch_updated_at();

-- Lab pack files: "<owner>/<share id>/<file>". No browser policies: only the server reads or writes.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('lab-shares', 'lab-shares', false, 26214400, array['image/jpeg','image/png','image/webp','application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
