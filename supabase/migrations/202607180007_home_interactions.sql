begin;

create or replace function public.set_task_completion(
  p_user_id text,
  p_task_id uuid,
  p_completed boolean
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
     or p_task_id is null
     or p_completed is null then
    raise exception 'Invalid task completion input' using errcode = '22023';
  end if;

  update public.tasks
  set completed_at = case when p_completed then now() else null end
  where id = p_task_id
    and user_id = p_user_id;

  return found;
end;
$function$;

create or replace function public.set_daily_habit(
  p_user_id text,
  p_log_date date,
  p_habit_id text,
  p_value integer
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  daily_log_id uuid;
  daily_notes jsonb;
  habits jsonb;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128
     or p_log_date is null
     or p_habit_id is null
     or p_habit_id !~ '^[a-z][a-z0-9_-]{0,63}$'
     or p_value is null
     or p_value < 0
     or p_value > 100 then
    raise exception 'Invalid daily habit input' using errcode = '22023';
  end if;

  insert into public.daily_logs (user_id, log_date, notes)
  values (p_user_id, p_log_date, '{}'::jsonb)
  on conflict (user_id, log_date) do nothing;

  select id, notes
  into daily_log_id, daily_notes
  from public.daily_logs
  where user_id = p_user_id
    and log_date = p_log_date
  for update;

  habits := case
    when jsonb_typeof(daily_notes -> 'habits') = 'object'
      then daily_notes -> 'habits'
    else '{}'::jsonb
  end;

  update public.daily_logs
  set notes = pg_catalog.jsonb_set(
    daily_notes,
    '{habits}',
    habits || pg_catalog.jsonb_build_object(p_habit_id, p_value),
    true
  )
  where id = daily_log_id;

  return daily_log_id;
end;
$function$;

create or replace function public.add_daily_goal(
  p_user_id text,
  p_log_date date,
  p_period text,
  p_text text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  daily_log_id uuid;
  daily_notes jsonb;
  period_key text;
  goal_items jsonb;
  new_goal jsonb;
begin
  period_key := case p_period
    when 'week' then 'goals_week_items'
    when 'month' then 'goals_month_items'
    else null
  end;

  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128
     or p_log_date is null
     or period_key is null
     or p_text is null
     or length(btrim(p_text)) < 1
     or length(p_text) > 200 then
    raise exception 'Invalid daily goal input' using errcode = '22023';
  end if;

  insert into public.daily_logs (user_id, log_date, notes)
  values (p_user_id, p_log_date, '{}'::jsonb)
  on conflict (user_id, log_date) do nothing;

  select id, notes
  into daily_log_id, daily_notes
  from public.daily_logs
  where user_id = p_user_id
    and log_date = p_log_date
  for update;

  goal_items := case
    when jsonb_typeof(daily_notes -> period_key) = 'array'
      then daily_notes -> period_key
    else '[]'::jsonb
  end;

  if pg_catalog.jsonb_array_length(goal_items) >= 20 then
    raise exception 'Daily goal limit reached' using errcode = '22023';
  end if;

  new_goal := pg_catalog.jsonb_build_object(
    'id', gen_random_uuid(),
    'text', btrim(p_text),
    'done', false
  );

  update public.daily_logs
  set notes = pg_catalog.jsonb_set(
    daily_notes,
    array[period_key],
    goal_items || pg_catalog.jsonb_build_array(new_goal),
    true
  )
  where id = daily_log_id;

  return new_goal;
end;
$function$;

create or replace function public.set_daily_goal_completed(
  p_user_id text,
  p_log_date date,
  p_period text,
  p_goal_id uuid,
  p_done boolean
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  daily_log_id uuid;
  daily_notes jsonb;
  period_key text;
  goal_items jsonb;
  updated_items jsonb;
begin
  period_key := case p_period
    when 'week' then 'goals_week_items'
    when 'month' then 'goals_month_items'
    else null
  end;

  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or p_log_date is null
     or period_key is null
     or p_goal_id is null
     or p_done is null then
    raise exception 'Invalid daily goal completion input'
      using errcode = '22023';
  end if;

  select id, notes
  into daily_log_id, daily_notes
  from public.daily_logs
  where user_id = p_user_id
    and log_date = p_log_date
  for update;

  if daily_log_id is null then
    return false;
  end if;

  goal_items := case
    when jsonb_typeof(daily_notes -> period_key) = 'array'
      then daily_notes -> period_key
    else '[]'::jsonb
  end;

  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(goal_items) as goals(goal)
    where goals.goal ->> 'id' = p_goal_id::text
  ) then
    return false;
  end if;

  select pg_catalog.jsonb_agg(
    case
      when goal ->> 'id' = p_goal_id::text then
        goal || pg_catalog.jsonb_build_object('done', p_done)
      else goal
    end
    order by ordinal
  )
  into updated_items
  from pg_catalog.jsonb_array_elements(goal_items)
    with ordinality as goals(goal, ordinal);

  update public.daily_logs
  set notes = pg_catalog.jsonb_set(
    daily_notes,
    array[period_key],
    coalesce(updated_items, '[]'::jsonb),
    true
  )
  where id = daily_log_id;

  return found;
end;
$function$;

revoke execute on function public.set_task_completion(
  text, uuid, boolean
) from public, anon, authenticated;
revoke execute on function public.set_daily_habit(
  text, date, text, integer
) from public, anon, authenticated;
revoke execute on function public.add_daily_goal(
  text, date, text, text
) from public, anon, authenticated;
revoke execute on function public.set_daily_goal_completed(
  text, date, text, uuid, boolean
) from public, anon, authenticated;

grant execute on function public.set_task_completion(
  text, uuid, boolean
) to service_role;
grant execute on function public.set_daily_habit(
  text, date, text, integer
) to service_role;
grant execute on function public.add_daily_goal(
  text, date, text, text
) to service_role;
grant execute on function public.set_daily_goal_completed(
  text, date, text, uuid, boolean
) to service_role;

commit;
