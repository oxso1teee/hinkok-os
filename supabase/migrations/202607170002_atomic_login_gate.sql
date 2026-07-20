begin;

create or replace function public.register_login_attempt(
  p_ip text,
  p_ok boolean,
  p_window_seconds integer default 900,
  p_max_failures integer default 8
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  recent_failure_count integer;
begin
  if p_ip is null or length(btrim(p_ip)) = 0 or length(p_ip) > 128 then
    raise exception 'Invalid login attempt IP value'
      using errcode = '22023';
  end if;

  if p_ok is null then
    raise exception 'Login result is required'
      using errcode = '22023';
  end if;

  if p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Invalid login rate-limit window'
      using errcode = '22023';
  end if;

  if p_max_failures < 1 or p_max_failures > 100 then
    raise exception 'Invalid maximum login failure count'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_ip, 0)
  );

  select count(*)::integer
  into recent_failure_count
  from public.login_attempts
  where ip = p_ip
    and ok = false
    and created_at >= (
      now() - pg_catalog.make_interval(secs => p_window_seconds)
    );

  if recent_failure_count >= p_max_failures then
    return false;
  end if;

  insert into public.login_attempts (ip, ok)
  values (p_ip, p_ok);

  return true;
end;
$function$;

revoke execute on function public.register_login_attempt(
  text,
  boolean,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.register_login_attempt(
  text,
  boolean,
  integer,
  integer
) to service_role;

commit;
