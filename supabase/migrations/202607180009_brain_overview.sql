begin;

create index if not exists memory_chunks_user_sphere_source_idx
  on public.memory_chunks (
    user_id,
    ((metadata ->> 'sphere')),
    source_type,
    source_key,
    chunk_index
  );

create or replace function public.brain_sphere_stats(
  p_user_id text
)
returns table (
  sphere text,
  open_task_count bigint,
  note_count bigint,
  obsidian_note_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with spheres(sphere) as (
    values
      ('work'),
      ('finance'),
      ('health'),
      ('relationships'),
      ('growth'),
      ('mind'),
      ('personal'),
      ('content'),
      ('spirituality')
  ),
  task_counts as (
    select tasks.sphere, count(*)::bigint as task_count
    from public.tasks
    where tasks.user_id = p_user_id
      and tasks.completed_at is null
      and tasks.sphere is not null
    group by tasks.sphere
  ),
  note_counts as (
    select
      memory_chunks.metadata ->> 'sphere' as sphere,
      count(distinct (
        memory_chunks.source_type || ':' || memory_chunks.source_key
      ))::bigint as note_count,
      count(distinct (
        memory_chunks.source_type || ':' || memory_chunks.source_key
      )) filter (
        where memory_chunks.source_type = 'obsidian'
      )::bigint as obsidian_note_count
    from public.memory_chunks
    where memory_chunks.user_id = p_user_id
      and memory_chunks.metadata ->> 'sphere' is not null
      and (
        memory_chunks.source_type = 'obsidian'
        or memory_chunks.metadata ->> 'kind' in (
          'note', 'idea', 'decision', 'journal', 'content', 'person'
        )
      )
    group by memory_chunks.metadata ->> 'sphere'
  )
  select
    spheres.sphere,
    coalesce(task_counts.task_count, 0),
    coalesce(note_counts.note_count, 0),
    coalesce(note_counts.obsidian_note_count, 0)
  from spheres
  left join task_counts using (sphere)
  left join note_counts using (sphere)
  order by spheres.sphere;
$function$;

revoke execute on function public.brain_sphere_stats(text)
from public, anon, authenticated;

grant execute on function public.brain_sphere_stats(text)
to service_role;

commit;
