import { randomBytes } from "node:crypto";

import type { DeploymentEnvironment } from "@/lib/deployment/preflight";

function randomSecret(bytes = 36): string {
  return randomBytes(bytes).toString("base64url");
}

function preserve(
  source: Readonly<Record<string, string | undefined>>,
  target: NodeJS.ProcessEnv,
  name: string,
): void {
  const value = source[name];
  if (value) target[name] = value;
}

export function createCiBuildEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env,
): NodeJS.ProcessEnv & DeploymentEnvironment {
  const environment: NodeJS.ProcessEnv = {
    CI: "true",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    TZ: "UTC",
  };

  for (const name of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SYSTEMROOT",
    "GITHUB_ACTIONS",
    "RUNNER_ARCH",
    "RUNNER_OS",
  ]) {
    preserve(source, environment, name);
  }

  const project = randomSecret(9).toLowerCase();
  environment.NEXT_PUBLIC_SUPABASE_URL =
    `https://ci-${project}.supabase.co`;
  environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = `ci_anon_${randomSecret()}`;
  environment.SUPABASE_SERVICE_ROLE_KEY = `ci_service_${randomSecret()}`;
  environment.USER_ID = "ci_release_gate";
  environment.USER_TIMEZONE = "Europe/Riga";

  environment.AUTH_SECRET = randomSecret(64);
  environment.DASHBOARD_PASSWORD = randomSecret(32);
  environment.API_SECRET = randomSecret(48);
  environment.CRON_SECRET = randomSecret(48);

  environment.OPENAI_API_KEY = `sk-proj-${randomSecret(36)}`;
  environment.OPENAI_CLASSIFIER_MODEL = "gpt-4o-mini";
  environment.OPENAI_TRANSCRIBE_MODEL = "whisper-1";
  environment.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
  environment.ANTHROPIC_API_KEY = `sk-ant-${randomSecret(36)}`;
  environment.ANTHROPIC_MODEL = "claude-sonnet-4-6";
  environment.ANTHROPIC_FAST_MODEL = "claude-haiku-4-5";

  environment.TELEGRAM_BOT_TOKEN = `123456789:${randomSecret(36)}`;
  environment.TELEGRAM_WEBHOOK_SECRET = randomSecret(48);
  environment.TELEGRAM_USER_ID = "123456789";

  environment.GOOGLE_CALENDAR_ID = "ci-calendar@example.invalid";
  environment.GOOGLE_SERVICE_ACCOUNT_EMAIL =
    "ci@hinkok-ci.iam.gserviceaccount.com";
  environment.GOOGLE_SERVICE_ACCOUNT_KEY = [
    "-----BEGIN PRIVATE KEY-----",
    randomSecret(72),
    "-----END PRIVATE KEY-----",
  ].join("\n");
  environment.GOOGLE_SHEETS_FINANCE_ID = `ci-sheet-${randomSecret(12)}`;
  environment.GOOGLE_SHEETS_FINANCE_RANGE = "Transactions!A:G";
  environment.GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY = "EUR";

  environment.GITHUB_TOKEN = `github_pat_${randomSecret(42)}`;
  environment.OBSIDIAN_REPO = "ci/private-vault";
  environment.OBSIDIAN_BRANCH = "main";
  environment.OBSIDIAN_VAULT_NAME = "HinkoK-CI";

  return environment;
}
