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

Official references:

- [Playwright continuous integration](https://playwright.dev/docs/ci)
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Playwright browser management](https://playwright.dev/docs/browsers)
