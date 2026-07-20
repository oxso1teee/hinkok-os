import assert from "node:assert/strict";
import test from "node:test";

import {
  forbiddenRepositoryPath,
  scanRepositoryFile,
} from "../src/lib/ci/repository-check";

test("allows the empty committed environment template", () => {
  const findings = scanRepositoryFile(
    ".env.example",
    "AUTH_SECRET=\nOPENAI_API_KEY=\nNEXT_PUBLIC_SUPABASE_URL=\n",
  );
  assert.deepEqual(findings, []);
});

test("rejects private environment and key paths", () => {
  assert.match(
    forbiddenRepositoryPath(".env.production") ?? "",
    /must never/,
  );
  assert.match(
    forbiddenRepositoryPath("credentials/private.pem") ?? "",
    /must never/,
  );
  assert.match(
    forbiddenRepositoryPath("backups/manual.hinkok-backup") ?? "",
    /must never/,
  );
  assert.equal(forbiddenRepositoryPath(".env.example"), null);
});

test("detects provider tokens without returning the matched value", () => {
  const leakedValue = `sk-proj-${"A1b2_".repeat(8)}`;
  const findings = scanRepositoryFile(
    "src/config.ts",
    `export const token = "${leakedValue}";`,
  );

  assert.equal(findings.some((finding) => finding.code === "openai_key"), true);
  assert.equal(JSON.stringify(findings).includes(leakedValue), false);
});

test("detects non-empty secret assignments", () => {
  const findings = scanRepositoryFile(
    "config/example.env",
    "API_SECRET=a-committed-value-that-should-not-exist\n",
  );
  assert.equal(
    findings.some((finding) => finding.code === "assigned_secret"),
    true,
  );
});

test("rejects server secret references in client modules", () => {
  const findings = scanRepositoryFile(
    "src/components/unsafe.tsx",
    '"use client";\nconsole.log(process.env.SUPABASE_SERVICE_ROLE_KEY);\n',
  );
  assert.equal(
    findings.some((finding) => finding.code === "client_secret_reference"),
    true,
  );
});
