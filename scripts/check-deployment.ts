import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  checkDeploymentEnvironment,
  type DeploymentEnvironment,
  type DeploymentProfile,
} from "../src/lib/deployment/preflight";

type Arguments = {
  envFile: string | null;
  profile: DeploymentProfile;
};

function usage(): never {
  process.stderr.write(
    "Usage: npm run deploy:check -- [--profile full|core] [--env-file PATH]\n",
  );
  process.exit(2);
}

function parseArguments(values: string[]): Arguments {
  let envFile: string | null = null;
  let profile: DeploymentProfile = "full";

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--env-file") {
      envFile = values[index + 1] ?? usage();
      index += 1;
    } else if (value === "--profile") {
      const candidate = values[index + 1];
      if (candidate !== "full" && candidate !== "core") usage();
      profile = candidate;
      index += 1;
    } else if (value === "--help" || value === "-h") {
      usage();
    } else {
      usage();
    }
  }

  return { envFile, profile };
}

function parseEnvFile(source: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [index, originalLine] of source.split(/\r?\n/).entries()) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Invalid environment line ${index + 1}.`);
    }

    const name = normalized.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid environment name on line ${index + 1}.`);
    }
    if (Object.hasOwn(result, name)) {
      throw new Error(`Duplicate environment variable ${name}.`);
    }

    let value = normalized.slice(separator + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    result[name] = value;
  }

  return result;
}

async function environmentFromFile(path: string): Promise<DeploymentEnvironment> {
  const absolutePath = resolve(process.cwd(), path);
  const contents = await readFile(absolutePath, "utf8");
  return { ...process.env, ...parseEnvFile(contents) };
}

function marker(configured: boolean): string {
  return configured ? "configured" : "disabled";
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const environment = options.envFile
    ? await environmentFromFile(options.envFile)
    : process.env;
  const report = checkDeploymentEnvironment(environment, options.profile);

  process.stdout.write(`Deployment profile: ${report.profile}\n`);
  for (const integration of report.integrations) {
    process.stdout.write(
      `- ${integration.name}: ${marker(integration.configured)}${
        integration.required ? " (required)" : ""
      }\n`,
    );
  }

  for (const warning of report.warnings) {
    process.stdout.write(`WARNING [${warning.code}] ${warning.message}\n`);
  }

  if (!report.ok) {
    for (const error of report.errors) {
      process.stderr.write(`ERROR [${error.code}] ${error.message}\n`);
    }
    process.stderr.write(
      `Deployment preflight failed with ${report.errors.length} error(s).\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Deployment preflight passed. No secret values were printed.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Deployment preflight failed: ${message}\n`);
  process.exitCode = 1;
});
