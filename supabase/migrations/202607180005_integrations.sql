begin;

alter table public.raw_captures
  add column media_type text not null default 'text',
  add column media_file_id text,
  add column external_ref text,
  add column source_reply_sent_at timestamptz;

alter table public.raw_captures
  add constraint raw_captures_media_type_check
    check (media_type in ('text', 'voice', 'photo')),
  add constraint raw_captures_media_file_id_check
    check (
      media_file_id is null
      or length(media_file_id) between 1 and 512
    ),
  add constraint raw_captures_external_ref_check
    check (
      external_ref is null
      or length(external_ref) between 1 and 1024
    );

create index if not exists raw_captures_external_ref_idx
  on public.raw_captures (user_id, routed_to, external_ref)
  where external_ref is not null;

create table if not exists public.telegram_updates (
  update_id bigint primary key,
  status text not null default 'processing'
    constraint telegram_updates_status_check
    check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1
    constraint telegram_updates_attempts_check
    check (attempts > 0),
  locked_until timestamptz not null,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_updates_last_error_check
    check (last_error is null or length(last_error) between 1 and 128)
);

create index if not exists telegram_updates_status_lock_idx
  on public.telegram_updates (status, locked_until);

drop trigger if exists telegram_updates_set_updated_at
  on public.telegram_updates;
create trigger telegram_updates_set_updated_at
before update on public.telegram_updates
for each row execute function public.set_updated_at();

alter table public.telegram_updates enable row level security;
revoke all privileges on table public.telegram_updates
from anon, authenticated;
grant select, insert, update, delete on table public.telegram_updates
to service_role;

create or replace function public.claim_telegram_update(
  p_update_id bigint,
  p_lease_seconds integer default 360
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  claimed_attempt integer;
begin
  if p_update_id is null or p_update_id < 0 then
    raise exception 'Invalid Telegram update id' using errcode = '22023';
  end if;

  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Invalid Telegram update lease' using errcode = '22023';
  end if;

  insert into public.telegram_updates (
    update_id,
    status,
    attempts,
    locked_until
  )
  values (
    p_update_id,
    'processing',
    1,
    now() + pg_catalog.make_interval(secs => p_lease_seconds)
  )
  on conflict (update_id) do nothing
  returning attempts into claimed_attempt;

  if claimed_attempt is not null then
    return claimed_attempt;
  end if;

  update public.telegram_updates
  set
    status = 'processing',
    attempts = attempts + 1,
    locked_until = now() + pg_catalog.make_interval(secs => p_lease_seconds),
    last_error = null
  where update_id = p_update_id
    and status <> 'completed'
    and (status = 'failed' or locked_until < now())
  returning attempts into claimed_attempt;

  return coalesce(claimed_attempt, 0);
end;
$function$;

create or replace function public.complete_telegram_update(
  p_update_id bigint,
  p_attempt integer,
  p_ok boolean
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if p_update_id is null
     or p_update_id < 0
     or p_attempt is null
     or p_attempt < 1
     or p_ok is null then
    raise exception 'Invalid Telegram update completion'
      using errcode = '22023';
  end if;

  update public.telegram_updates
  set
    status = case when p_ok then 'completed' else 'failed' end,
    completed_at = case when p_ok then now() else null end,
    locked_until = now(),
    last_error = case when p_ok then null else 'processing_failed' end
  where update_id = p_update_id
    and attempts = p_attempt
    and status = 'processing';

  return found;
end;
$function$;

create or replace function public.attach_capture_media(
  p_user_id text,
  p_capture_id uuid,
  p_media_type text,
  p_media_file_id text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if p_media_type is null or p_media_type not in ('voice', 'photo') then
    raise exception 'Invalid media type' using errcode = '22023';
  end if;

  if p_media_file_id is null
     or length(btrim(p_media_file_id)) < 1
     or length(p_media_file_id) > 512 then
    raise exception 'Invalid media file id' using errcode = '22023';
  end if;

  update public.raw_captures
  set
    media_type = p_media_type,
    media_file_id = p_media_file_id
  where id = p_capture_id
    and user_id = p_user_id;

  return found;
end;
$function$;

create or replace function public.mark_capture_reply_sent(
  p_user_id text,
  p_capture_id uuid
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  update public.raw_captures
  set source_reply_sent_at = coalesce(source_reply_sent_at, now())
  where id = p_capture_id
    and user_id = p_user_id;

  return found;
end;
$function$;

create or replace function public.apply_meal_nutrition(
  p_user_id text,
  p_capture_id uuid,
  p_kcal integer,
  p_protein numeric,
  p_carbs numeric,
  p_fat numeric
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  daily_log_id uuid;
  meals jsonb;
  updated_meals jsonb;
  meal_exists boolean;
begin
  if p_kcal is null or p_kcal < 0 or p_kcal > 10000 then
    raise exception 'Invalid calories' using errcode = '22023';
  end if;

  if p_protein is null or p_protein < 0 or p_protein > 1000
     or p_carbs is null or p_carbs < 0 or p_carbs > 1000
     or p_fat is null or p_fat < 0 or p_fat > 1000 then
    raise exception 'Invalid macronutrients' using errcode = '22023';
  end if;

  select capture.routed_id
  into daily_log_id
  from public.raw_captures as capture
  where capture.id = p_capture_id
    and capture.user_id = p_user_id
    and capture.classification ->> 'kind' = 'meal'
    and capture.routed_to = 'daily_logs'
  for update;

  if daily_log_id is null then
    return false;
  end if;

  select coalesce(log.notes #> '{nutrition,meals}', '[]'::jsonb)
  into meals
  from public.daily_logs as log
  where log.id = daily_log_id
    and log.user_id = p_user_id
  for update;

  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(meals) as items(meal)
    where items.meal ->> 'id' = p_capture_id::text
  )
  into meal_exists;

  if not meal_exists then
    return false;
  end if;

  select pg_catalog.jsonb_agg(
    case
      when meal ->> 'id' = p_capture_id::text then
        meal || pg_catalog.jsonb_build_object(
          'kcal', p_kcal,
          'p', p_protein,
          'c', p_carbs,
          'f', p_fat,
          'estimated', true
        )
      else meal
    end
    order by ordinal
  )
  into updated_meals
  from pg_catalog.jsonb_array_elements(meals)
    with ordinality as items(meal, ordinal);

  update public.daily_logs
  set notes = pg_catalog.jsonb_set(
    notes,
    '{nutrition,meals}',
    coalesce(updated_meals, '[]'::jsonb),
    true
  )
  where id = daily_log_id
    and user_id = p_user_id;

  return found;
end;
$function$;

create or replace function public.complete_calendar_route(
  p_user_id text,
  p_capture_id uuid,
  p_external_ref text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if p_external_ref is null
     or length(btrim(p_external_ref)) < 1
     or length(p_external_ref) > 1024 then
    raise exception 'Invalid calendar reference' using errcode = '22023';
  end if;

  update public.raw_captures
  set
    routed_to = 'google_calendar',
    external_ref = p_external_ref
  where id = p_capture_id
    and user_id = p_user_id
    and classification ->> 'kind' = 'event';

  return found;
end;
$function$;

create or replace function public.set_task_urgency(
  p_user_id text,
  p_task_id uuid,
  p_urgency text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  base_priority double precision;
begin
  base_priority := case p_urgency
    when 'today' then 100
    when 'tomorrow' then 80
    when 'this_week' then 60
    when 'next_week' then 40
    when 'this_month' then 20
    when 'someday' then 0
    else null
  end;

  if base_priority is null then
    raise exception 'Invalid task urgency' using errcode = '22023';
  end if;

  update public.tasks
  set
    urgency = p_urgency,
    priority_score = base_priority + case when key then 25 else 0 end
  where id = p_task_id
    and user_id = p_user_id
    and completed_at is null;

  return found;
end;
$function$;

revoke execute on function public.attach_capture_media(
  text, uuid, text, text
) from public, anon, authenticated;
revoke execute on function public.claim_telegram_update(
  bigint, integer
) from public, anon, authenticated;
revoke execute on function public.mark_capture_reply_sent(
  text, uuid
) from public, anon, authenticated;
revoke execute on function public.complete_telegram_update(
  bigint, integer, boolean
) from public, anon, authenticated;
revoke execute on function public.apply_meal_nutrition(
  text, uuid, integer, numeric, numeric, numeric
) from public, anon, authenticated;
revoke execute on function public.complete_calendar_route(
  text, uuid, text
) from public, anon, authenticated;
revoke execute on function public.set_task_urgency(
  text, uuid, text
) from public, anon, authenticated;

grant execute on function public.attach_capture_media(
  text, uuid, text, text
) to service_role;
grant execute on function public.claim_telegram_update(
  bigint, integer
) to service_role;
grant execute on function public.mark_capture_reply_sent(
  text, uuid
) to service_role;
grant execute on function public.complete_telegram_update(
  bigint, integer, boolean
) to service_role;
grant execute on function public.apply_meal_nutrition(
  text, uuid, integer, numeric, numeric, numeric
) to service_role;
grant execute on function public.complete_calendar_route(
  text, uuid, text
) to service_role;
grant execute on function public.set_task_urgency(
  text, uuid, text
) to service_role;

commit;
