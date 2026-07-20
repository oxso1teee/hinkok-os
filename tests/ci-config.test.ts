import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CI uses minimal permissions, immutable actions and safe pull requests", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /permissions:[\s\S]*?\bwrite\b/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /run: npm ci/);
  assert.match(
    workflow,
    /run: npx playwright install --with-deps chromium/,
  );
  assert.match(workflow, /run: npm run repo:check/);
  assert.match(workflow, /run: npm run ci:build/);
  assert.match(workflow, /run: npm run e2e/);
  assert.match(workflow, /if: \$\{\{ failure\(\) && !cancelled\(\) \}\}/);
  assert.match(workflow, /if-no-files-found: ignore/);
});

test("Dependabot covers npm and immutable GitHub Actions references", async () => {
  const dependabot = await readFile(".github/dependabot.yml", "utf8");
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /timezone: Europe\/Riga/);
});
