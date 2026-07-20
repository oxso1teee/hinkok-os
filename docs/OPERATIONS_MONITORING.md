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
