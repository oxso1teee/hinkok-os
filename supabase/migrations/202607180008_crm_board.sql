begin;

alter table public.tasks
  add column if not exists board_position double precision;

alter table public.tasks
  add column if not exists client_request_id uuid;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, urgency
      order by key desc, priority_score desc, created_at asc, id asc
    )::double precision * 1024 as position
  from public.tasks
)
update public.tasks as task
set board_position = ranked.position
from ranked
where task.id = ranked.id
  and task.board_position is null;

alter table public.tasks
  alter column board_position set default 1024,
  alter column board_position set not null;

alter table public.tasks
  drop constraint if exists tasks_board_position_check;

alter table public.tasks
  add constraint tasks_board_position_check
  check (board_position > -1000000000000000 and board_position < 1000000000000000);

create index if not exists tasks_user_board_idx
  on public.tasks (user_id, urgency, board_position, created_at)
  where completed_at is null;

create unique index if not exists tasks_user_client_request_unique_idx
  on public.tasks (user_id, client_request_id)
  where client_request_id is not null;

create or replace function public.create_crm_task(
  p_user_id text,
  p_client_request_id uuid,
  p_title text,
  p_description text,
  p_urgency text,
  p_category text,
  p_sphere text,
  p_key boolean,
  p_priority_score double precision,
  p_time_estimate_min integer,
  p_tags text[],
  p_entity_id uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  existing_id uuid;
  new_id uuid;
  next_position double precision;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128
     or p_client_request_id is null
     or p_title is null
     or length(btrim(p_title)) < 1
     or length(p_title) > 160
     or p_description is not null and length(p_description) > 4000
     or p_urgency is null or p_urgency not in (
       'today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'someday'
     )
     or p_category is null or p_category not in (
       'work', 'content', 'health', 'finance', 'personal'
     )
     or p_sphere is not null and p_sphere not in (
       'work', 'finance', 'health', 'relationships', 'growth', 'mind',
       'personal', 'content', 'spirituality'
     )
     or p_key is null
     or p_priority_score is null
     or p_priority_score < 0
     or p_priority_score > 100
     or p_time_estimate_min is not null and (
       p_time_estimate_min < 1 or p_time_estimate_min > 1440
     )
     or p_tags is null
     or cardinality(p_tags) > 8
     or exists (
       select 1 from unnest(p_tags) as tag
       where length(btrim(tag)) < 1 or length(tag) > 32
     ) then
    raise exception 'Invalid CRM task input' using errcode = '22023';
  end if;

  select id
  into existing_id
  from public.tasks
  where user_id = p_user_id
    and client_request_id = p_client_request_id;

  if existing_id is not null then
    return existing_id;
  end if;

  if p_entity_id is not null and not exists (
    select 1 from public.entities
    where id = p_entity_id and user_id = p_user_id
  ) then
    raise exception 'Entity does not belong to user' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id || ':crm:' || p_urgency, 0)
  );

  select coalesce(max(board_position), 0) + 1024
  into next_position
  from public.tasks
  where user_id = p_user_id
    and urgency = p_urgency
    and completed_at is null;

  insert into public.tasks (
    user_id,
    client_request_id,
    title,
    description,
    urgency,
    category,
    sphere,
    key,
    priority_score,
    time_estimate_min,
    tags,
    entity_id,
    board_position
  ) values (
    p_user_id,
    p_client_request_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_urgency,
    p_category,
    p_sphere,
    p_key,
    p_priority_score,
    p_time_estimate_min,
    p_tags,
    p_entity_id,
    next_position
  )
  on conflict (user_id, client_request_id)
    where client_request_id is not null
  do nothing
  returning id into new_id;

  if new_id is not null then
    return new_id;
  end if;

  select id
  into existing_id
  from public.tasks
  where user_id = p_user_id
    and client_request_id = p_client_request_id;

  return existing_id;
end;
$function$;

create or replace function public.update_crm_task(
  p_user_id text,
  p_task_id uuid,
  p_title text,
  p_description text,
  p_urgency text,
  p_category text,
  p_sphere text,
  p_key boolean,
  p_priority_score double precision,
  p_time_estimate_min integer,
  p_tags text[],
  p_entity_id uuid
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  current_urgency text;
  next_position double precision;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or p_task_id is null
     or p_title is null
     or length(btrim(p_title)) < 1
     or length(p_title) > 160
     or p_description is not null and length(p_description) > 4000
     or p_urgency is null or p_urgency not in (
       'today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'someday'
     )
     or p_category is null or p_category not in (
       'work', 'content', 'health', 'finance', 'personal'
     )
     or p_sphere is not null and p_sphere not in (
       'work', 'finance', 'health', 'relationships', 'growth', 'mind',
       'personal', 'content', 'spirituality'
     )
     or p_key is null
     or p_priority_score is null
     or p_priority_score < 0
     or p_priority_score > 100
     or p_time_estimate_min is not null and (
       p_time_estimate_min < 1 or p_time_estimate_min > 1440
     )
     or p_tags is null
     or cardinality(p_tags) > 8
     or exists (
       select 1 from unnest(p_tags) as tag
       where length(btrim(tag)) < 1 or length(tag) > 32
     ) then
    raise exception 'Invalid CRM task update input' using errcode = '22023';
  end if;

  if p_entity_id is not null and not exists (
    select 1 from public.entities
    where id = p_entity_id and user_id = p_user_id
  ) then
    raise exception 'Entity does not belong to user' using errcode = '22023';
  end if;

  select urgency
  into current_urgency
  from public.tasks
  where id = p_task_id
    and user_id = p_user_id
  for update;

  if current_urgency is null then
    return false;
  end if;

  next_position := null;
  if current_urgency <> p_urgency then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_user_id || ':crm:' || p_urgency, 0)
    );
    select coalesce(max(board_position), 0) + 1024
    into next_position
    from public.tasks
    where user_id = p_user_id
      and urgency = p_urgency
      and completed_at is null;
  end if;

  update public.tasks
  set title = btrim(p_title),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      urgency = p_urgency,
      category = p_category,
      sphere = p_sphere,
      key = p_key,
      priority_score = p_priority_score,
      time_estimate_min = p_time_estimate_min,
      tags = p_tags,
      entity_id = p_entity_id,
      board_position = coalesce(next_position, board_position)
  where id = p_task_id
    and user_id = p_user_id;

  return found;
end;
$function$;

create or replace function public.move_crm_task(
  p_user_id text,
  p_task_id uuid,
  p_urgency text,
  p_before_task_id uuid default null
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  before_position double precision;
  previous_position double precision;
  next_position double precision;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or p_task_id is null
     or p_urgency is null
     or p_urgency not in (
       'today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'someday'
     )
     or p_before_task_id = p_task_id then
    raise exception 'Invalid CRM move input' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tasks
    where id = p_task_id
      and user_id = p_user_id
      and completed_at is null
  ) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id || ':crm:' || p_urgency, 0)
  );

  if p_before_task_id is null then
    select coalesce(max(board_position), 0) + 1024
    into next_position
    from public.tasks
    where user_id = p_user_id
      and urgency = p_urgency
      and completed_at is null
      and id <> p_task_id;
  else
    select board_position
    into before_position
    from public.tasks
    where id = p_before_task_id
      and user_id = p_user_id
      and urgency = p_urgency
      and completed_at is null;

    if before_position is null then
      raise exception 'CRM move anchor was not found' using errcode = '22023';
    end if;

    select max(board_position)
    into previous_position
    from public.tasks
    where user_id = p_user_id
      and urgency = p_urgency
      and completed_at is null
      and id <> p_task_id
      and board_position < before_position;

    next_position := case
      when previous_position is null then before_position - 1024
      else (previous_position + before_position) / 2
    end;

    if previous_position is not null
       and before_position - previous_position < 0.000001 then
      with ordered as (
        select
          id,
          row_number() over (order by board_position, created_at, id)::double precision * 1024
            as position
        from public.tasks
        where user_id = p_user_id
          and urgency = p_urgency
          and completed_at is null
          and id <> p_task_id
      )
      update public.tasks as task
      set board_position = ordered.position
      from ordered
      where task.id = ordered.id;

      select board_position
      into before_position
      from public.tasks
      where id = p_before_task_id;

      select max(board_position)
      into previous_position
      from public.tasks
      where user_id = p_user_id
        and urgency = p_urgency
        and completed_at is null
        and id <> p_task_id
        and board_position < before_position;

      next_position := case
        when previous_position is null then before_position - 1024
        else (previous_position + before_position) / 2
      end;
    end if;
  end if;

  update public.tasks
  set urgency = p_urgency,
      board_position = next_position
  where id = p_task_id
    and user_id = p_user_id
    and completed_at is null;

  return found;
end;
$function$;

revoke execute on function public.create_crm_task(
  text, uuid, text, text, text, text, text, boolean,
  double precision, integer, text[], uuid
) from public, anon, authenticated;
revoke execute on function public.update_crm_task(
  text, uuid, text, text, text, text, text, boolean,
  double precision, integer, text[], uuid
) from public, anon, authenticated;
revoke execute on function public.move_crm_task(
  text, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.create_crm_task(
  text, uuid, text, text, text, text, text, boolean,
  double precision, integer, text[], uuid
) to service_role;
grant execute on function public.update_crm_task(
  text, uuid, text, text, text, text, text, boolean,
  double precision, integer, text[], uuid
) to service_role;
grant execute on function public.move_crm_task(
  text, uuid, text, uuid
) to service_role;

commit;
