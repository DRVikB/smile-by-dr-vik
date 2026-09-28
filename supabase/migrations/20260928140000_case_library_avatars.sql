-- SmileCompose: Case Library (the clinician's own finished work, used as
-- per-generation style references) and optional profile photos.
--
-- Case Library images are potentially identifiable health information about
-- the clinician's past patients. They live in a PRIVATE storage bucket, in a
-- folder named after the owner's user id, and are written and read by the
-- server (service role) after authenticating the user. Storage policies also
-- restrict any direct access to the owner's own folder. Nothing here is used
-- for model training; references are attached to individual generations only.

-- 1. Profile photo -----------------------------------------------------------
alter table public.profiles
  add column avatar_path text
    check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9-]+\.jpg$'));

-- 2. Case Library ------------------------------------------------------------
create table public.reference_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 80 and label !~ '[[:cntrl:]]'),
  material text not null check (material in ('Single-shade composite', 'Layered composite', 'Porcelain')),
  teeth_treated smallint[] not null default '{}' check (cardinality(teeth_treated) <= 28),
  starting_conditions text[] not null default '{}' check (cardinality(starting_conditions) <= 6),
  style_tags text[] not null default '{}' check (cardinality(style_tags) <= 8),
  shade text check (shade is null or char_length(shade) <= 40),
  -- Held-out outcomes (validation) are never attached to a generation.
  validation_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reference_cases_user on public.reference_cases (user_id, created_at desc);
create trigger reference_cases_touch before update on public.reference_cases
  for each row execute function public.touch_updated_at();

-- 'original' is the downscaled upload; 'reference' is the smile-region
-- derivative that is actually sent to the AI provider (data minimisation).
create table public.reference_case_images (
  id uuid primary key default gen_random_uuid(),
  reference_case_id uuid not null references public.reference_cases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('original', 'reference')),
  storage_path text not null unique check (storage_path like user_id::text || '/%'),
  bytes bigint not null check (bytes >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  created_at timestamptz not null default now(),
  unique (reference_case_id, kind)
);
create index reference_case_images_user on public.reference_case_images (user_id);

-- Optional "Does this reflect your style?" answers: technical metadata only.
create table public.style_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  rating text not null check (rating in ('yes', 'not_quite')),
  reference_count smallint not null default 0 check (reference_count between 0 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

-- Which references a generation used (QA, troubleshooting, validation).
alter table public.generation_ledger add column reference_case_ids uuid[];

-- First-upload authority confirmation for Case Library images.
alter table public.consent_records drop constraint consent_records_record_type_check;
alter table public.consent_records add constraint consent_records_record_type_check
  check (record_type in ('terms', 'privacy', 'upload_authority', 'ai_processing', 'customer_dpa', 'case_library_authority'));

-- 3. Functions ---------------------------------------------------------------
drop function public.commit_generation(uuid, text, text, text, text, text);
create function public.commit_generation(
  p_reservation uuid, p_provider text, p_model text, p_provider_request_id text,
  p_prompt_version text default null, p_treatment_type text default null,
  p_reference_case_ids uuid[] default null
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
    provider, model, status, provider_request_id, prompt_version, treatment_type, reference_case_ids)
  values (v_res.user_id, v_res.case_id, v_res.id, v_res.period_id, 'generation', 0, v_res.funding,
    p_provider, p_model, 'committed', p_provider_request_id, p_prompt_version, left(p_treatment_type, 80),
    -- Only the caller's own references can be recorded.
    (select array_agg(r.id) from reference_cases r where r.id = any (p_reference_case_ids) and r.user_id = v_res.user_id));
end;
$$;

-- Server-maintained storage accounting (bytes of account-held files).
create function public.adjust_storage_usage(p_user uuid, p_delta bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_used bigint;
begin
  insert into storage_accounts (user_id, used_bytes) values (p_user, greatest(p_delta, 0))
  on conflict (user_id) do update
    set used_bytes = greatest(storage_accounts.used_bytes + p_delta, 0), updated_at = now()
  returning used_bytes into v_used;
  return v_used;
end;
$$;

create or replace function public.export_account_data(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'generated_at', now(),
    'user_id', p_user,
    'profile', (select to_jsonb(p) from profiles p where p.id = p_user),
    'storage', (select jsonb_build_object('used_bytes', s.used_bytes, 'limit_bytes', s.limit_bytes, 'updated_at', s.updated_at) from storage_accounts s where s.user_id = p_user),
    'case_library', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('images',
        coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'storage_path', i.storage_path, 'bytes', i.bytes, 'width', i.width, 'height', i.height))
          from reference_case_images i where i.reference_case_id = r.id), '[]'::jsonb)) order by r.created_at)
      from reference_cases r where r.user_id = p_user), '[]'::jsonb),
    'style_feedback', coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from style_feedback f where f.user_id = p_user), '[]'::jsonb),
    'allowance_periods', coalesce((select jsonb_agg(to_jsonb(a) order by a.period_start) from allowance_periods a where a.user_id = p_user), '[]'::jsonb),
    'generation_ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from generation_ledger l where l.user_id = p_user), '[]'::jsonb),
    'consent_records', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from consent_records c where c.user_id = p_user), '[]'::jsonb),
    'security_events', coalesce((select jsonb_agg(jsonb_build_object('event_type', s.event_type, 'actor', s.actor, 'created_at', s.created_at) order by s.id) from security_audit_log s where s.user_id = p_user), '[]'::jsonb),
    'complimentary_access', coalesce((select jsonb_agg(jsonb_build_object('access_level', o.access_level, 'expires_at', o.expires_at, 'revoked_at', o.revoked_at, 'created_at', o.created_at)) from access_overrides o where o.user_id = p_user), '[]'::jsonb),
    'organisations', coalesce((select jsonb_agg(jsonb_build_object('organisation_id', m.organisation_id, 'role', m.role)) from organisation_members m where m.user_id = p_user), '[]'::jsonb)
  );
$$;

revoke execute on function
  public.commit_generation(uuid, text, text, text, text, text, uuid[]),
  public.adjust_storage_usage(uuid, bigint),
  public.export_account_data(uuid)
from public, anon, authenticated;
grant execute on function
  public.commit_generation(uuid, text, text, text, text, text, uuid[]),
  public.adjust_storage_usage(uuid, bigint),
  public.export_account_data(uuid)
to service_role;

-- 4. Row Level Security -------------------------------------------------------
alter table public.reference_cases enable row level security;
alter table public.reference_case_images enable row level security;
alter table public.style_feedback enable row level security;
revoke all on public.reference_cases, public.reference_case_images, public.style_feedback from anon, authenticated;
grant select on public.reference_cases, public.reference_case_images, public.style_feedback to authenticated;
grant all on public.reference_cases, public.reference_case_images, public.style_feedback to service_role;
create policy "Read own reference cases" on public.reference_cases
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own reference images" on public.reference_case_images
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own style feedback" on public.style_feedback
  for select to authenticated using ((select auth.uid()) = user_id);

-- 5. Private storage buckets -------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('profile-avatars', 'profile-avatars', false, 1048576, array['image/jpeg']),
  ('case-library', 'case-library', false, 10485760, array['image/jpeg'])
on conflict (id) do update set public = false;

-- Direct access (if any) is limited to the owner's own folder: "<user id>/...".
create policy "Own avatar objects: read" on storage.objects for select to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own avatar objects: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own avatar objects: replace" on storage.objects for update to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own avatar objects: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own case library objects: read" on storage.objects for select to authenticated
  using (bucket_id = 'case-library' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own case library objects: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'case-library' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Case Library uploads go through the SmileCompose API (authority confirmation,
-- validation and storage accounting), so users get no direct insert/update.
