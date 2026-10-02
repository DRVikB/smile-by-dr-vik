-- Auth deletes identities by FK cascade after the account row disappears.
-- Retain the audit event without reinserting a reference to the deleted user.
-- Ordinary unlinking still records the existing account's user ID.
create or replace function public.audit_identity_change() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare event_user uuid;
begin
  if tg_op = 'INSERT' then
    perform public.record_security_event(new.user_id, 'user', 'sign_in_method_linked', jsonb_build_object('provider', new.provider));
    return new;
  end if;
  select id into event_user from auth.users where id = old.user_id;
  perform public.record_security_event(event_user, 'user', 'sign_in_method_unlinked', jsonb_build_object('provider', old.provider));
  return old;
end;
$$;
