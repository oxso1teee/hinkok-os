import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { createCiBuildEnvironment } from "../src/lib/ci/environment";
import { checkDeploymentEnvironment } from "../src/lib/deployment/preflight";

async function main(): Promise<void> {
  const environment = createCiBuildEnvironment(process.env);
  const report = checkDeploymentEnvironment(environment, "full");
  if (!report.ok) {
    for (const issue of report.errors) {
      process.stderr.write(`CI environment error [${issue.code}] ${issue.message}\n`);
    }
    throw new Error("Unable to construct an isolated CI build environment.");
  }

  process.stdout.write(
    "Starting Next.js build with isolated, ephemeral credentials.\n",
  );
  const nextCli = resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextCli, "build"], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });

  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Next.js build terminated by ${signal}.`));
      } else {
        resolveExit(code ?? 1);
      }
    });
  });

  if (exitCode !== 0) {
    throw new Error(`Next.js CI build failed with exit code ${exitCode}.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`CI build failed: ${message}\n`);
  process.exitCode = 1;
});
