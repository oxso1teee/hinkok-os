import {
  normalizeDeploymentUrl,
  runDeploymentSmoke,
} from "../src/lib/deployment/smoke";

type Arguments = {
  authenticated: boolean;
  deploymentUrl: string;
};

function usage(): never {
  process.stderr.write(
    "Usage: npm run deploy:smoke -- <https://deployment.example> [--authenticated]\n" +
      "Set DASHBOARD_PASSWORD in the local process environment only when using --authenticated.\n",
  );
  process.exit(2);
}

function parseArguments(values: string[]): Arguments {
  let authenticated = false;
  let deploymentUrl = "";

  for (const value of values) {
    if (value === "--authenticated") {
      authenticated = true;
    } else if (value === "--help" || value === "-h") {
      usage();
    } else if (!deploymentUrl) {
      deploymentUrl = value;
    } else {
      usage();
    }
  }

  if (!deploymentUrl) usage();
  return { authenticated, deploymentUrl: normalizeDeploymentUrl(deploymentUrl) };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const dashboardPassword = options.authenticated
    ? process.env.DASHBOARD_PASSWORD
    : undefined;

  if (options.authenticated && !dashboardPassword) {
    throw new Error(
      "DASHBOARD_PASSWORD is required in the local environment for authenticated smoke checks.",
    );
  }

  const checks = await runDeploymentSmoke(options.deploymentUrl, {
    dashboardPassword,
  });
  for (const check of checks) {
    process.stdout.write(
      `${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}\n`,
    );
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    process.stderr.write(`Deployment smoke failed: ${failed.length} check(s).\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Deployment smoke passed: ${checks.length} check(s).\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Deployment smoke failed: ${message}\n`);
  process.exitCode = 1;
});
