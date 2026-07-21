# Security exceptions

This file records every `npm audit` finding the project has decided not to
fix immediately, with the reason and the date reviewed. `npm run ci` already
runs `npm audit --audit-level=high` on every commit, so anything below
`high` never blocks CI on its own — this file exists so a moderate/low
finding is a documented, reviewed decision instead of a silent gap.

## How to update this file

1. Run `npm audit` (no `--audit-level` flag, so it prints every severity).
2. For each new advisory: either fix it (`npm audit fix` / manual bump) or
   add a row below with the reason it's being accepted for now.
3. Re-run `npm audit --audit-level=high` and confirm it still passes before
   committing.

## Current status

**2026-07-21**: `npm audit` (all severities, no `--audit-level` filter) reports
**0 vulnerabilities** across all 557 resolved dependencies (124 prod, 397 dev,
121 optional, 36 direct package.json entries). Nothing is being accepted or
deferred — there is currently nothing to except.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| Info | 0 |

## Accepted findings

None at this time. When `npm audit` reports something below `high` that the
project decides not to fix immediately, add a row here:

| Advisory | Package | Severity | Reason accepted | Reviewed |
|---|---|---|---|---|
| — | — | — | — | — |
