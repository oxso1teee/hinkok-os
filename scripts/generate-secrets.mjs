import { randomBytes } from "node:crypto";

function secret(byteLength) {
  return randomBytes(byteLength).toString("base64url");
}

const values = {
  AUTH_SECRET: secret(48),
  DASHBOARD_PASSWORD: secret(18),
  API_SECRET: secret(32),
  TELEGRAM_WEBHOOK_SECRET: secret(32),
  CRON_SECRET: secret(32),
};

process.stdout.write(
  [
    `AUTH_SECRET=${values.AUTH_SECRET}`,
    `DASHBOARD_PASSWORD=${values.DASHBOARD_PASSWORD}`,
    `API_SECRET=${values.API_SECRET}`,
    `TELEGRAM_WEBHOOK_SECRET=${values.TELEGRAM_WEBHOOK_SECRET}`,
    `CRON_SECRET=${values.CRON_SECRET}`,
    "",
  ].join("\n"),
);
