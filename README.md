# HinkoK OS

Personal AI operating system built with Next.js, TypeScript, Supabase and
pgvector.

## Current implementation

- Next.js 16 App Router foundation.
- Strict TypeScript and ESLint configuration.
- Complete initial Supabase migration.
- Typed server-only Supabase administrative client.
- Runtime validation for required server environment variables.
- Development-only database health endpoint.
- HMAC-SHA-256 signed sessions with a 12-hour absolute lifetime.
- `httpOnly`, `SameSite=Strict`, high-priority session cookies.
- Fail-closed Next.js `proxy.ts` for pages and API routes.
- Constant-time password and API-secret comparison.
- IP-based login throttling backed by Supabase.
- Same-origin checks for login and logout requests.
- Security headers including CSP, HSTS and frame protection.
- Idempotent memory indexing with natural-boundary chunking and SHA-256
  change detection.
- OpenAI `text-embedding-3-small` embeddings stored in Supabase pgvector.
- Semantic memory search isolated to the configured single-user identity.
- Atomic database-backed rate limiting and privacy-preserving audit events for
  memory operations.
- Idempotent text capture endpoint with a bounded request body and single-user
  rate limiting.
- Three-stage capture classifier: Anthropic, OpenAI Structured Outputs and a
  deterministic Russian/English regex fallback.
- Strict post-model normalization with allow-listed enums and database-verified
  entity identifiers.
- Atomic database routing for tasks, journal entries and meals; calendar events
  are created idempotently in Google Calendar when it is configured and remain
  `calendar_pending` otherwise.
- Owner-only Telegram webhook for text, voice notes, photos and task urgency
  callbacks, protected by Telegram's secret-token header.
- Bounded Telegram file downloads with OpenAI transcription and Anthropic
  Vision → OpenAI Vision fallback.
- Food-photo calorie and macronutrient estimates merged into the matching
  `daily_logs` meal without duplicating it.
- Leased Telegram update claims prevent concurrent webhook retries from
  repeating model calls while still allowing failed jobs to be retried.
- Incremental Obsidian sync reads a private GitHub repository, rejects
  truncated or oversized inputs and re-embeds only notes whose blob SHA changed.
- Git tree snapshots are cached by tree SHA and removed notes are deleted from
  vector memory before the new snapshot is committed.
- Grounded “ask your life” answers use pgvector retrieval, Anthropic with an
  OpenAI fallback, numbered source references and an extractive outage fallback.
- Daily Obsidian synchronization is exposed to Vercel Cron through a
  constant-time-verified Bearer secret; manual synchronization remains
  available to authenticated sessions and trusted API clients.
- Apple Health daily snapshots from iOS Shortcuts are range-validated and
  atomically replace only the matching day's `notes.activity` section.
- Health ingestion is API-secret-only and remains durable when embedding is
  temporarily unavailable.
- Google Sheets finance synchronization parses Russian or English headers,
  uses stable transaction keys and atomically reconciles a deny-all-RLS
  `finance_transactions` projection.
- Google OAuth uses PKCE S256, encrypted code verifiers and atomically consumed
  ten-minute state records so callbacks cannot be replayed.
- Responsive HOME dashboard reproduces the supplied warm amber visual system
  with a dense desktop grid and complete tablet/mobile layouts.
- HOME reads live Supabase, Google Calendar, Apple Health, nutrition and finance
  state without inventing unavailable values, and degrades to explicit empty
  states when an optional source is offline.
- Quick capture, task completion, daily habits and weekly/monthly goals are
  wired to protected APIs and atomic database functions.
- Responsive CRM reproduces the supplied six-column warm amber Kanban design
  with real task, entity, decision and capture counts.
- CRM supports search, category and priority filters, touch-friendly column
  moves, drag-and-drop with optimistic rollback, task creation/editing and a
  restorable completed-task archive.
- CRM writes use owner-scoped atomic PostgreSQL functions, idempotent client
  request identifiers, strict request validation, same-origin enforcement,
  database rate limits and append-only audit events.
- BRAIN presents all nine life spheres with exact open-task and unique-note
  counts, deduplicating vector chunks back into their original memory sources.
- “Ask the OS” is connected to the grounded pgvector RAG endpoint and exposes
  bounded source references instead of unsupported model claims.
- Per-sphere operational briefings use only that sphere's open tasks and notes,
  treat retrieved text as untrusted input and fall back from Anthropic to
  OpenAI and then to a deterministic extractive summary.
- Last briefings are cached server-side, Obsidian can be refreshed from BRAIN,
  and sphere tasks can be completed through the protected CRM API.
- JOURNAL provides an atomic one-entry-per-day editor alongside preserved
  Telegram journal captures, five-level mood tracking and a 120-day archive.
- The journal dashboard renders a real 30-day mood history, sleep-band averages
  and Pearson mood/sleep correlation only when enough paired measurements exist.
- Daily prompts insert directly into the editor, saved web entries are indexed
  into vector memory without making durable storage depend on embeddings, and
  all mutations use same-origin validation, rate limits and append-only audit.
- HEALTH renders six current Apple Health metrics, a trailing seven-day sleep
  and activity view, a real 30-day resting-heart-rate trend and captured meal
  macros without interpolating or inventing missing measurements.
- Stable metrics use the latest available sample with an explicit date, daily
  metrics disclose stale dates, and integration or database outages degrade to
  clear empty states rather than plausible-looking placeholder values.
- The health dashboard is responsive across desktop, tablet and mobile while
  preserving the supplied dense warm-amber visual system.
- Weekly insights aggregate only recorded facts from tasks, captures, journal,
  Apple Health, nutrition and finance into a durable seven-day review.
- Weekly synthesis falls back from Anthropic to OpenAI and then to a
  deterministic extractive report, is visible in BRAIN and is indexed into
  vector memory only after durable storage succeeds.
- A constant-time Bearer-protected Vercel cron generates the review every
  Sunday at 09:00 UTC; authenticated users can also regenerate it manually.
- Vercel deployment runs a fail-closed full-environment preflight that detects
  missing, placeholder, reused or accidentally public service-role secrets
  without printing their values.
- A non-destructive deployment smoke command verifies security headers, page
  and API gates, cron rejection and optional real session login/logout.
- A minimal-permission GitHub Actions release gate installs the lockfile,
  scans for committed secrets, audits production dependencies, checks types and
  lint, runs every test and builds with isolated ephemeral credentials.
- GitHub-authored workflow actions are full-SHA pinned, checkout credentials
  are not persisted, and Dependabot reviews npm and Actions updates weekly.
- A private STATUS dashboard records cron and manual job outcomes without
  persisting source content, prompts, model responses or secret values.
- PostgreSQL advisory locks suppress concurrent cron execution, a five-minute
  deduplication window absorbs repeat delivery, and stale ten-minute claims are
  recovered as explicit `abandoned` runs.
- Operators can retry configured jobs from the authenticated dashboard and
  inspect 90 days of bounded technical metadata for safe recovery.
- A protected SETTINGS dashboard customizes operator identity, focus, daily
  habits, nutrition targets, sphere labels and Obsidian folder mapping without
  editing source files.
- Settings use strict nested validation and coherent fail-safe defaults; fixed
  sphere ids preserve historical data and classifier compatibility.
- Obsidian mapping fingerprints force a safe re-evaluation after configuration
  changes even when the repository tree SHA is unchanged.
- A protected BACKUP dashboard exports all canonical user data in an
  authenticated AES-256-GCM envelope with a memory-hard scrypt-derived key.
- Backup verification rejects wrong passphrases, modified ciphertext,
  incompatible schemas, oversized snapshots and cross-user rows before data is
  returned or written.
- Local recovery is dry-run by default and requires both `--apply` and an exact
  confirmation environment value before bounded idempotent upserts begin.
- Playwright exercises the authentication boundary, hardened session lifecycle,
  safe redirects, API fail-closed behavior and responsive login layout in
  desktop and mobile Chromium without using production credentials or data.
- Automated axe scans reject detectable WCAG A/AA regressions, while CI retains
  traces, screenshots and an HTML report only for failed browser runs.

## Local setup

Requirements:

- Node.js 24 or newer.
- A Supabase project with every file in `supabase/migrations` applied in
  filename order.

Install dependencies:

```bash
npm install
```

Create the local environment file:

```bash
cp .env.example .env.local
```

Required variables for the current implementation:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
USER_ID=
USER_TIMEZONE=Europe/Riga
AUTH_SECRET=
DASHBOARD_PASSWORD=
API_SECRET=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_FAST_MODEL=claude-haiku-4-5
OPENAI_API_KEY=
OPENAI_CLASSIFIER_MODEL=gpt-4o-mini
OPENAI_TRANSCRIBE_MODEL=whisper-1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Telegram integration variables:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_USER_ID=
```

Google Calendar and Sheets require resource identifiers plus either OAuth 2.0
credentials (recommended for a personal Google account) or a service account:

```dotenv
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=Europe/Riga
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR_DOMAIN/api/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=

# Optional fallback instead of OAuth:
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_KEY=
```

Google Sheets finance variables:

```dotenv
GOOGLE_SHEETS_FINANCE_ID=
GOOGLE_SHEETS_FINANCE_RANGE=Transactions!A:G
GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY=EUR
```

With OAuth, open `/api/integrations/google/connect` while signed in to HinkoK OS.
With a service account, share the spreadsheet with its email as a viewer. The exact
column contract is documented in `docs/GOOGLE_SHEETS_FINANCE.md`.

Obsidian variables required by the full Vercel deployment profile (configure
all values together):

```dotenv
GITHUB_TOKEN=
OBSIDIAN_REPO=owner/private-vault-repository
OBSIDIAN_BRANCH=main
OBSIDIAN_VAULT_NAME=HinkoK
CRON_SECRET=
```

The GitHub token needs read-only `Contents` access to the private repository.
The vault may live at the repository root or in a top-level folder matching
`OBSIDIAN_VAULT_NAME`. The sync ignores non-Markdown files, `.obsidian`, trash
folders and symlinks.

Share the target calendar with the service-account email before enabling event
creation. Configure the deployed Telegram webhook with:

```bash
npm run telegram:webhook:set -- https://your-domain.example
```

Generate strong authentication secrets:

```bash
npm run secrets:generate
```

Copy the generated values into `.env.local`. Do not commit or share them.

Run development mode:

```bash
npm run dev
```

Validate the database connection locally:

```bash
curl \
  --header "x-api-secret: $API_SECRET" \
  http://localhost:3000/api/internal/db-health
```

Create an idempotent capture from a trusted integration:

```bash
curl \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-api-secret: $API_SECRET" \
  --header "Idempotency-Key: capture-2026-07-17-001" \
  --data '{"text":"Нужно завтра отправить клиенту предложение"}' \
  http://localhost:3000/api/captures
```

Run an authenticated Obsidian sync manually:

```bash
curl \
  --request POST \
  --header "x-api-secret: $API_SECRET" \
  http://localhost:3000/api/memory/sync-obsidian
```

Ask a grounded question over indexed memory:

```bash
curl \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-api-secret: $API_SECRET" \
  --data '{"query":"Какие идеи по развитию бизнеса я чаще всего откладываю?"}' \
  http://localhost:3000/api/ask
```

Generate the weekly review manually:

```bash
curl \
  --request POST \
  --header "x-api-secret: $API_SECRET" \
  http://localhost:3000/api/insights/weekly
```

Upload a daily Apple Health snapshot from an iOS Shortcut:

```bash
curl \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-api-secret: $API_SECRET" \
  --data '{"date":"2026-07-18","steps":13127,"resting_hr":55,"hrv":37.8}' \
  http://localhost:3000/api/health/activity
```

See `docs/APPLE_HEALTH_SHORTCUT.md` for the full payload and Shortcut mapping.

Synchronize Google Sheets finance manually:

```bash
curl \
  --request POST \
  --header "x-api-secret: $API_SECRET" \
  http://localhost:3000/api/finance/sync-google-sheets
```

## Quality checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Install Chromium once and run the isolated browser suite:

```bash
npm run e2e:install
npm run e2e
```

The E2E server generates temporary application secrets and exposes a local
allow-list Supabase mock. It never needs a production `.env` file. See
`docs/E2E_QA.md` for the covered scenarios and failure artifacts.

## Production deployment

The complete Vercel setup, environment contract, cron schedule, Telegram
registration, smoke checks and rotation procedure are documented in
`docs/VERCEL_DEPLOYMENT.md`.

The private status dashboard, run-state meanings and recovery sequence are
documented in `docs/OPERATIONS_MONITORING.md`.

Personalization limits, security rules and application behavior are documented
in `docs/PERSONAL_SETTINGS.md`.

Encrypted export, offline verification and the disaster-recovery runbook are
documented in `docs/BACKUP_RECOVERY.md`.

Browser regression, accessibility and CI diagnostics are documented in
`docs/E2E_QA.md`.

Validate a production environment file without printing its values:

```bash
npm run deploy:check -- --env-file .env.production.local
```

Smoke-test a deployed origin without invoking integrations:

```bash
npm run deploy:smoke -- https://your-production-domain.example
```

## Continuous integration

Run the same release gate used by GitHub Actions:

```bash
npm run ci
```

The CI build creates isolated ephemeral credentials in memory and never needs
real production secrets. Branch protection, workflow security and the release
flow are documented in `docs/CI_RELEASE_GATES.md`.

## Security

- Never commit `.env.local` or any real secret.
- `SUPABASE_SERVICE_ROLE_KEY` is imported only by server-only modules.
- Database tables use deny-all RLS for browser roles.
- The database health endpoint returns `404` outside development mode.
- The production cookie uses the `__Host-` prefix and cannot define a domain.
- Proxy is an early barrier; protected pages and data routes verify auth again.
- Eight failed login attempts from one IP trigger a 15-minute lockout.
- Browser memory mutations require a valid signed session and same-origin
  request; integrations require the constant-time-checked API secret.
- Embeddings and the Supabase service role are used only in server modules.
- Obsidian credentials are sent only in the GitHub Authorization header; the
  integration accepts a fixed GitHub API origin and never constructs a remote
  host from vault data.
- The cron route is public only at the proxy layer and fails closed inside the
  handler unless its Bearer secret is configured and valid.
- Weekly insight model inputs mark tasks, captures and journal excerpts as
  untrusted data; model output is parsed into bounded allow-listed fields before
  the atomic database upsert.
- Retrieved notes are explicitly treated as untrusted data in RAG prompts, so
  instructions embedded in a note cannot override the answer policy.
- Apple Health accepts only the API secret, enforces bounded JSON and metric
  ranges, and audit logs record metric names rather than sensitive values.
- Google Sheets is accessed with a read-only OAuth scope. A malformed row
  aborts synchronization before any local transaction is changed.
- HOME mutations are re-authenticated inside their route, require same-origin
  browser requests and serialize JSON updates in Postgres to prevent lost
  concurrent changes.
- Capture retries are deduplicated by `(user_id, idempotency_key)` inside the
  database, including concurrent requests.
- A provider outage cannot silently discard a capture: classification falls
  through to regex and failed memory indexing marks the saved capture as
  `degraded` for later repair.
- Idempotent Google Calendar event creation through a service account.
