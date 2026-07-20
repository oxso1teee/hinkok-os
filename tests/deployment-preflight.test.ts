import assert from "node:assert/strict";
import test from "node:test";

import {
  checkDeploymentEnvironment,
  type DeploymentEnvironment,
} from "../src/lib/deployment/preflight";

function secret(seed: string, length: number): string {
  return `${seed}Az09_-`.repeat(Math.ceil(length / (seed.length + 6))).slice(0, length);
}

function completeEnvironment(): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://hinkok.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: secret("anon", 64),
    SUPABASE_SERVICE_ROLE_KEY: secret("service", 80),
    USER_ID: "hinkok_owner",
    USER_TIMEZONE: "Europe/Riga",
    AUTH_SECRET: secret("auth", 72),
    DASHBOARD_PASSWORD: secret("dashboard", 28),
    API_SECRET: secret("api", 48),
    OPENAI_API_KEY: `sk-proj-${secret("openai", 40)}`,
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    CRON_SECRET: secret("cron", 48),
    TELEGRAM_BOT_TOKEN: `123456789:${secret("telegram", 40)}`,
    TELEGRAM_WEBHOOK_SECRET: secret("webhook", 48),
    TELEGRAM_USER_ID: "123456789",
    GOOGLE_CALENDAR_ID: "calendar@example.com",
    GOOGLE_SERVICE_ACCOUNT_EMAIL:
      "hinkok@sample-project.iam.gserviceaccount.com",
    GOOGLE_SERVICE_ACCOUNT_KEY:
      "-----BEGIN PRIVATE KEY-----\\nMIIExampleKeyMaterial\\n-----END PRIVATE KEY-----\\n",
    GOOGLE_SHEETS_FINANCE_ID: "sheet-id-123",
    GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY: "EUR",
    GITHUB_TOKEN: `github_pat_${secret("github", 32)}`,
    OBSIDIAN_REPO: "owner/private-vault",
    OBSIDIAN_BRANCH: "main",
    OBSIDIAN_VAULT_NAME: "HinkoK",
  };
}

test("accepts a complete full production environment", () => {
  const report = checkDeploymentEnvironment(completeEnvironment(), "full");
  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.equal(report.integrations.every((item) => item.configured), true);
});

test("fails closed when core variables are missing", () => {
  const report = checkDeploymentEnvironment({}, "core");
  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some(
      (issue) =>
        issue.code === "missing_variable" && issue.variable === "AUTH_SECRET",
    ),
    true,
  );
});

test("rejects partial optional integrations in every profile", () => {
  const environment = completeEnvironment();
  delete environment.TELEGRAM_USER_ID;

  const report = checkDeploymentEnvironment(environment, "core");
  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some((issue) => issue.code === "partial_integration"),
    true,
  );
});

test("the core profile permits fully disabled integrations with warnings", () => {
  const environment = completeEnvironment();
  for (const name of [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_USER_ID",
    "GOOGLE_CALENDAR_ID",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_KEY",
    "GOOGLE_SHEETS_FINANCE_ID",
    "GITHUB_TOKEN",
    "OBSIDIAN_REPO",
    "OBSIDIAN_VAULT_NAME",
  ]) {
    delete environment[name];
  }

  const report = checkDeploymentEnvironment(environment, "core");
  assert.equal(report.ok, true);
  assert.equal(report.warnings.length, 3);
});

test("rejects placeholder and reused secrets without returning their values", () => {
  const environment = completeEnvironment();
  environment.CRON_SECRET = "changeme";
  environment.API_SECRET = environment.AUTH_SECRET;

  const report = checkDeploymentEnvironment(environment, "full");
  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some((issue) => issue.code === "placeholder_secret"),
    true,
  );
  assert.equal(
    report.errors.some((issue) => issue.code === "reused_secret"),
    true,
  );
  assert.equal(
    JSON.stringify(report).includes(environment.AUTH_SECRET),
    false,
  );
});

test("rejects an unsafe Supabase URL and incompatible embedding model", () => {
  const environment = completeEnvironment();
  environment.NEXT_PUBLIC_SUPABASE_URL =
    "http://user:password@example.test/project";
  environment.OPENAI_EMBEDDING_MODEL = "text-embedding-3-large";

  const report = checkDeploymentEnvironment(environment, "full");
  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some((issue) => issue.code === "invalid_supabase_url"),
    true,
  );
  assert.equal(
    report.errors.some((issue) => issue.code === "invalid_embedding_model"),
    true,
  );
});

test("rejects an invalid timezone and malformed Google private key", () => {
  const environment: DeploymentEnvironment = {
    ...completeEnvironment(),
    USER_TIMEZONE: "Europe/Nowhere",
    GOOGLE_SERVICE_ACCOUNT_KEY: "not-a-private-key",
  };

  const report = checkDeploymentEnvironment(environment, "full");
  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some((issue) => issue.code === "invalid_timezone"),
    true,
  );
  assert.equal(
    report.errors.some((issue) => issue.code === "invalid_google_key"),
    true,
  );
});

test("accepts OAuth as the Google authentication method", () => {
  const environment = completeEnvironment();
  delete environment.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete environment.GOOGLE_SERVICE_ACCOUNT_KEY;
  environment.GOOGLE_OAUTH_CLIENT_ID =
    "123456789.apps.googleusercontent.com";
  environment.GOOGLE_OAUTH_CLIENT_SECRET = secret("google-client", 32);
  environment.GOOGLE_OAUTH_REDIRECT_URI =
    "https://hinkok-os-phi.vercel.app/api/integrations/google/callback";
  environment.GOOGLE_TOKEN_ENCRYPTION_KEY = secret("google-token", 48);

  const report = checkDeploymentEnvironment(environment, "full");
  assert.equal(report.ok, true);
  assert.equal(
    report.integrations.find((item) => item.name === "google")?.configured,
    true,
  );
});

test("rejects a partially configured OAuth client", () => {
  const environment = completeEnvironment();
  delete environment.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete environment.GOOGLE_SERVICE_ACCOUNT_KEY;
  environment.GOOGLE_OAUTH_CLIENT_ID =
    "123456789.apps.googleusercontent.com";

  const report = checkDeploymentEnvironment(environment, "full");
  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some(
      (issue) =>
        issue.code === "partial_integration" &&
        issue.message.includes("OAuth"),
    ),
    true,
  );
});
