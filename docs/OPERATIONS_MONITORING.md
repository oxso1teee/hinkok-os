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
