begin;

alter table public.raw_captures
  add column idempotency_key text,
  add column processing_status text not null default 'stored',
  add column processing_error text,
  add column processed_at timestamptz;

alter table public.raw_captures
  add constraint raw_captures_idempotency_key_check
    check (
      idempotency_key is null
      or idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    ),
  add constraint raw_captures_processing_status_check
    check (processing_status in ('stored', 'processed', 'degraded')),
  add constraint raw_captures_processing_error_check
    check (
      processing_error is null
      or length(processing_error) between 1 and 128
    );

create unique index if not exists raw_captures_idempotency_key_unique_idx
  on public.raw_captures (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists raw_captures_processing_status_idx
  on public.raw_captures (user_id, processing_status, created_at desc);

create or replace function public.route_capture(
  p_user_id text,
  p_source text,
  p_raw_text text,
  p_classification jsonb,
  p_llm_source text,
  p_idempotency_key text,
  p_local_date date,
  p_local_time text
)
returns table (
  capture_id uuid,
  capture_classification jsonb,
  classifier_source text,
  route_name text,
  route_id uuid,
  was_created boolean,
  processing_status text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  new_capture_id uuid;
  new_route_name text;
  new_route_id uuid;
  capture_kind text;
  task_category text;
  task_priority double precision;
  daily_log_id uuid;
  journal_entry jsonb;
  meal_entry jsonb;
begin
  if p_user_id is null or length(btrim(p_user_id)) = 0 then
    raise exception 'Invalid user id' using errcode = '22023';
  end if;

  if p_source is null or p_source not in ('telegram', 'web', 'api') then
    raise exception 'Invalid capture source' using errcode = '22023';
  end if;

  if p_raw_text is null
     or length(btrim(p_raw_text)) = 0
     or length(p_raw_text) > 50000 then
    raise exception 'Invalid capture text' using errcode = '22023';
  end if;

  if p_classification is null
     or pg_catalog.jsonb_typeof(p_classification) <> 'object' then
    raise exception 'Invalid classification' using errcode = '22023';
  end if;

  if p_llm_source is null
     or p_llm_source not in ('anthropic', 'openai', 'regex') then
    raise exception 'Invalid classifier source' using errcode = '22023';
  end if;

  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  if p_local_date is null
     or p_local_time is null
     or p_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Invalid local capture time' using errcode = '22023';
  end if;

  capture_kind := p_classification ->> 'kind';

  if capture_kind is null or capture_kind not in (
    'task', 'event', 'note', 'idea', 'decision', 'journal', 'content',
    'person', 'meal'
  ) then
    raise exception 'Invalid capture kind' using errcode = '22023';
  end if;

  insert into public.raw_captures (
    user_id,
    source,
    raw_text,
    classification,
    llm_source,
    idempotency_key,
    processing_status
  )
  values (
    p_user_id,
    p_source,
    p_raw_text,
    p_classification,
    p_llm_source,
    p_idempotency_key,
    'stored'
  )
  on conflict (user_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into new_capture_id;

  if new_capture_id is null then
    return query
    select
      existing.id,
      existing.classification,
      existing.llm_source,
      existing.routed_to,
      existing.routed_id,
      false,
      existing.processing_status
    from public.raw_captures as existing
    where existing.user_id = p_user_id
      and existing.idempotency_key = p_idempotency_key
    limit 1;

    return;
  end if;

  if capture_kind = 'task' then
    task_category := case p_classification ->> 'sphere'
      when 'work' then 'work'
      when 'content' then 'content'
      when 'health' then 'health'
      when 'finance' then 'finance'
      else 'personal'
    end;

    task_priority := case p_classification ->> 'urgency'
      when 'today' then 100
      when 'tomorrow' then 80
      when 'this_week' then 60
      when 'next_week' then 40
      when 'this_month' then 20
      else 0
    end;

    if coalesce((p_classification ->> 'key')::boolean, false) then
      task_priority := task_priority + 25;
    end if;

    insert into public.tasks (
      user_id,
      title,
      description,
      urgency,
      category,
      sphere,
      key,
      priority_score,
      time_estimate_min,
      tags,
      entity_id
    )
    values (
      p_user_id,
      p_classification ->> 'title',
      p_classification ->> 'summary',
      p_classification ->> 'urgency',
      task_category,
      p_classification ->> 'sphere',
      coalesce((p_classification ->> 'key')::boolean, false),
      task_priority,
      nullif(p_classification ->> 'time_estimate_min', '')::integer,
      array(
        select pg_catalog.jsonb_array_elements_text(
          p_classification -> 'tags'
        )
      ),
      nullif(p_classification ->> 'entity_id', '')::uuid
    )
    returning id into new_route_id;

    new_route_name := 'tasks';
  elsif capture_kind in ('journal', 'meal') then
    insert into public.daily_logs (user_id, log_date, notes)
    values (p_user_id, p_local_date, '{}'::jsonb)
    on conflict (user_id, log_date) do nothing;

    select log.id
    into daily_log_id
    from public.daily_logs as log
    where log.user_id = p_user_id
      and log.log_date = p_local_date
    for update;

    if capture_kind = 'journal' then
      journal_entry := pg_catalog.jsonb_build_object(
        'id', new_capture_id,
        't', p_local_time,
        'text', p_raw_text,
        'source', p_source,
        'title', p_classification ->> 'title'
      );

      update public.daily_logs
      set notes = pg_catalog.jsonb_set(
        notes,
        '{journal}',
        coalesce(notes -> 'journal', '{}'::jsonb)
          || pg_catalog.jsonb_build_object(
            'entries',
            coalesce(notes #> '{journal,entries}', '[]'::jsonb)
              || pg_catalog.jsonb_build_array(journal_entry)
          ),
        true
      )
      where id = daily_log_id;
    else
      meal_entry := pg_catalog.jsonb_build_object(
        'id', new_capture_id,
        't', p_local_time,
        'n', p_classification ->> 'title',
        'kcal', null,
        'p', null,
        'c', null,
        'f', null,
        'estimated', true,
        'source', p_source
      );

      update public.daily_logs
      set notes = pg_catalog.jsonb_set(
        notes,
        '{nutrition}',
        coalesce(notes -> 'nutrition', '{}'::jsonb)
          || pg_catalog.jsonb_build_object(
            'meals',
            coalesce(notes #> '{nutrition,meals}', '[]'::jsonb)
              || pg_catalog.jsonb_build_array(meal_entry)
          ),
        true
      )
      where id = daily_log_id;
    end if;

    new_route_name := 'daily_logs';
    new_route_id := daily_log_id;
  elsif capture_kind = 'event' then
    new_route_name := 'calendar_pending';
    new_route_id := new_capture_id;
  else
    new_route_name := 'raw_captures';
    new_route_id := new_capture_id;
  end if;

  update public.raw_captures
  set
    routed_to = new_route_name,
    routed_id = new_route_id
  where id = new_capture_id;

  return query
  select
    new_capture_id,
    p_classification,
    p_llm_source,
    new_route_name,
    new_route_id,
    true,
    'stored'::text;
end;
$function$;

revoke execute on function public.route_capture(
  text,
  text,
  text,
  jsonb,
  text,
  text,
  date,
  text
) from public, anon, authenticated;

grant execute on function public.route_capture(
  text,
  text,
  text,
  jsonb,
  text,
  text,
  date,
  text
) to service_role;

commit;
