begin;

create or replace function public.set_journal_mood(
  p_user_id text,
  p_log_date date,
  p_mood text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  daily_log_id uuid;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128
     or p_log_date is null
     or p_log_date < date '2000-01-01'
     or p_log_date > date '2100-12-31'
     or p_mood is null
     or p_mood not in ('1', '2', '3', '4', '5') then
    raise exception 'Invalid journal mood input' using errcode = '22023';
  end if;

  insert into public.daily_logs as daily_log (user_id, log_date, mood, notes)
  values (p_user_id, p_log_date, p_mood, '{}'::jsonb)
  on conflict (user_id, log_date) do update
  set mood = excluded.mood
  returning id into daily_log_id;

  return daily_log_id;
end;
$function$;

create or replace function public.save_journal_daily_entry(
  p_user_id text,
  p_log_date date,
  p_local_time text,
  p_text text
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
  journal_state jsonb;
  daily_entry jsonb;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128
     or p_log_date is null
     or p_log_date < date '2000-01-01'
     or p_log_date > date '2100-12-31'
     or p_local_time is null
     or p_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or p_text is null
     or length(btrim(p_text)) < 1
     or length(p_text) > 20000 then
    raise exception 'Invalid journal entry input' using errcode = '22023';
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

  journal_state := case
    when jsonb_typeof(daily_notes -> 'journal') = 'object'
      then daily_notes -> 'journal'
    else '{}'::jsonb
  end;

  daily_entry := pg_catalog.jsonb_build_object(
    'id', daily_log_id,
    't', p_local_time,
    'text', btrim(p_text),
    'source', 'web',
    'updated_at', now()
  );

  update public.daily_logs
  set notes = pg_catalog.jsonb_set(
    daily_notes,
    '{journal}',
    journal_state || pg_catalog.jsonb_build_object('daily_entry', daily_entry),
    true
  )
  where id = daily_log_id;

  return daily_log_id;
end;
$function$;

revoke execute on function public.set_journal_mood(
  text, date, text
) from public, anon, authenticated;
revoke execute on function public.save_journal_daily_entry(
  text, date, text, text
) from public, anon, authenticated;

grant execute on function public.set_journal_mood(
  text, date, text
) to service_role;
grant execute on function public.save_journal_daily_entry(
  text, date, text, text
) to service_role;

commit;
