begin;

create schema if not exists extensions;

create extension if not exists vector
with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'audit_log is append-only and cannot be updated or deleted'
    using errcode = '55000';
  return null;
end;
$function$;

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  kind text not null default 'person'
    constraint entities_kind_check
    check (kind in ('person', 'org', 'project', 'topic')),
  metadata jsonb not null default '{}'::jsonb
    constraint entities_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint entities_user_id_not_blank_check
    check (length(btrim(user_id)) > 0),
  constraint entities_name_not_blank_check
    check (length(btrim(name)) > 0)
);

create index if not exists entities_user_id_idx
  on public.entities (user_id);
create index if not exists entities_user_id_kind_idx
  on public.entities (user_id, kind);
create index if not exists entities_user_id_name_idx
  on public.entities (user_id, name);

create table if not exists public.raw_captures (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text not null default 'web'
    constraint raw_captures_source_check
    check (source in ('telegram', 'web', 'api')),
  raw_text text not null,
  audio_url text,
  classification jsonb not null default '{}'::jsonb
    constraint raw_captures_classification_object_check
    check (jsonb_typeof(classification) = 'object'),
  llm_source text
    constraint raw_captures_llm_source_check
    check (llm_source is null or llm_source in ('anthropic', 'openai', 'regex')),
  routed_to text,
  routed_id uuid,
  created_at timestamptz not null default now(),
  constraint raw_captures_user_id_not_blank_check
    check (length(btrim(user_id)) > 0),
  constraint raw_captures_raw_text_not_blank_check
    check (length(btrim(raw_text)) > 0)
);

create index if not exists raw_captures_user_id_created_at_idx
  on public.raw_captures (user_id, created_at desc);
create index if not exists raw_captures_kind_idx
  on public.raw_captures ((classification ->> 'kind'));
create index if not exists raw_captures_user_id_kind_idx
  on public.raw_captures (user_id, (classification ->> 'kind'));
create index if not exists raw_captures_routed_resource_idx
  on public.raw_captures (routed_to, routed_id)
  where routed_to is not null and routed_id is not null;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  urgency text not null default 'this_week'
    constraint tasks_urgency_check
    check (urgency in (
      'today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'someday'
    )),
  category text not null default 'personal'
    constraint tasks_category_check
    check (category in ('work', 'content', 'health', 'finance', 'personal')),
  sphere text
    constraint tasks_sphere_check
    check (sphere is null or sphere in (
      'work', 'finance', 'health', 'relationships', 'growth', 'mind',
      'personal', 'content', 'spirituality'
    )),
  key boolean not null default false,
  priority_score double precision not null default 0,
  time_estimate_min integer
    constraint tasks_time_estimate_check
    check (time_estimate_min is null or time_estimate_min > 0),
  tags text[] not null default '{}'::text[],
  due_date date,
  owner text,
  entity_id uuid
    references public.entities (id)
    on update cascade
    on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_user_id_not_blank_check
    check (length(btrim(user_id)) > 0),
  constraint tasks_title_not_blank_check
    check (length(btrim(title)) > 0)
);

create index if not exists tasks_user_id_created_at_idx
  on public.tasks (user_id, created_at desc);
create index if not exists tasks_user_id_urgency_idx
  on public.tasks (user_id, urgency);
create index if not exists tasks_user_id_category_idx
  on public.tasks (user_id, category);
create index if not exists tasks_user_id_sphere_idx
  on public.tasks (user_id, sphere) where sphere is not null;
create index if not exists tasks_user_id_due_date_idx
  on public.tasks (user_id, due_date) where due_date is not null;
create index if not exists tasks_user_id_active_idx
  on public.tasks (
    user_id, urgency, key desc, priority_score desc, created_at desc
  ) where completed_at is null;
create index if not exists tasks_entity_id_idx
  on public.tasks (entity_id) where entity_id is not null;
create index if not exists tasks_tags_gin_idx
  on public.tasks using gin (tags);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  log_date date not null,
  notes jsonb not null default '{}'::jsonb
    constraint daily_logs_notes_object_check
    check (jsonb_typeof(notes) = 'object'),
  mood text
    constraint daily_logs_mood_check
    check (mood is null or mood in ('1', '2', '3', '4', '5')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_logs_user_id_not_blank_check
    check (length(btrim(user_id)) > 0),
  constraint daily_logs_user_date_unique unique (user_id, log_date)
);

create index if not exists daily_logs_user_id_log_date_idx
  on public.daily_logs (user_id, log_date desc);
create index if not exists daily_logs_notes_gin_idx
  on public.daily_logs using gin (notes);

drop trigger if exists daily_logs_set_updated_at on public.daily_logs;
create trigger daily_logs_set_updated_at
before update on public.daily_logs
for each row execute function public.set_updated_at();

create table if not exists public.memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_type text not null,
  source_id uuid,
  text text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  constraint memory_chunks_user_id_not_blank_check
    check (length(btrim(user_id)) > 0),
  constraint memory_chunks_source_type_not_blank_check
    check (length(btrim(source_type)) > 0),
  constraint memory_chunks_text_not_blank_check
    check (length(btrim(text)) > 0)
);

create index if not exists memory_chunks_user_id_created_at_idx
  on public.memory_chunks (user_id, created_at desc);
create index if not exists memory_chunks_source_idx
  on public.memory_chunks (user_id, source_type, source_id);
create index if not exists memory_chunks_embedding_idx
  on public.memory_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb
    constraint audit_log_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint audit_log_user_id_not_blank_check
    check (length(btrim(user_id)) > 0),
  constraint audit_log_action_not_blank_check
    check (length(btrim(action)) > 0)
);

create index if not exists audit_log_user_id_created_at_idx
  on public.audit_log (user_id, created_at desc);
create index if not exists audit_log_resource_idx
  on public.audit_log (resource_type, resource_id)
  where resource_type is not null and resource_id is not null;
create index if not exists audit_log_action_idx
  on public.audit_log (user_id, action, created_at desc);

drop trigger if exists audit_log_prevent_mutation on public.audit_log;
create trigger audit_log_prevent_mutation
before update or delete on public.audit_log
for each row execute function public.prevent_audit_log_mutation();

create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text,
  ok boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_created_at_idx
  on public.login_attempts (ip, created_at desc);
create index if not exists login_attempts_failed_created_at_idx
  on public.login_attempts (created_at desc) where ok = false;

create table if not exists public.rate_limit (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now(),
  constraint rate_limit_bucket_not_blank_check
    check (length(btrim(bucket)) > 0)
);

create index if not exists rate_limit_bucket_created_at_idx
  on public.rate_limit (bucket, created_at desc);
create index if not exists rate_limit_created_at_idx
  on public.rate_limit (created_at);

create table if not exists public.kv_cache (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  constraint kv_cache_key_not_blank_check
    check (length(btrim(key)) > 0)
);

create index if not exists kv_cache_updated_at_idx
  on public.kv_cache (updated_at desc);

drop trigger if exists kv_cache_set_updated_at on public.kv_cache;
create trigger kv_cache_set_updated_at
before update on public.kv_cache
for each row execute function public.set_updated_at();

create or replace function public.match_memory_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 20,
  filter_user_id text default null
)
returns table (
  id uuid,
  user_id text,
  source_type text,
  source_id uuid,
  text text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    mc.id,
    mc.user_id,
    mc.source_type,
    mc.source_id,
    mc.text,
    mc.created_at,
    (1.0 - (mc.embedding operator(extensions.<=>) query_embedding))::double precision
      as similarity
  from public.memory_chunks as mc
  where mc.embedding is not null
    and query_embedding is not null
    and (filter_user_id is null or mc.user_id = filter_user_id)
  order by mc.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(coalesce(match_count, 20), 0), 100);
$function$;

alter table public.entities enable row level security;
alter table public.raw_captures enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_logs enable row level security;
alter table public.memory_chunks enable row level security;
alter table public.audit_log enable row level security;
alter table public.login_attempts enable row level security;
alter table public.rate_limit enable row level security;
alter table public.kv_cache enable row level security;

revoke all privileges
on table
  public.entities,
  public.raw_captures,
  public.tasks,
  public.daily_logs,
  public.memory_chunks,
  public.audit_log,
  public.login_attempts,
  public.rate_limit,
  public.kv_cache
from anon, authenticated;

grant select, insert, update, delete
on table
  public.entities,
  public.raw_captures,
  public.tasks,
  public.daily_logs,
  public.memory_chunks,
  public.login_attempts,
  public.rate_limit,
  public.kv_cache
to service_role;

grant select, insert on table public.audit_log to service_role;

revoke all privileges on sequence public.rate_limit_id_seq
from anon, authenticated;
grant usage, select on sequence public.rate_limit_id_seq to service_role;

revoke execute on function public.set_updated_at()
from public, anon, authenticated;
revoke execute on function public.prevent_audit_log_mutation()
from public, anon, authenticated;
revoke execute on function public.match_memory_chunks(
  extensions.vector,
  integer,
  text
) from public, anon, authenticated;
grant execute on function public.match_memory_chunks(
  extensions.vector,
  integer,
  text
) to service_role;

commit;
