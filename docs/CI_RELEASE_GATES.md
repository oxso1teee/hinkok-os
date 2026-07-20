# HinkoK OS: CI and release gates

The repository includes a security-hardened GitHub Actions workflow at
`.github/workflows/ci.yml`. It runs for pull requests, pushes to `main` and
manual dispatches.

## What the `quality` job checks

The job performs these steps from a clean checkout:

1. installs the exact `package-lock.json` dependency graph with `npm ci`;
2. rejects committed private environment files, key containers, recognizable
   provider tokens, non-empty secret assignments and secret references from
   client modules;
3. audits production and development dependencies and fails for high or
   critical findings;
4. runs TypeScript checking;
5. runs ESLint;
6. runs the complete Node test suite;
7. performs a real Next.js production build;
8. installs the Playwright-managed Chromium build and its Linux dependencies;
9. runs isolated desktop and mobile browser tests, including WCAG A/AA axe
   checks;
10. uploads the Playwright HTML report for 14 days when one was generated.

The lockfile overrides Next.js's nested PostCSS copy to `8.5.19`, which is
newer than the patched `8.5.10` boundary for CVE-2026-41305. The complete test
and build gate verifies compatibility with that override while Next.js still
ships an older nested version.

The CI build never receives Vercel or production application secrets. The
`ci:build` script constructs isolated random values in memory, verifies them
with the same full deployment preflight and passes them only to the build child
process. These values are not written to disk or printed.

## Workflow security properties

- `GITHUB_TOKEN` permissions are limited to `contents: read`.
- Checkout credentials are not persisted in the local Git configuration.
- The workflow uses `pull_request`, never `pull_request_target`, so fork code
  does not execute in a privileged base-repository context.
- GitHub-authored actions are pinned to complete immutable commit SHAs.
- Concurrent runs for the same ref are cancelled to avoid wasting runner time.
- The job has a 25-minute timeout.
- No production secret is referenced by the workflow.
- Browser tests generate temporary secrets at runtime and use a local
  fail-closed Supabase mock instead of production services.
- Playwright runs with one worker in CI to avoid state and resource races.

GitHub recommends full-length SHA pinning as the immutable way to reference an
action. The configured releases are:

- `actions/checkout` v7.0.0;
- `actions/setup-node` v7.0.0;
- `actions/upload-artifact` v6.0.0.

Dependabot checks both SHA-pinned GitHub Actions and npm dependencies every
Monday in the `Europe/Riga` timezone. Minor and patch npm updates are grouped;
major updates stay separate for explicit review.

Official references:

- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Managing GitHub Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
- [actions/checkout v7.0.0](https://github.com/actions/checkout/releases/tag/v7.0.0)
- [actions/setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)

## Required repository settings

After the private repository is created, open GitHub repository settings and
configure a branch ruleset for `main`:

1. require a pull request before merging;
2. require at least one approval when another trusted reviewer is available;
3. dismiss stale approvals when new commits are pushed;
4. require the `quality` status check;
5. require the branch to be up to date before merging;
6. block force pushes and branch deletion;
7. do not allow bypasses for routine changes.

Also configure Actions settings to allow only GitHub-authored actions and to
require actions to be pinned to a full-length commit SHA. The included workflow
already satisfies that policy.

## Local release gate

Run the complete gate locally from the repository root:

```bash
npm run ci
```

This command performs the repository scan, complete dependency audit,
TypeScript check, lint, tests and isolated production build. It does not need a
local `.env` file and does not contact Supabase, Anthropic, OpenAI, Telegram,
Google or GitHub integrations during the build.

Install the managed browser once, then run the browser portion of the release
gate:

```bash
npm run e2e:install
npm run e2e
```

The browser command starts its own development server with ephemeral secrets
and a loopback-only Supabase mock. It runs 12 checks: six scenarios in desktop
Chromium and the same six in mobile Chromium. See `docs/E2E_QA.md` for details.

To run only the repository safety check:

```bash
npm run repo:check
```

To reproduce only the isolated production build:

```bash
npm run ci:build
```

## Pull request and release flow

1. Create a short-lived branch from `main`.
2. Make and review the change without adding production secrets.
3. Run `npm run ci` locally for security-sensitive changes.
4. Run `npm run e2e` when Chromium is installed locally.
5. Push the branch and wait for the GitHub `quality` check.
6. Merge only when the required check is green.
7. Let Vercel build the protected `main` branch using its own Production
   environment variables and the `build:vercel` preflight.
8. Run the deployment smoke test from `docs/VERCEL_DEPLOYMENT.md`.

Preview deployments must not use the production Supabase project or production
integration secrets. Treat pull-request code as untrusted even when the
repository is private.
