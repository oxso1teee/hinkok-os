# HinkoK OS: browser E2E and accessibility gate

The browser gate validates the security boundary that a real user crosses
before any personal data can be rendered. It uses Playwright 1.61.1,
Playwright-managed Chromium and `@axe-core/playwright` 4.12.1.

## Isolation model

`npm run e2e` starts a dedicated Next.js development server on the loopback
origin `http://localhost:3310`. The server receives new random application, API and HMAC
secrets for every run. The only stable value is an explicitly test-only login
password shared by the server harness and the browser test.

No `.env` file is read. No production credential is accepted or required.

The harness also starts a loopback-only Supabase-compatible mock on
`127.0.0.1:54331`. It accepts exactly two operations needed by authentication:

- `register_login_attempt` RPC with a Boolean `p_ok` field;
- an `audit_log` insert containing a string `action` field.

Every other mock database request returns `404`. Request bodies are bounded to
16 KiB, malformed JSON is rejected and the service is terminated together with
the Next.js child process.

## Covered scenarios

The suite runs each scenario in desktop Chromium and a Pixel 7 mobile profile:

1. a protected page redirects to `/login` and preserves only the safe internal
   return path;
2. a protected API returns `401`, `Cache-Control: no-store` and expires a
   malformed session cookie;
3. the login form is keyboard-operable and an axe scan finds no automatically
   detectable WCAG 2.0/2.1 A or AA violations;
4. a wrong password produces the stable Russian error, clears the secret field
   and does not navigate;
5. a correct password creates an `httpOnly`, `SameSite=Strict`, root-scoped
   session, rejects an external return URL and is invalidated by logout;
6. the login page does not introduce horizontal overflow at the active
   viewport width.

The suite also fails when the page emits an uncaught JavaScript exception or a
browser console error during interactive authentication checks.

Automated accessibility scanning detects only a subset of WCAG problems. It
does not replace keyboard review, screen-reader testing or a manual contrast
and zoom assessment.

## Local commands

Install Chromium once for the installed Playwright version:

```bash
npm run e2e:install
```

Run both browser profiles:

```bash
npm run e2e
```

List the complete test matrix without launching a browser:

```bash
npx playwright test --list
```

Open the latest HTML report:

```bash
npx playwright show-report
```

Playwright outputs are written to `playwright-report/` and `test-results/`.
Both directories are ignored by Git. Failed tests retain a trace and a
screenshot; video recording is disabled to reduce sensitive diagnostic data.

## CI behavior

GitHub Actions installs only Chromium and its Linux dependencies:

```bash
npx playwright install --with-deps chromium
```

CI uses one worker and one retry. A retry retains its trace only if the test
still fails. The HTML report is uploaded with a 14-day retention period and the
workflow has only `contents: read` permission.

Never place production secrets into the browser job. The checked-in workflow
does not reference GitHub secrets and the harness does not inherit a repository
`.env` file.

## Local real-database specs

`e2e/*.spec.ts` (above) only covers what its hermetic mock understands: two
auth-flow operations, by design (see "Isolation model"). It intentionally
cannot cover the other 7 modules, because each dashboard's initial load is a
server-rendered page issuing several parallel Supabase queries (the CRM board
alone issues 8: active tasks, archived tasks, entities, and four separate
counts) — precisely replicating PostgREST's query/filter/count wire format for
all of those by hand would be a large, fragile undertaking, and it would
duplicate logic that already exists correctly in PostgREST itself.

`e2e-local/*.spec.ts` + `playwright.local.config.ts` fill that gap by running
against a **real** local Postgres + PostgREST stack instead of a hand-written
mock. It is deliberately **not** wired into `npm run e2e` or CI — it needs
local infrastructure the hermetic gate is explicitly designed to avoid.

Local setup (already used to write and verify the CRM spec in this repo):

```bash
# 1. A disposable Postgres+pgvector container
docker run -d --name hinkok-os-pg -e POSTGRES_PASSWORD=<pw> -e POSTGRES_DB=hinkok \
  -p 5544:5432 pgvector/pgvector:pg16

# 2. Create the anon/authenticated/service_role roles Supabase provides for
#    free, then apply supabase/migrations/*.sql in order with psql.

# 3. PostgREST, pointed at that database
docker run -d --name hinkok-os-postgrest --add-host=host.docker.internal:host-gateway \
  -e PGRST_DB_URI="postgres://postgres:<pw>@host.docker.internal:5544/hinkok" \
  -e PGRST_DB_SCHEMA=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET=<32+ byte secret> -p 5555:3000 postgrest/postgrest:latest

# 4. A tiny local proxy stripping the `/rest/v1` prefix supabase-js always
#    sends (real Supabase's Kong gateway does this; bare PostgREST does not) —
#    see the ~30-line http.createServer script this session wrote at
#    /tmp/.../scratchpad/rest-proxy.mjs. Point NEXT_PUBLIC_SUPABASE_URL at it.

# 5. Mint anon/service_role JWTs (HS256, `{ role: "anon" | "service_role" }`,
#    signed with the same PGRST_JWT_SECRET), set NEXT_PUBLIC_SUPABASE_ANON_KEY
#    / SUPABASE_SERVICE_ROLE_KEY.

# 6. Seed representative rows for entities/tasks/raw_captures/memory_chunks/
#    daily_logs/weekly_insights/system_job_runs, then:
npm run dev  # on port 3000, or whatever PLAYWRIGHT_LOCAL_BASE_URL points at

PLAYWRIGHT_LOCAL_PASSWORD=<your DASHBOARD_PASSWORD> \
PLAYWRIGHT_LOCAL_BASE_URL=http://localhost:3000 \
  npx playwright test --config=playwright.local.config.ts
```

`e2e-local/health.spec.ts` also talks to PostgREST directly (to surgically
clear/restore one day's activity without disturbing mood or journal text in
the same row) and needs the locally-minted `service_role` JWT from step 5:
`PLAYWRIGHT_LOCAL_SERVICE_JWT=<that JWT>` and, if not on the default port,
`PLAYWRIGHT_LOCAL_REST_BASE=<your rest-proxy origin>`. Never hardcode that
JWT in a spec file — `npm run repo:check` flags anything JWT-shaped as a
possible committed secret, correctly, even for a disposable local one.

Making these CI-portable is a real follow-up, not something to route around:
either (a) extend `scripts/e2e-server.ts`'s mock with exact handlers for each
module's query shapes (keeps the zero-extra-infra property but is
maintenance-heavy and drifts from real PostgREST behavior over time), or
(b) add real Postgres + PostgREST as GitHub Actions `services:` and run the
same migration/seed steps above in a CI step (more infrastructure, but tests
the real thing and won't silently drift). (b) is the more maintainable choice
if this repo grows past a single-person project.

Official references:

- [Playwright continuous integration](https://playwright.dev/docs/ci)
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Playwright browser management](https://playwright.dev/docs/browsers)
