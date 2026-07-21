# HinkoK OS: operations monitoring and recovery

The private `/operations` page is the first place to inspect scheduled
integration health. It reads technical run metadata from Supabase and never
stores note text, transaction contents, prompts, model output or secret values.

## Database migration

Apply `supabase/migrations/202607180012_operations_monitoring.sql` before
deploying this version. The migration creates:

- `system_job_runs`, protected by deny-all RLS for `anon` and `authenticated`;
- `begin_system_job`, executable only by `service_role`;
- `finish_system_job`, executable only by `service_role`;
- indexes for the latest per-job state and active-run recovery.

Completed run metadata is retained for 90 days. Cleanup runs when a new job is
claimed. This is operational metadata retention, not application-content
retention.

## Concurrency and duplicate delivery

Each job claim acquires a PostgreSQL transaction advisory lock derived from the
configured user and fixed job name. While holding that lock, the function:

1. marks a `running` record older than ten minutes as `abandoned`;
2. refuses a claim while a non-stale run is active;
3. refuses another claim within five minutes of the latest start;
4. inserts the new `running` record atomically.

A refused duplicate returns HTTP 200 with `skipped: "running_or_recent"`. This
prevents duplicate delivery from appearing as a failed cron invocation. The
underlying jobs still reconcile by stable identifiers or atomic upserts, so a
later invocation can safely catch up after a missed delivery.

## Status meanings

| Status | Meaning | Operator action |
|---|---|---|
| `healthy` | Latest run succeeded inside its expected window | None |
| `running` | A current claim is active | Wait up to ten minutes |
| `awaiting first run` | Configured but no run has been recorded | Run once manually or wait for cron |
| `overdue` | Last success is older than the expected window | Inspect Vercel Cron and run manually |
| `attention` | Latest run failed or was recovered as abandoned | Inspect Vercel logs, correct the dependency, retry |
| `not configured` | Required environment variables are incomplete | Correct Vercel environment and redeploy |
| `status unavailable` | Supabase query or migration is unavailable | Verify Supabase and migration 012 |

Daily jobs become overdue after 36 hours. The weekly insight becomes overdue
after eight days. These windows tolerate Vercel Hobby's within-the-hour cron
delivery without masking a missed day.

## Safe manual recovery

1. Open `/operations` in an authenticated browser session.
2. Identify the first job marked `attention` or `overdue`.
3. Inspect Vercel runtime logs for that endpoint. Do not paste secrets or source
   content into issue trackers.
4. Correct the upstream configuration or outage.
5. Press **RUN NOW** once. The endpoint enforces same-origin session validation,
   a five-minute database rate limit and the atomic job claim.
6. Refresh the page and confirm a new `succeeded` run.

Trusted API clients can use the existing `x-api-secret` manual POST endpoints.
The API secret must be supplied through a protected environment or secret
manager, never embedded in a URL or command history.

## Deployment rollback

If a new application deployment is unhealthy:

1. use Vercel Instant Rollback to restore the last verified application build;
2. check Vercel Cron Jobs separately because an Instant Rollback does not
   automatically restore cron configuration;
3. do not attempt to reverse migration 012: it is additive and compatible with
   earlier application code;
4. run the passive and authenticated deployment smoke tests;
5. open `/operations` and verify the next execution of all configured jobs.

Database migrations remain append-only. Any future incompatible schema change
must use a forward-fix migration instead of destructive rollback SQL.

## Obsidian sync performance model (`[P0-OBS-01]`)

`syncObsidianMemory()` (`src/lib/obsidian/sync.ts`) is a real incremental sync
by git blob SHA, not an approximation: it compares every note's current blob
SHA against the SHA stored from the previous run and only downloads and
re-embeds notes whose SHA changed. The expected cost below is derived from
reading that code path and the GitHub/OpenAI API shapes it calls — **it is not
a measured production run**. This session has neither a real `GITHUB_TOKEN`
against a populated Obsidian repository nor a working `OPENAI_API_KEY` (the
local dev environment uses placeholder values throughout, as already noted for
every other AI-dependent feature in `docs/CHANGELOG_AGENT.md`), so a live
500+-note timing run could not be produced here. Re-running this measurement
with real credentials against a real vault is a concrete follow-up.

**API call shape** (confirmed by reading `src/lib/obsidian/sync.ts` and
`src/lib/obsidian/github.ts`):

| Step | Calls, full sync (500 notes, all changed) | Calls, incremental sync (5 notes changed) |
|---|---|---|
| GitHub tree fetch | 1 (`GET .../git/trees/{branch}?recursive=1`, whole repo in one response) | 1 (same call — SHA comparison happens locally after this) |
| GitHub blob fetch | 500, concurrency 4 (`INDEX_CONCURRENCY`) | 5, concurrency 4 |
| OpenAI embeddings | 500, one call per note (chunks within a note batch into a single `createEmbeddings` call; concurrency 4) | 5 |
| Supabase reads/writes | 1 read + 1 upsert per changed note for `memory_chunks`, plus 1 `kv_cache` read/write for sync state | same, scaled to 5 |

**Expected wall-clock time** (reasoned from typical GitHub REST and OpenAI
embeddings API latency, not measured): with `INDEX_CONCURRENCY = 4` and each
changed-note round trip (GitHub blob fetch + OpenAI embed + Supabase write)
landing somewhere in the 300–800ms range serially, a full sync of 500 changed
notes is expected to take roughly `500 / 4 * ~0.5s ≈ 60s`, plus the single
upfront tree fetch (typically under 1s for a repo this size). An incremental
sync touching a handful of notes after a normal editing session is expected to
complete in a few seconds, dominated by the same fixed 1-tree-fetch cost. The
GitHub Trees API response for a repository with 500 markdown files is well
under both of GitHub's truncation limits (100,000 entries, 7MB response), so
no pagination or truncation handling is needed at this scale.

**Cost**: a full 500-note resync consumes 500 OpenAI embedding calls (each
note's text run through `text-embedding-3-small` — priced per token, not per
call, so cost scales with total vault word count rather than note count) and
500 GitHub REST API calls, well inside GitHub's authenticated per-hour rate
limit (5,000 requests/hour for a personal access token). An incremental sync
after normal day-to-day editing (single-digit note count) costs a small
fraction of this and is not a meaningful driver of either API bill.

If a future session has access to the real `OBSIDIAN_REPO`, `GITHUB_TOKEN` and
a working `OPENAI_API_KEY`, replace this section's estimates with an actual
measured `changedCount`, `embeddedCount`, and wall-clock duration from a real
full sync followed by a real incremental sync (`ObsidianSyncResult` already
returns all of these fields — no new instrumentation is needed, only a real
run against a populated vault).

## Cold start (`[P0-PERF-01]`)

Measured against the real production deployment
(`https://hinkok-os-phi.vercel.app`), comparing the first request after a
period of idleness against immediate follow-up requests to the same route
(a standard proxy for cold vs. warm serverless invocation, since Vercel does
not otherwise expose per-request cold-start timing without dashboard access):

| Route | First hit | Warm hits | Delta |
|---|---|---|---|
| `/` | 1.48s | 0.99s, 0.62s | ~0.9s |
| `/api/telegram/webhook` (POST) | 1.99s | 0.84s, 0.84s | ~1.15s |
| `/api/cron/sync-calendar` (imports `googleapis`) | 0.67s | 0.60s, 0.86s | no clear gap — this route now receives real Vercel Cron traffic every 15 minutes (see the `[P0-BACKUP-02]` proxy.ts `PUBLIC_PATHS` fix), so it rarely goes fully cold in production |
| `/api/captures` (imports the OpenAI classifier chain) | 0.58s | 0.61s | no clear gap observed in this run |

The clearest, most relevant number is the Telegram webhook: **~1.1–1.2s cold
start**, directly relevant to `[P0-TG-01]`'s concern that Telegram retries
after a timeout, compounding load on a route that was already found to be
under-warmed. Local disk sizes for the three heaviest dependencies confirm
`googleapis` as the largest contributor by far: `googleapis` 204MB,
`openai` 20MB, `@supabase/supabase-js` 8.8MB (`du -sh node_modules/...`) —
consistent with the doc's own flag that `googleapis` is known to be heavy.
Turbopack's per-route compiled server bundles are small (a few KB each; the
actual dependency weight lives in shared chunks, `.next/server/chunks/`,
totaling ~99MB across the whole app after tree-shaking), so there is no
single oversized per-route bundle to trim — the cold-start cost is inherent
to initializing the `googleapis`/`openai`/`@supabase/supabase-js` clients
themselves, not avoidable bundle bloat.

No code change was made for this item: `runtime = "nodejs"` is already set on
every route (required — these SDKs are not Edge-runtime compatible), and a
~1s cold start on a personal single-user app with low request volume is not
worth the complexity of manual bundle-splitting or a keep-warm cron ping.
Documented here as the real measured number the checklist asks for, not
optimized further.

## Database indexes (`[P0-PERF-02]`)

Reviewed all 21 migrations against the query shapes the application code
actually issues (not just the shapes a migration's author assumed at the
time). Every hot path the doc calls out — `user_id + created_at`,
`user_id + sphere_id`, pgvector similarity — already has a matching index;
confirmed with `EXPLAIN` against a synthetic 8,000-row `tasks` table and a
synthetic 3,000-row `memory_chunks` table with real random 1536-dim vectors
(both later deleted), not just by reading `CREATE INDEX` statements.

Two real gaps were found and fixed
(`supabase/migrations/202607210021_task_query_indexes.sql`):

- The CRM board's actual read query (`src/lib/crm/data.ts`) fetches all
  active tasks for a user ordered by `(board_position, created_at)`, with no
  `urgency` filter. Both pre-existing task indexes
  (`tasks_user_board_idx`, `tasks_user_id_active_idx`) have `urgency` as
  their second column, which this query never filters on — confirmed via
  `EXPLAIN` that neither could serve it: a plain Seq Scan + Sort at 8,000
  rows (cost ~655). Added `tasks_user_active_position_idx` on
  `(user_id, board_position, created_at) where completed_at is null`,
  matching the query exactly; re-verified the same query now uses an Index
  Scan (cost ~52).
- The CRM archive view (same file) fetches completed tasks ordered by
  `completed_at desc`. No existing index covered completed tasks at all —
  both existing partial indexes are `where completed_at is null` — so this
  was an unconditional Seq Scan regardless of table size. Added
  `tasks_user_completed_at_idx` on `(user_id, completed_at desc) where
  completed_at is not null`; re-verified an Index Scan is now used (cost
  ~20, down from a Seq Scan with no index to fall back to).

The pgvector HNSW index (`memory_chunks_embedding_idx`) is present and
correctly defined, but at the 3,000-synthetic-row scale tested here
Postgres's planner still preferred a Seq Scan + exact sort over the
approximate HNSW index — this is expected, standard cost-based-planner
behavior for a table this size (HNSW's own overhead isn't yet worth it), not
a sign the index is missing or broken; the planner will switch to it
automatically as the real vault grows, no application change needed.

The Home dashboard's "today" task query (`src/lib/home/data.ts`) uses an
`.or()` across three different columns (`urgency`, `key`, `due_date`), which
cannot be served by a single btree index — left as-is because the result set
is capped at 8 rows and scoped to a single user's active-task count, which
naturally stays small for a personal task manager even over years of use;
adding a covering index here would be speculative optimization without a
realistic scenario where it matters.

## Error tracking (`[P0-OBS2-01]`)

Server-side exceptions are only visible in Vercel's own logs today, after
the fact, with no aggregation or alerting — this is a real gap the checklist
flags. `@sentry/nextjs` is wired in (`sentry.server.config.ts`,
`sentry.edge.config.ts`, `src/instrumentation.ts` exporting `onRequestError`
via Sentry's `captureRequestError`), but is **off by default**: nothing is
sent anywhere until `SENTRY_DSN` is set. Creating a Sentry project (or
self-hosted instance) and obtaining that DSN is a one-time manual account
step no amount of code can do — set it once in Vercel's environment
variables and redeploy to activate.

Verified in this repository (not just by reading the code): a clean
production build succeeds with the integration present; the dev server
starts and `/login` + `/api/ping` both work identically whether `SENTRY_DSN`
is unset or set to a syntactically valid but unreachable DSN (confirming the
SDK fails silently rather than crashing the app when delivery isn't
possible — its documented, intended behavior). Not verified: an actual event
arriving in a real Sentry project, since this session has no real DSN to
send to.

A real build issue was found and fixed while adding this: `next build`
started reliably hitting a JavaScript heap OOM during its own internal
"Running TypeScript..." pass once `@sentry/nextjs`'s large type surface was
added (reproduced twice, independent of available system memory at the
time). Fixed by setting `typescript: { ignoreBuildErrors: true }` in
`next.config.ts` — safe because `npm run typecheck` (a separate `tsc
--noEmit` pass) already runs earlier in `npm run ci`, so this removes a
redundant, OOM-prone check rather than any real type-safety coverage.

## Uptime monitoring (`[P0-OBS2-02]`)

The checklist suggests pinging `/api/internal/db-health` from an external
uptime service. That route is **disabled in production** —
`if (process.env.NODE_ENV !== "development") return 404` — a real doc/code
discrepancy found while implementing this item, not something to route
around silently. It also returns diagnostic detail (`entityCount`) not safe
to expose on a route any external service can reach.

Added a separate, minimal, public route instead: `GET /api/ping` (in
`proxy.ts`'s `PUBLIC_PATHS`, no session/API-secret required, not rate
limited — uptime services poll every 1–5 minutes and a 429 would read as a
false-positive outage). It does one lightweight `head: true` count query
against `personal_settings` to confirm the database is actually reachable,
and returns `{"ok":true}` / 200 on success or `{"ok":false}` / 503 on
failure — nothing else. Verified locally: returns 200 with a healthy
database.

To activate real external monitoring: point any uptime checker (UptimeRobot,
Better Uptime, a cron-based ping service, or similar) at
`https://<your-deployment>/api/ping` on a 1–5 minute interval, alerting on a
non-200 response or a request timeout. Creating an account with such a
service is, like Sentry, a manual step outside what this codebase can do on
its own.
