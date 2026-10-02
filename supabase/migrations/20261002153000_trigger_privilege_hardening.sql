-- Staging audit: these trigger bodies only use row variables and pg_catalog
-- built-ins. Lock name resolution without changing their behaviour.
alter function public.reject_ledger_update() set search_path = pg_catalog;
alter function public.touch_updated_at() set search_path = pg_catalog;
alter function public.reject_update() set search_path = pg_catalog;
alter function public.guard_security_audit_log() set search_path = pg_catalog;

-- Supabase may install this automatic-RLS event trigger. Keep it and its owner
-- privileges intact, but do not expose an administrative function to API roles.
-- Local databases and older projects may not have it.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
      and p.pronargs = 0 and p.prorettype = 'event_trigger'::regtype
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
