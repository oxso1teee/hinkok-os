import * as Sentry from "@sentry/nextjs";

// Edge runtime counterpart of sentry.server.config.ts — covers src/proxy.ts
// (Next.js middleware always runs on the Edge runtime). Same off-by-default
// behavior: no-ops unless SENTRY_DSN is set.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
