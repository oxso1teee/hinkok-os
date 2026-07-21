# Rollback runbook

This is the single authoritative procedure for undoing a bad deployment or a
bad database migration. It consolidates and supersedes the shorter rollback
notes in `docs/VERCEL_DEPLOYMENT.md` ("Rotation and rollback") and
`docs/OPERATIONS_MONITORING.md` ("Deployment rollback") — those still apply,
this is the fuller version.

## 1. Application code rollback (fast, safe, reversible)

A bad application deployment (broken build, a regression, a bad merge) is
the easy case:

1. Open the Vercel dashboard → this project → Deployments.
2. Find the last known-good deployment and use **Instant Rollback**. This
   repoints production traffic at the previous build immediately — it does
   not rebuild, so it's fast, and it does not touch the database.
3. Vercel Cron configuration is tied to the *currently promoted* deployment,
   not history — after an instant rollback, open Vercel's Cron Jobs page and
   confirm the schedules still match `vercel.json`. If the bad deployment
   changed `vercel.json`, cron settings may keep reflecting it until the next
   deploy; reconcile manually if so.
4. Run `npm run deploy:smoke` against the production URL to confirm the
   rolled-back build is actually healthy (login, a couple of authenticated
   API calls, `/api/ping`).
5. If the bad deployment rotated a secret (`AUTH_SECRET`, `API_SECRET`,
   `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`) as part of the change, rolling
   back the *code* does not un-rotate the *secret* — Vercel env vars are not
   versioned alongside deployments. Check whether the secret needs to be
   manually reverted too (see `docs/SECRET_ROTATION.md`).

This path never needs a database change and is safe to do without hesitation
— it's exactly what Instant Rollback is for.

## 2. Database migration rollback (the harder case)

**Current state, verified, not assumed**: every migration in
`supabase/migrations/` (21 files as of this writing) is purely additive —
new tables, new nullable/defaulted columns, new indexes, new functions.
Confirmed by grepping all 21 files for `drop column`, `rename column`,
`rename table`, `alter column ... type`, and `drop table`: zero matches.
None of them can break existing application code that hasn't been updated
yet, because nothing existing was removed or reshaped.

This means: **as of today, rolling back application code to an older
deployment is always safe against the current database schema** — an older
build simply doesn't know about newer additive columns/tables and ignores
them. You do not need to run anything backward.

### If a migration ever does need undoing

This project does not use down-migrations (Supabase's own migration tracking
isn't wired up here — `supabase/migrations/*.sql` are applied forward, in
filename order, directly against Postgres). If a future migration is ever
genuinely destructive (drops a column, renames something, changes a type)
and it needs to be undone:

1. **Never hand-write a manual `ALTER`/`DROP` against production to "revert"
   it.** Postgres has already applied the change; reasoning about the
   current state from the old migration file is unreliable once real data
   has flowed through the new schema.
2. **Write a new, forward-only migration that restores the old shape**
   (e.g., re-add the dropped column, rename the table back). Number it
   normally in sequence — this project's whole migration history is a
   forward-only log, and that stays true even when "undoing" something.
3. Before applying it to production, apply it to the local dev stack
   described in `docs/E2E_QA.md` ("Local real-database specs") and confirm
   the app + `e2e-local` suite still work end to end.
4. If the destructive migration already **deleted data** (not just
   reshaped structure) before you caught it: application code and schema
   fixes don't bring rows back. Restore from the most recent encrypted
   backup instead — `npm run backup:restore -- <path> --apply` (see
   `docs/BACKUP_RECOVERY.md`). This path is already tested end-to-end
   (`[P0-BACKUP-01]`): a clean restore reproduces every table's row count
   exactly, including the append-only `audit_log`.

## 3. Combined worst case: bad code + bad migration together

1. Instant Rollback the application first (section 1) — this stops the bad
   code from running immediately, independent of the database's state.
2. Then assess the database separately (section 2). A rolled-back
   *application* does not require a rolled-back *database* unless the
   migration was genuinely destructive per the check above.
3. Re-run `npm run deploy:smoke` after both steps to confirm the combination
   is actually healthy, not just each half in isolation.

## 4. Post-rollback checklist

- [ ] Vercel shows the correct deployment promoted to production.
- [ ] Vercel Cron Jobs match `vercel.json` for the promoted deployment.
- [ ] `npm run deploy:smoke` passes against the real production URL.
- [ ] `/operations` shows no job stuck in `running`/`attention` because of
      the incident.
- [ ] If a secret was rotated as part of the incident, confirm it's the
      intended value on both sides of every integration that uses it.
- [ ] Write down what happened and why, even briefly — this file describes
      the mechanics, not the specific incident history.
