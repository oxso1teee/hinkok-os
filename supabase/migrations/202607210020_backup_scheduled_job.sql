begin;

alter table public.system_job_runs
  drop constraint if exists system_job_runs_job_name_check;

alter table public.system_job_runs
  add constraint system_job_runs_job_name_check
  check (job_name in (
    'obsidian_sync',
    'calendar_sync',
    'finance_sync',
    'weekly_insight',
    'backup_scheduled'
  ));

create or replace function public.begin_system_job(
  p_user_id text,
  p_job_name text,
  p_trigger_source text,
  p_stale_after_seconds integer default 600,
  p_min_interval_seconds integer default 300
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  run_id uuid;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128 then
    raise exception 'Invalid system job user' using errcode = '22023';
  end if;

  if p_job_name is null
     or p_job_name not in (
       'obsidian_sync',
       'calendar_sync',
       'finance_sync',
       'weekly_insight',
       'backup_scheduled'
     ) then
    raise exception 'Invalid system job name' using errcode = '22023';
  end if;

  if p_trigger_source is null
     or p_trigger_source not in ('cron', 'manual') then
    raise exception 'Invalid system job trigger' using errcode = '22023';
  end if;

  if p_stale_after_seconds is null
     or p_stale_after_seconds < 60
     or p_stale_after_seconds > 3600 then
    raise exception 'Invalid stale interval' using errcode = '22023';
  end if;

  if p_min_interval_seconds is null
     or p_min_interval_seconds < 0
     or p_min_interval_seconds > 3600 then
    raise exception 'Invalid minimum interval' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id || ':' || p_job_name, 0)
  );

  update public.system_job_runs
  set
    status = 'abandoned',
    finished_at = now(),
    duration_ms = least(
      2147483647,
      greatest(
        0,
        floor(extract(epoch from (now() - started_at)) * 1000)::bigint
      )
    )::integer,
    summary = jsonb_build_object('recovered', true),
    error_code = 'stale_run'
  where user_id = p_user_id
    and job_name = p_job_name
    and status = 'running'
    and heartbeat_at < now() - pg_catalog.make_interval(
      secs => p_stale_after_seconds
    );

  if exists (
    select 1
    from public.system_job_runs
    where user_id = p_user_id
      and job_name = p_job_name
      and status = 'running'
  ) then
    return null;
  end if;

  if p_min_interval_seconds > 0 and exists (
    select 1
    from public.system_job_runs
    where user_id = p_user_id
      and job_name = p_job_name
      and started_at >= now() - pg_catalog.make_interval(
        secs => p_min_interval_seconds
      )
  ) then
    return null;
  end if;

  delete from public.system_job_runs
  where user_id = p_user_id
    and status <> 'running'
    and started_at < now() - interval '90 days';

  insert into public.system_job_runs (
    user_id,
    job_name,
    trigger_source
  )
  values (
    p_user_id,
    p_job_name,
    p_trigger_source
  )
  returning id into run_id;

  return run_id;
end;
$function$;

revoke all on function public.begin_system_job(
  text,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.begin_system_job(
  text,
  text,
  text,
  integer,
  integer
) to service_role;

commit;
