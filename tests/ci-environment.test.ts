import assert from "node:assert/strict";
import test from "node:test";

import { createCiBuildEnvironment } from "../src/lib/ci/environment";
import { checkDeploymentEnvironment } from "../src/lib/deployment/preflight";

test("creates an isolated full-profile CI environment", () => {
  const inheritedAuth = "runner-auth-value-that-must-not-be-inherited";
  const inheritedGitHub = "runner-github-value-that-must-not-be-inherited";
  const environment = createCiBuildEnvironment({
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    AUTH_SECRET: inheritedAuth,
    GITHUB_TOKEN: inheritedGitHub,
    VERCEL_TOKEN: "runner-vercel-value-that-must-not-be-inherited",
  });

  const report = checkDeploymentEnvironment(environment, "full");
  assert.equal(report.ok, true);
  assert.notEqual(environment.AUTH_SECRET, inheritedAuth);
  assert.notEqual(environment.GITHUB_TOKEN, inheritedGitHub);
  assert.equal(environment.VERCEL_TOKEN, undefined);
  assert.equal(environment.NODE_ENV, "production");
  assert.equal(environment.NEXT_TELEMETRY_DISABLED, "1");
});

test("uses unique ephemeral values for independent application secrets", () => {
  const environment = createCiBuildEnvironment({ PATH: process.env.PATH });
  const names = [
    "AUTH_SECRET",
    "DASHBOARD_PASSWORD",
    "API_SECRET",
    "CRON_SECRET",
    "TELEGRAM_WEBHOOK_SECRET",
  ];
  const values = names.map((name) => environment[name]);

  assert.equal(values.every(Boolean), true);
  assert.equal(new Set(values).size, values.length);
  assert.match(environment.NEXT_PUBLIC_SUPABASE_URL ?? "", /^https:\/\//);
});
