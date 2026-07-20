# Secret rotation runbook

This project has no automated secret rotation and no key-versioning for any
of its encryption keys — every secret below is a single static value read
once from `process.env` at module load. Rotating one means: generate a new
value, set it in Vercel (or wherever the deployment gets its env from), then
redeploy. What differs per secret is **what breaks in between** and **what
you must do afterward**. Read the relevant section before rotating; a few of
these are not free of consequences.

Generate fresh values for the process-only secrets with:

```bash
npm run secrets:generate
```

This prints `AUTH_SECRET`, `DASHBOARD_PASSWORD`, `API_SECRET`,
`TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET` and `RECOVERY_CODE`. It does not
generate `GOOGLE_TOKEN_ENCRYPTION_KEY` or `SUPABASE_SERVICE_ROLE_KEY` — those
come from Google Cloud Console and the Supabase dashboard respectively.

## Safe to rotate any time (no data at rest depends on the old value)

- **`AUTH_SECRET`** — HMAC-signs the session cookie (`src/lib/auth/session.ts`).
  Rotating it makes every existing session cookie fail verification: **every
  logged-in browser is signed out immediately** on the next request after the
  new value is live. No data is lost; the user just has to log in again (with
  `DASHBOARD_PASSWORD`, or with the current password from
  `auth_password_override` if a recovery has ever run — see `[P0-AUTH-01]`).
  There is no way to rotate this one without forcing a re-login; if that
  matters, do it at a time you're prepared to log back in right away.

- **`DASHBOARD_PASSWORD`** — only checked when `auth_password_override` has no
  row for the user (see `src/app/api/auth/login/route.ts`). If you have ever
  used `/api/auth/recover`, changing `DASHBOARD_PASSWORD` in the env **has no
  effect** until that override row is cleared — the recovered password wins.
  To fully reset to an env-based password, delete the row from
  `auth_password_override` for your `USER_ID` as well.

- **`API_SECRET`** — gates the Apple Health Shortcuts integration
  (`x-api-secret` header, see `docs/APPLE_HEALTH_SHORTCUT.md`) and any other
  direct API caller you've wired up the same way. Rotating it does not affect
  stored data, but **the iOS Shortcut (and any other external caller) will
  start getting 401s** until you update the header value on the device. There
  is no server-side registry of callers to notify — you have to remember who
  holds the old value.

- **`TELEGRAM_WEBHOOK_SECRET`** — verified via Telegram's own
  `X-Telegram-Bot-Api-Secret-Token` header. Rotating it requires re-registering
  the webhook with the new secret:
  ```bash
  npm run telegram:webhook:set
  ```
  Until you do, Telegram will keep calling the webhook with the *old* secret
  token and every update will be rejected — captures sent via Telegram in that
  window are dropped, not queued (Telegram itself retries a few times, but
  give this one a re-register right after rotating, not "later").

- **`CRON_SECRET`** — checked via `Authorization: Bearer <value>` on the cron
  routes (`src/lib/env/cron.ts`). Rotating it needs the matching update in
  `vercel.json` / Vercel's Cron configuration (wherever the bearer token is
  configured for the scheduled invocations) at the same time, or scheduled
  jobs will 401 until both sides agree.

- **`RECOVERY_CODE`** — the break-glass code for `/api/auth/recover`
  (`[P0-AUTH-01]`). It is optional; rotating or removing it does not touch
  `auth_password_override` (a password already recovered keeps working). Only
  the ability to run recovery *again* changes.

## Not free to rotate — read this before touching it

- **`GOOGLE_TOKEN_ENCRYPTION_KEY`** — encrypts `encrypted_access_token` /
  `encrypted_refresh_token` in `google_oauth_connections`
  (`src/lib/integrations/google-token-crypto.ts`). There is **no key
  versioning**: the stored ciphertext only records the payload *format*
  (`v1.<iv>.<tag>.<ciphertext>`), not which key encrypted it. **Rotating this
  key makes every already-stored Google token permanently undecryptable** —
  Calendar sync and Sheets finance sync will start failing, and the only fix
  is reconnecting Google from Settings (`disconnect` then `connect` again,
  which re-runs the OAuth flow and re-encrypts fresh tokens under the new
  key). Plan for that reconnect step whenever this key changes; don't rotate
  it and walk away.

- **`SUPABASE_SERVICE_ROLE_KEY`** — this is Supabase's key, not one this app
  generates. Supabase Studio lets a project hold two active service-role keys
  during a transition window specifically so you can roll the app's env var
  over without downtime — issue the new key, deploy with it, confirm
  `/api/internal/db-health` is green, then revoke the old key in Supabase.
  Verify this two-key overlap is still how the current Supabase dashboard
  behaves before relying on it; it is not something this repo controls.

## After any rotation

- Re-run `npm run deploy:check` against the target deployment — it validates
  secret length/placeholder patterns and that no two secrets share a value
  (`src/lib/deployment/preflight.ts`).
- Re-run `npm run deploy:smoke -- <url> --authenticated` with the *current*
  `DASHBOARD_PASSWORD` (or recovered password) in your local shell only — it
  exercises the real login → protected page → logout path against the live
  deployment.
