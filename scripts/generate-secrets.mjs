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
  RECOVERY_CODE: secret(32),
  SCHEDULED_BACKUP_PASSPHRASE: secret(24),
};

process.stdout.write(
  [
    `AUTH_SECRET=${values.AUTH_SECRET}`,
    `DASHBOARD_PASSWORD=${values.DASHBOARD_PASSWORD}`,
    `API_SECRET=${values.API_SECRET}`,
    `TELEGRAM_WEBHOOK_SECRET=${values.TELEGRAM_WEBHOOK_SECRET}`,
    `CRON_SECRET=${values.CRON_SECRET}`,
    `RECOVERY_CODE=${values.RECOVERY_CODE}`,
    `SCHEDULED_BACKUP_PASSPHRASE=${values.SCHEDULED_BACKUP_PASSPHRASE}`,
    "",
    "# RECOVERY_CODE is a break-glass credential: save it somewhere safe and",
    "# separate from this .env file (a password manager, not a note next to",
    "# the deployment). It is the only way to regain access if",
    "# DASHBOARD_PASSWORD is lost, via POST /api/auth/recover.",
    "",
    "# SCHEDULED_BACKUP_PASSPHRASE decrypts every weekly backup the cron job",
    "# sends to Telegram. Save it the same way as RECOVERY_CODE: losing it",
    "# makes every delivered backup unrecoverable.",
    "",
  ].join("\n"),
);
