begin;

create table if not exists public.weekly_insights (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  week_start date not null,
  week_end date not null,
  summary text not null,
  highlights jsonb not null default '[]'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  provider text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_insights_user_id_check
    check (length(btrim(user_id)) between 1 and 128),
  constraint weekly_insights_week_range_check
    check (week_end = week_start + 6),
  constraint weekly_insights_summary_check
    check (length(btrim(summary)) between 1 and 4000),
  constraint weekly_insights_highlights_array_check
    check (
      jsonb_typeof(highlights) = 'array'
      and jsonb_array_length(highlights) <= 8
    ),
  constraint weekly_insights_patterns_array_check
    check (
      jsonb_typeof(patterns) = 'array'
      and jsonb_array_length(patterns) <= 8
    ),
  constraint weekly_insights_recommendations_array_check
    check (
      jsonb_typeof(recommendations) = 'array'
      and jsonb_array_length(recommendations) <= 8
    ),
  constraint weekly_insights_metrics_object_check
    check (jsonb_typeof(metrics) = 'object'),
  constraint weekly_insights_provider_check
    check (provider in ('anthropic', 'openai', 'extractive')),
  constraint weekly_insights_user_week_unique
    unique (user_id, week_start)
);

create index if not exists weekly_insights_user_week_idx
  on public.weekly_insights (user_id, week_start desc);

drop trigger if exists weekly_insights_set_updated_at
  on public.weekly_insights;
create trigger weekly_insights_set_updated_at
before update on public.weekly_insights
for each row execute function public.set_updated_at();

alter table public.weekly_insights enable row level security;
revoke all privileges on table public.weekly_insights
from anon, authenticated;
grant select, insert, update on table public.weekly_insights
to service_role;

create or replace function public.upsert_weekly_insight(
  p_user_id text,
  p_week_start date,
  p_week_end date,
  p_summary text,
  p_highlights jsonb,
  p_patterns jsonb,
  p_recommendations jsonb,
  p_metrics jsonb,
  p_provider text,
  p_generated_at timestamptz
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  insight_id uuid;
  list_value jsonb;
  list_item jsonb;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) not between 1 and 128 then
    raise exception 'Invalid weekly insight user id' using errcode = '22023';
  end if;

  if p_week_start is null
     or p_week_end is null
     or p_week_end <> p_week_start + 6
     or p_week_start < date '2000-01-01'
     or p_week_end > date '2100-12-31' then
    raise exception 'Invalid weekly insight date range' using errcode = '22023';
  end if;

  if p_summary is null
     or length(btrim(p_summary)) not between 1 and 4000 then
    raise exception 'Invalid weekly insight summary' using errcode = '22023';
  end if;

  foreach list_value in array array[p_highlights, p_patterns, p_recommendations]
  loop
    if list_value is null
       or jsonb_typeof(list_value) <> 'array'
       or jsonb_array_length(list_value) > 8 then
      raise exception 'Invalid weekly insight list' using errcode = '22023';
    end if;

    for list_item in
      select value from pg_catalog.jsonb_array_elements(list_value)
    loop
      if jsonb_typeof(list_item) <> 'string'
         or length(btrim(list_item #>> '{}')) not between 1 and 500 then
        raise exception 'Invalid weekly insight list item' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if p_metrics is null or jsonb_typeof(p_metrics) <> 'object' then
    raise exception 'Invalid weekly insight metrics' using errcode = '22023';
  end if;

  if p_provider not in ('anthropic', 'openai', 'extractive') then
    raise exception 'Invalid weekly insight provider' using errcode = '22023';
  end if;

  if p_generated_at is null
     or p_generated_at > now() + interval '5 minutes'
     or p_generated_at < now() - interval '30 days' then
    raise exception 'Invalid weekly insight generation timestamp'
      using errcode = '22023';
  end if;

  insert into public.weekly_insights as weekly_insight (
    user_id,
    week_start,
    week_end,
    summary,
    highlights,
    patterns,
    recommendations,
    metrics,
    provider,
    generated_at
  ) values (
    p_user_id,
    p_week_start,
    p_week_end,
    btrim(p_summary),
    p_highlights,
    p_patterns,
    p_recommendations,
    p_metrics,
    p_provider,
    p_generated_at
  )
  on conflict (user_id, week_start) do update
  set
    week_end = excluded.week_end,
    summary = excluded.summary,
    highlights = excluded.highlights,
    patterns = excluded.patterns,
    recommendations = excluded.recommendations,
    metrics = excluded.metrics,
    provider = excluded.provider,
    generated_at = excluded.generated_at
  returning id into insight_id;

  return insight_id;
end;
$function$;

revoke execute on function public.upsert_weekly_insight(
  text,
  date,
  date,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_weekly_insight(
  text,
  date,
  date,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  timestamptz
) to service_role;

commit;
