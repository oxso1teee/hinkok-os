begin;

-- [P0-PERF-02] The CRM board's actual read query (src/lib/crm/data.ts) fetches
-- all active tasks for a user ordered by (board_position, created_at) without
-- filtering by urgency. The existing tasks_user_board_idx and
-- tasks_user_id_active_idx both have urgency as their second column, which
-- this query never filters on, so neither index can serve it — confirmed via
-- EXPLAIN against 8,000 synthetic rows: a plain Seq Scan + Sort, cost ~655.
-- This index matches the query's actual filter/order shape exactly.
create index if not exists tasks_user_active_position_idx
  on public.tasks (user_id, board_position, created_at)
  where completed_at is null;

-- The CRM archive view (same file) fetches completed tasks ordered by
-- completed_at desc. No existing index covers completed tasks at all (both
-- existing partial indexes are `where completed_at is null`), so this was an
-- unconditional Seq Scan regardless of table size.
create index if not exists tasks_user_completed_at_idx
  on public.tasks (user_id, completed_at desc)
  where completed_at is not null;

commit;
