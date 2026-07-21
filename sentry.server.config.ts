import * as Sentry from "@sentry/nextjs";

// [P0-OBS2-01] Server-side error tracking, off by default. Set SENTRY_DSN in
// the deployment environment to activate — see docs/OPERATIONS_MONITORING.md
// for the one-time setup steps (creating a Sentry project and DSN is a
// manual account-creation step this codebase cannot do on its own).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
