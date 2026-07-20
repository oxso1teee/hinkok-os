begin;

alter table public.memory_chunks
  add column source_key text,
  add column chunk_index integer not null default 0,
  add column content_hash text,
  add column embedding_model text not null default 'text-embedding-3-small',
  add column metadata jsonb not null default '{}'::jsonb,
  add column updated_at timestamptz not null default now();

with ranked_chunks as (
  select
    id,
    coalesce(source_id::text, id::text) as source_key_value,
    (
      row_number() over (
        partition by
          user_id,
          source_type,
          coalesce(source_id::text, id::text)
        order by created_at, id
      ) - 1
    )::integer as chunk_index_value
  from public.memory_chunks
)
update public.memory_chunks as memory_chunk
set
  source_key = ranked_chunks.source_key_value,
  chunk_index = ranked_chunks.chunk_index_value,
  content_hash = md5(memory_chunk.text)
from ranked_chunks
where memory_chunk.id = ranked_chunks.id;

alter table public.memory_chunks
  alter column source_key set not null,
  alter column content_hash set not null;

alter table public.memory_chunks
  add constraint memory_chunks_source_key_not_blank_check
    check (length(btrim(source_key)) > 0),
  add constraint memory_chunks_chunk_index_check
    check (chunk_index >= 0),
  add constraint memory_chunks_content_hash_check
    check (length(content_hash) between 32 and 128),
  add constraint memory_chunks_embedding_model_not_blank_check
    check (length(btrim(embedding_model)) > 0),
  add constraint memory_chunks_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  add constraint memory_chunks_source_chunk_unique
    unique (user_id, source_type, source_key, chunk_index);

create index if not exists memory_chunks_source_key_idx
  on public.memory_chunks (user_id, source_type, source_key);

drop trigger if exists memory_chunks_set_updated_at
  on public.memory_chunks;

create trigger memory_chunks_set_updated_at
before update on public.memory_chunks
for each row
execute function public.set_updated_at();

drop function if exists public.match_memory_chunks(
  extensions.vector,
  integer,
  text
);

create function public.match_memory_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 20,
  filter_user_id text default null
)
returns table (
  id uuid,
  user_id text,
  source_type text,
  source_id uuid,
  source_key text,
  chunk_index integer,
  text text,
  metadata jsonb,
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
    mc.source_key,
    mc.chunk_index,
    mc.text,
    mc.metadata,
    mc.created_at,
    (
      1.0
      - (
        mc.embedding
        operator(extensions.<=>)
        query_embedding
      )
    )::double precision as similarity
  from public.memory_chunks as mc
  where mc.embedding is not null
    and query_embedding is not null
    and (
      filter_user_id is null
      or mc.user_id = filter_user_id
    )
  order by
    mc.embedding
    operator(extensions.<=>)
    query_embedding
  limit least(
    greatest(coalesce(match_count, 20), 0),
    100
  );
$function$;

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

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  request_count integer;
begin
  if p_bucket is null
     or length(btrim(p_bucket)) = 0
     or length(p_bucket) > 256 then
    raise exception 'Invalid rate-limit bucket'
      using errcode = '22023';
  end if;

  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit window'
      using errcode = '22023';
  end if;

  if p_max_requests < 1 or p_max_requests > 10000 then
    raise exception 'Invalid rate-limit request count'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_bucket, 0)
  );

  delete from public.rate_limit
  where bucket = p_bucket
    and created_at < (
      now() - pg_catalog.make_interval(secs => p_window_seconds)
    );

  select count(*)::integer
  into request_count
  from public.rate_limit
  where bucket = p_bucket
    and created_at >= (
      now() - pg_catalog.make_interval(secs => p_window_seconds)
    );

  if request_count >= p_max_requests then
    return false;
  end if;

  insert into public.rate_limit (bucket)
  values (p_bucket);

  return true;
end;
$function$;

revoke execute on function public.consume_rate_limit(
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.consume_rate_limit(
  text,
  integer,
  integer
) to service_role;

commit;
