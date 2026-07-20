begin;

create table if not exists public.system_job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  job_name text not null
    constraint system_job_runs_job_name_check
    check (job_name in ('obsidian_sync', 'calendar_sync', 'finance_sync', 'weekly_insight')),
  trigger_source text not null
    constraint system_job_runs_trigger_source_check
    check (trigger_source in ('cron', 'manual')),
  status text not null default 'running'
    constraint system_job_runs_status_check
    check (status in ('running', 'succeeded', 'failed', 'abandoned')),
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  constraint system_job_runs_user_id_check
    check (length(btrim(user_id)) between 1 and 128),
  constraint system_job_runs_time_order_check
    check (
      heartbeat_at >= started_at
      and (finished_at is null or finished_at >= started_at)
    ),
  constraint system_job_runs_completion_check
    check (
      (
        status = 'running'
        and finished_at is null
        and duration_ms is null
      )
      or
      (
        status <> 'running'
        and finished_at is not null
        and duration_ms is not null
        and duration_ms >= 0
      )
    ),
  constraint system_job_runs_summary_check
    check (
      jsonb_typeof(summary) = 'object'
      and octet_length(summary::text) <= 8192
    ),
  constraint system_job_runs_error_code_check
    check (
      error_code is null
      or (
        length(error_code) between 1 and 64
        and error_code ~ '^[a-z0-9_]+$'
      )
    )
);

create index if not exists system_job_runs_user_job_started_idx
  on public.system_job_runs (user_id, job_name, started_at desc);

create unique index if not exists system_job_runs_running_idx
  on public.system_job_runs (user_id, job_name, heartbeat_at)
  where status = 'running';

create index if not exists system_job_runs_recent_idx
  on public.system_job_runs (user_id, started_at desc);

alter table public.system_job_runs enable row level security;

revoke all privileges on table public.system_job_runs
from anon, authenticated;

grant select, insert, update, delete on table public.system_job_runs
to service_role;

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
     or p_job_name not in ('obsidian_sync', 'calendar_sync', 'finance_sync', 'weekly_insight') then
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
        floor(
          extract(epoch from (now() - started_at)) * 1000
        )::bigint
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

create or replace function public.finish_system_job(
  p_user_id text,
  p_run_id uuid,
  p_status text,
  p_summary jsonb default '{}'::jsonb,
  p_error_code text default null
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128
     or p_run_id is null then
    raise exception 'Invalid system job completion target'
      using errcode = '22023';
  end if;

  if p_status is null or p_status not in ('succeeded', 'failed') then
    raise exception 'Invalid system job completion status'
      using errcode = '22023';
  end if;

  if p_summary is null
     or jsonb_typeof(p_summary) <> 'object'
     or octet_length(p_summary::text) > 8192 then
    raise exception 'Invalid system job summary' using errcode = '22023';
  end if;

  if p_error_code is not null
     and (
       length(p_error_code) < 1
       or length(p_error_code) > 64
       or p_error_code !~ '^[a-z0-9_]+$'
     ) then
    raise exception 'Invalid system job error code' using errcode = '22023';
  end if;

  if p_status = 'succeeded' and p_error_code is not null then
    raise exception 'Successful system job cannot have an error code'
      using errcode = '22023';
  end if;

  update public.system_job_runs
  set
    status = p_status,
    heartbeat_at = now(),
    finished_at = now(),
    duration_ms = least(
      2147483647,
      greatest(
        0,
        floor(
          extract(epoch from (now() - started_at)) * 1000
        )::bigint
      )
    )::integer,
    summary = p_summary,
    error_code = p_error_code
  where id = p_run_id
    and user_id = p_user_id
    and status = 'running';

  return found;
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

revoke all on function public.finish_system_job(
  text,
  uuid,
  text,
  jsonb,
  text
) from public, anon, authenticated;
grant execute on function public.finish_system_job(
  text,
  uuid,
  text,
  jsonb,
  text
) to service_role;

commit;
