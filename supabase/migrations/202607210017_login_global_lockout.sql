begin;

-- Read-only: counts login failures across ALL ips within a window. The
-- existing register_login_attempt() gate is per-ip only and can be bypassed
-- by rotating ip/VPN; this closes that gap at the application layer without
-- changing register_login_attempt()'s signature or behavior.
create or replace function public.count_recent_login_failures(
  p_window_seconds integer default 900
)
returns integer
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  recent_failure_count integer;
begin
  if p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Invalid login rate-limit window'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into recent_failure_count
  from public.login_attempts
  where ok = false
    and created_at >= (
      now() - pg_catalog.make_interval(secs => p_window_seconds)
    );

  return recent_failure_count;
end;
$function$;

revoke execute on function public.count_recent_login_failures(
  integer
) from public, anon, authenticated;

grant execute on function public.count_recent_login_failures(
  integer
) to service_role;

commit;
