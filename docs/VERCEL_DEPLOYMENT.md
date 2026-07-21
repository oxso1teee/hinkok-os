# HinkoK OS: production deployment to Vercel

This runbook deploys the complete single-user HinkoK OS. It assumes that the
application code is stored in a private Git repository and that the Supabase
project already exists.

## 1. Production boundary

The application is intentionally public at the Vercel network layer and private
at the application layer:

- every dashboard page is protected by the HMAC session gate;
- private API routes require the signed session or `x-api-secret`;
- browser mutations also require a same-origin request;
- Telegram verifies `x-telegram-bot-api-secret-token`;
- cron handlers verify `Authorization: Bearer <CRON_SECRET>`;
- Supabase browser roles remain deny-all through RLS.

Do not enable a Vercel production protection mode that blocks Telegram webhook
requests. Preview deployments may use Vercel Deployment Protection because they
do not receive production Telegram or cron traffic.

## 2. Apply the database migrations

Apply every SQL file in `supabase/migrations` in filename order. Do this before
the first production deployment. The current final migration is:

```text
202607180013_personal_settings.sql
```

Do not point a Preview deployment at the production Supabase project. Use a
separate Preview project or do not create Preview deployments for untrusted
branches.

## 3. Generate independent secrets

Run:

```bash
npm run secrets:generate
```

This prints freshly generated values for:

```text
AUTH_SECRET
DASHBOARD_PASSWORD
API_SECRET
TELEGRAM_WEBHOOK_SECRET
CRON_SECRET
```

Store each value in a password manager. Never reuse one value for another
variable. Never commit the output, paste it into an issue or include it in a
screenshot.

## 4. Configure the Vercel project

Import the private Git repository into Vercel and use these settings:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root directory | repository root |
| Node.js | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build:vercel` |
| Output directory | automatic |

`vercel.json` already fixes the framework and build command. The build command
runs the full environment preflight before `next build`; an incomplete or unsafe
configuration fails the deployment instead of creating a partially working
production.

## 5. Add Production environment variables

Add these variables to the **Production** environment in Vercel.

### Core

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
USER_ID
USER_TIMEZONE
AUTH_SECRET
DASHBOARD_PASSWORD
API_SECRET
OPENAI_API_KEY
OPENAI_CLASSIFIER_MODEL
OPENAI_TRANSCRIBE_MODEL
OPENAI_EMBEDDING_MODEL
CRON_SECRET
```

Use `text-embedding-3-small` for `OPENAI_EMBEDDING_MODEL`. The database vector
column has 1536 dimensions and the preflight rejects an incompatible model.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is not required by the current server-rendered
UI. If it is added later, it must contain only the Supabase anon key. The
preflight rejects a value equal to `SUPABASE_SERVICE_ROLE_KEY`.

### Anthropic

```text
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
ANTHROPIC_FAST_MODEL
```

### Telegram

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_USER_ID
```

### Google Calendar and Sheets

```text
GOOGLE_CALENDAR_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_KEY
GOOGLE_SHEETS_FINANCE_ID
GOOGLE_SHEETS_FINANCE_RANGE
GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY
```

Share the calendar and spreadsheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL`. Give the
spreadsheet read-only access. Store `GOOGLE_SERVICE_ACCOUNT_KEY` as the complete
PKCS#8 key, including the `BEGIN PRIVATE KEY` and `END PRIVATE KEY` lines. Vercel
may store it with real line breaks or literal `\n` sequences; the application
normalizes literal sequences at runtime.

### Obsidian through private GitHub

```text
GITHUB_TOKEN
OBSIDIAN_REPO
OBSIDIAN_BRANCH
OBSIDIAN_VAULT_NAME
```

The GitHub token needs read-only access to repository contents. Do not grant
write, administration, workflow or organization permissions.

## 6. Run the preflight locally

Create an untracked `.env.production.local`, populate it with the same values and
run:

```bash
npm run deploy:check -- --env-file .env.production.local
```

The checker prints only variable names, integration states and validation
errors. It never prints secret values. A successful result ends with:

```text
Deployment preflight passed. No secret values were printed.
```

Delete the local file when it is no longer needed. `.env*.local` files are
excluded by `.gitignore`.

## 7. Deploy

Push the reviewed commit to the production branch. Vercel will install the
locked dependencies, run `npm run build:vercel` and publish only after the full
preflight and Next.js build succeed.

Environment variable changes apply to new deployments. Redeploy after adding,
rotating or correcting a value.

The project defines three Vercel cron jobs, all in UTC:

| Schedule | Endpoint | Purpose |
|---|---|---|
| `0 3 * * *` | `/api/memory/sync-obsidian` | Daily Obsidian reconciliation |
| `15 3 * * *` | `/api/finance/sync-google-sheets` | Daily finance reconciliation |
| `0 9 * * 0` | `/api/insights/weekly` | Sunday weekly review |

Vercel automatically sends `CRON_SECRET` in the Bearer authorization header.
Cron delivery can be missed or duplicated, so these handlers use reconciliation,
stable identifiers, atomic upserts, database advisory locks and a five-minute
deduplication window. Vercel does not automatically retry failed cron
invocations; inspect `/operations`, Cron Jobs and runtime logs after the first
scheduled runs.

On a Hobby plan, daily jobs can run at any point during the configured hour.
This project does not require minute-precise execution.

Official references:

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build)
- [Vercel cron security and delivery](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## 8. Register the Telegram webhook

After the production domain is live, run from a trusted local machine that has
the Telegram variables loaded:

```bash
npm run telegram:webhook:set -- https://your-production-domain.example
```

The script registers:

```text
https://your-production-domain.example/api/telegram/webhook
```

Never register a Preview URL as the production webhook.

## 9. Smoke-test the deployment

The passive test does not use any real secret and does not trigger a cron job:

```bash
npm run deploy:smoke -- https://your-production-domain.example
```

It verifies the public login page, security headers, page/API auth gates, cache
policy and rejection of missing or invalid cron authorization.

For the optional authenticated check, load the password without placing it in a
command argument:

```bash
read -rs DASHBOARD_PASSWORD
export DASHBOARD_PASSWORD
npm run deploy:smoke -- https://your-production-domain.example --authenticated
unset DASHBOARD_PASSWORD
```

The authenticated check performs one real login, opens BRAIN, verifies private
cache headers and logs out. It does not print the password or response bodies.

## 10. First production verification

Complete this list immediately after deployment:

1. Run both smoke modes.
2. Log in through the browser and confirm HOME, CRM, BRAIN, JOURNAL, HEALTH, STATUS, SETTINGS and BACKUP.
3. Send one harmless Telegram note and verify its destination and memory source.
4. Trigger Obsidian and finance synchronization manually from a trusted client.
5. Upload one current Apple Health sample through the Shortcut.
6. Ask one grounded BRAIN question and inspect its source references.
7. Generate one weekly review manually.
8. Confirm that Vercel Cron Jobs lists all three schedules.
9. Open STATUS and confirm that all three manual runs are recorded as succeeded.
10. Save a harmless SETTINGS change and confirm it appears on HOME or BRAIN.
11. Create and offline-verify one encrypted BACKUP file.
12. Check Vercel logs for unexpected 401, 429 or 5xx responses.
13. Confirm that no secret appears in client JavaScript, logs or screenshots.

## 11. Rotation and rollback

- Rotate `AUTH_SECRET` to invalidate every existing browser session.
- Rotate `DASHBOARD_PASSWORD` independently from `AUTH_SECRET`.
- Rotate `API_SECRET`, `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET` independently;
  update both sides of each integration before the next request.
- A Vercel rollback does not roll back Supabase migrations. Database migrations
  are append-only and must be handled separately.
- After a rollback, verify the active cron configuration in Vercel. Cron settings
  may continue to reflect a newer deployment until they are redeployed or
  changed manually.
- Use `docs/OPERATIONS_MONITORING.md` for the non-destructive recovery sequence
  and post-rollback job verification.
- For a full rollback runbook (application, database migrations, and the
  combined worst case), see `docs/ROLLBACK.md`.

## 12. Staging and preview deployments

This project does not run a separate staging Vercel project or a separate
Supabase database. It uses Vercel's built-in **Preview Deployments**
instead: pushing any branch other than `main` (or opening a PR) gets its own
`https://hinkok-os-git-<branch>-<account>.vercel.app` URL automatically, at
no extra setup cost, without provisioning anything.

**The one thing this does *not* give you**: a preview deployment reads the
same `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and every other
environment variable as production, unless you explicitly configure separate
values for the "Preview" environment in Vercel's project settings. By
default, that means **a preview deployment reads and writes the real
production database** — the same tasks, journal entries, finance
transactions, and audit log a real deployment would.

Given this app has a single real user and no throwaway test data of its own,
the practical rule is:

- Preview deployments are safe and useful for reviewing **UI/visual**
  changes (does this page look right, does this component render correctly)
  without touching data.
- **Do not** exercise any data-writing flow (create a task, save a journal
  entry, run a manual sync, submit a backup restore) against a preview URL —
  it acts on real personal data, not a sandbox.
- A separate Supabase project + separate secrets for a true isolated staging
  environment remains a legitimate future upgrade if this app ever needs
  heavier pre-merge testing, but was intentionally not built out for now —
  the cost (a second database, a second set of every secret, migrations
  applied twice on every schema change) isn't justified for a single-user
  personal project at its current scale.
