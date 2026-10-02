-- Patient cases are separate from the clinician's reference library.
create table public.patient_cases (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  archived_at timestamptz, deleted_at timestamptz,
  schema_version integer not null default 1 check (schema_version = 1),
  state jsonb not null default '{}', summary jsonb not null default '{}',
  unique(owner_user_id, id),
  check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 2097152),
  check (jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 262144)
);
create index patient_cases_owner_page on public.patient_cases(owner_user_id, updated_at, id);
create table public.patient_case_assets (
  id uuid primary key, owner_user_id uuid not null, case_id uuid not null,
  kind text not null check (kind in ('ORIGINAL_PHOTO','PREPARED_PHOTO','PRESENTATION_PHOTO','THUMBNAIL','GENERATED_CONCEPT','REPORT','EDIT_MASK','REFERENCE_PHOTO')),
  object_path text not null unique, mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  width integer check (width > 0 and width <= 20000), height integer check (height > 0 and height <= 20000),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  provenance text not null default 'generated' check (provenance in ('original','legacy-prepared-original','prepared','generated','report','mask','reference')),
  created_at timestamptz not null default now(),
  upload_status text not null default 'pending' check (upload_status in ('pending','confirmed','deleted')),
  unique(owner_user_id, case_id, id),
  foreign key(owner_user_id, case_id) references public.patient_cases(owner_user_id,id) on delete cascade,
  check (object_path = owner_user_id::text || '/' || case_id::text || '/' || id::text || '/' || lower(kind))
);
create index patient_case_assets_case on public.patient_case_assets(owner_user_id,case_id);
create table public.patient_case_mutations (
  owner_user_id uuid not null references auth.users(id) on delete cascade, operation_id uuid not null,
  case_id uuid not null, mutation_type text not null, payload_checksum text not null,
  accepted_revision integer, result jsonb not null, created_at timestamptz not null default now(),
  primary key(owner_user_id,operation_id),
  foreign key(owner_user_id,case_id) references public.patient_cases(owner_user_id,id) on delete cascade
);
create table public.patient_case_cleanup_jobs (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null, object_path text not null unique, attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(),
  foreign key(owner_user_id,case_id) references public.patient_cases(owner_user_id,id) on delete cascade,
  check (object_path like owner_user_id::text || '/' || case_id::text || '/%')
);
create index patient_cleanup_due on public.patient_case_cleanup_jobs(owner_user_id,next_attempt_at);
alter table public.patient_cases enable row level security;
alter table public.patient_case_assets enable row level security;
alter table public.patient_case_mutations enable row level security;
alter table public.patient_case_cleanup_jobs enable row level security;
revoke all on public.patient_cases, public.patient_case_assets, public.patient_case_mutations, public.patient_case_cleanup_jobs from anon, authenticated;
grant select on public.patient_cases, public.patient_case_assets to authenticated;
grant all on public.patient_cases, public.patient_case_assets, public.patient_case_mutations, public.patient_case_cleanup_jobs to service_role;
create policy patient_owner_read on public.patient_cases for select to authenticated using (owner_user_id = (select auth.uid()));
create policy patient_asset_owner_read on public.patient_case_assets for select to authenticated using (owner_user_id = (select auth.uid()));
-- Writes only through the authenticated application API + revision RPC. No browser table writes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('patient-cases','patient-cases',false,26214400,array['image/jpeg','image/png','image/webp','application/pdf'])
 on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy patient_media_read on storage.objects for select to authenticated using (
 bucket_id='patient-cases' and exists(select 1 from public.patient_case_assets a join public.patient_cases c on c.id=a.case_id and c.owner_user_id=a.owner_user_id
 where a.object_path=name and a.owner_user_id=(select auth.uid()) and a.upload_status='confirmed' and c.deleted_at is null)
);
create policy patient_media_authorised_upload on storage.objects for insert to authenticated with check (
 bucket_id='patient-cases' and exists(select 1 from public.patient_case_assets a join public.patient_cases c on c.id=a.case_id and c.owner_user_id=a.owner_user_id
 where a.object_path=name and a.owner_user_id=(select auth.uid()) and a.upload_status='pending' and c.deleted_at is null)
);
-- No UPDATE policy: object IDs are immutable. Deletion is server-managed with durable cleanup.

-- Defence in depth for structured state. References must be confirmed assets of this exact case.
create function public.patient_state_valid(p_owner uuid,p_case uuid,p_value jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare v jsonb;
begin
 if jsonb_typeof(p_value)='string' then return not (p_value #>> '{}') ~* '^(data:|blob:|https?://)'; end if;
 if jsonb_typeof(p_value)='array' then
   for v in select value from jsonb_array_elements(p_value) loop
     if not public.patient_state_valid(p_owner,p_case,v) then return false; end if;
   end loop;
 elsif jsonb_typeof(p_value)='object' then
   if p_value ? '$asset' then
     return (select count(*) from jsonb_object_keys(p_value)) = 1 and exists(
       select 1 from public.patient_case_assets where id::text=p_value->>'$asset' and owner_user_id=p_owner and case_id=p_case and upload_status='confirmed');
   end if;
   for v in select value from jsonb_each(p_value) loop
     if not public.patient_state_valid(p_owner,p_case,v) then return false; end if;
   end loop;
 end if;
 return true;
end $$;

create function public.mutate_patient_case(p_owner uuid,p_operation uuid,p_case uuid,p_type text,p_expected integer,p_state jsonb,p_summary jsonb,p_archived timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.patient_cases; old public.patient_case_mutations; result jsonb; payload jsonb;
begin
 if p_type not in ('CREATE_CASE','UPDATE_CASE','DELETE_CASE') then raise exception 'invalid_mutation'; end if;
 -- Serialise both operation-ID reuse and concurrent edits to the same case.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text || p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_case::text,1));
 payload=jsonb_build_object('type',p_type,'expected',p_expected,'state',p_state,'summary',p_summary,'archived',p_archived);
 select * into old from public.patient_case_mutations where owner_user_id=p_owner and operation_id=p_operation;
 if found then
  if old.case_id<>p_case or old.payload_checksum<>encode(sha256(convert_to(payload::text,'utf8')),'hex') then return jsonb_build_object('status',409,'code','operation_reused'); end if;
  return old.result;
 end if;
 select * into c from public.patient_cases where id=p_case for update;
 if found and c.owner_user_id<>p_owner then return jsonb_build_object('status',404,'code','not_found'); end if;
 if p_type='CREATE_CASE' then
  if c.id is not null then return jsonb_build_object('status',409,'code',case when c.deleted_at is null then 'conflict' else 'deleted' end,'case',to_jsonb(c)); end if;
  if p_expected<>0 then raise exception 'invalid_revision'; end if;
  if not public.patient_state_valid(p_owner,p_case,p_state) or not public.patient_state_valid(p_owner,p_case,p_summary) then raise exception 'invalid_state'; end if;
  insert into public.patient_cases(id,owner_user_id,state,summary,archived_at) values(p_case,p_owner,p_state,p_summary,p_archived) returning * into c;
 else
  if c.id is null then return jsonb_build_object('status',404,'code','not_found'); end if;
  if c.deleted_at is not null then return jsonb_build_object('status',410,'code','deleted','case',to_jsonb(c)); end if;
  if c.revision<>p_expected then return jsonb_build_object('status',409,'code','conflict','case',to_jsonb(c)); end if;
  if p_type='DELETE_CASE' then
   insert into public.patient_case_cleanup_jobs(owner_user_id,case_id,object_path)
    select p_owner,p_case,object_path from public.patient_case_assets where owner_user_id=p_owner and case_id=p_case on conflict(object_path) do nothing;
   update public.patient_case_assets set upload_status='deleted' where owner_user_id=p_owner and case_id=p_case;
   update public.patient_cases set deleted_at=now(),updated_at=now(),revision=revision+1,state='{}',summary='{}' where id=p_case and owner_user_id=p_owner returning * into c;
  else
   if not public.patient_state_valid(p_owner,p_case,p_state) or not public.patient_state_valid(p_owner,p_case,p_summary) then raise exception 'invalid_state'; end if;
   update public.patient_cases set state=p_state,summary=p_summary,archived_at=p_archived,updated_at=now(),revision=revision+1
    where id=p_case and owner_user_id=p_owner returning * into c;
  end if;
 end if;
 if p_type='DELETE_CASE' then
  -- Keep retry receipts without retaining deleted clinical notes or old state snapshots.
  update public.patient_case_mutations set result=jsonb_build_object('status',410,'code','deleted','case',to_jsonb(c)) where owner_user_id=p_owner and case_id=p_case;
 end if;
 result=jsonb_build_object('status',case when p_type='CREATE_CASE' then 201 else 200 end,'case',to_jsonb(c));
 insert into public.patient_case_mutations(owner_user_id,operation_id,case_id,mutation_type,payload_checksum,accepted_revision,result)
  values(p_owner,p_operation,p_case,p_type,encode(sha256(convert_to(payload::text,'utf8')),'hex'),c.revision,result);
 return result;
end $$;

create function public.authorise_patient_asset(p_owner uuid,p_case uuid,p_asset uuid,p_meta jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.patient_cases; a public.patient_case_assets;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_case::text,1));
 select * into c from public.patient_cases where id=p_case and owner_user_id=p_owner;
 if not found then return jsonb_build_object('status',404,'code','not_found'); end if;
 if c.deleted_at is not null then return jsonb_build_object('status',410,'code','deleted'); end if;
 select * into a from public.patient_case_assets where id=p_asset;
 if found then
  if a.owner_user_id<>p_owner or a.case_id<>p_case then return jsonb_build_object('status',404,'code','not_found'); end if;
  if a.kind<>p_meta->>'kind' or a.mime_type<>p_meta->>'mimeType' or a.byte_size<>(p_meta->>'byteSize')::bigint or a.checksum<>p_meta->>'checksum'
   or a.width is distinct from (p_meta->>'width')::integer or a.height is distinct from (p_meta->>'height')::integer or a.provenance<>p_meta->>'provenance'
   then return jsonb_build_object('status',409,'code','asset_immutable'); end if;
 else
  insert into public.patient_case_assets(id,owner_user_id,case_id,kind,object_path,mime_type,width,height,byte_size,checksum,provenance)
   values(p_asset,p_owner,p_case,p_meta->>'kind',p_owner::text||'/'||p_case::text||'/'||p_asset::text||'/'||lower(p_meta->>'kind'),p_meta->>'mimeType',
    (p_meta->>'width')::integer,(p_meta->>'height')::integer,(p_meta->>'byteSize')::bigint,p_meta->>'checksum',p_meta->>'provenance') returning * into a;
 end if;
 return jsonb_build_object('status',200,'asset',to_jsonb(a));
end $$;
create function public.confirm_patient_asset(p_owner uuid,p_case uuid,p_asset uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_case::text,1));
 if not exists(select 1 from public.patient_cases where id=p_case and owner_user_id=p_owner and deleted_at is null) then return false; end if;
 update public.patient_case_assets set upload_status='confirmed' where id=p_asset and case_id=p_case and owner_user_id=p_owner and upload_status in ('pending','confirmed');
 return found;
end $$;
revoke all on function public.patient_state_valid(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.mutate_patient_case(uuid,uuid,uuid,text,integer,jsonb,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.authorise_patient_asset(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.confirm_patient_asset(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.patient_state_valid(uuid,uuid,jsonb), public.mutate_patient_case(uuid,uuid,uuid,text,integer,jsonb,jsonb,timestamptz),
 public.authorise_patient_asset(uuid,uuid,uuid,jsonb), public.confirm_patient_asset(uuid,uuid,uuid) to service_role;

-- Keep the existing account export intact and include this separate patient domain.
alter function public.export_account_data(uuid) rename to export_account_data_before_patient_sync;
create function public.export_account_data(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select public.export_account_data_before_patient_sync(p_user) || jsonb_build_object(
  'patient_cases',coalesce((select jsonb_agg(to_jsonb(c)) from public.patient_cases c where c.owner_user_id=p_user),'[]'::jsonb),
  'patient_case_assets',coalesce((select jsonb_agg(to_jsonb(a)) from public.patient_case_assets a where a.owner_user_id=p_user),'[]'::jsonb)
 );
$$;
revoke all on function public.export_account_data(uuid) from public,anon,authenticated;
grant execute on function public.export_account_data(uuid) to service_role;
