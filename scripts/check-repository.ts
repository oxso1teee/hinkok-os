import { opendir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  forbiddenRepositoryPath,
  scanRepositoryFile,
  type RepositoryFinding,
} from "../src/lib/ci/repository-check";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".vercel",
  "coverage",
  "node_modules",
  "out",
]);

const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

const MAXIMUM_TEXT_FILE_BYTES = 1_000_000;

async function fallbackFiles(root: string, directory = root): Promise<string[]> {
  const result: string[] = [];
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        result.push(...(await fallbackFiles(root, absolute)));
      }
    } else if (entry.isFile()) {
      result.push(relative(root, absolute));
    }
  }
  return result;
}

async function repositoryFiles(root: string): Promise<string[]> {
  const tracked = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (tracked.status === 0) {
    return tracked.stdout.split("\0").filter(Boolean);
  }
  return fallbackFiles(root);
}

async function inspectFile(
  root: string,
  path: string,
): Promise<RepositoryFinding[]> {
  const pathProblem = forbiddenRepositoryPath(path);
  const findings: RepositoryFinding[] = pathProblem
    ? [
        {
          code: "forbidden_path",
          line: null,
          message: pathProblem,
          path,
        },
      ]
    : [];

  if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) return findings;
  const absolute = resolve(root, path);
  const metadata = await stat(absolute);
  if (metadata.size > MAXIMUM_TEXT_FILE_BYTES) return findings;

  const content = await readFile(absolute, "utf8");
  if (content.includes("\u0000")) return findings;
  return [...findings, ...scanRepositoryFile(path, content).filter(
    (finding) => finding.code !== "forbidden_path",
  )];
}

async function main(): Promise<void> {
  const root = process.cwd();
  const files = (await repositoryFiles(root)).sort();
  const findings: RepositoryFinding[] = [];

  for (const path of files) {
    findings.push(...(await inspectFile(root, path)));
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      const location = finding.line
        ? `${finding.path}:${finding.line}`
        : finding.path;
      process.stderr.write(
        `REPOSITORY ERROR [${finding.code}] ${location} — ${finding.message}\n`,
      );
    }
    process.stderr.write(
      `Repository check failed with ${findings.length} finding(s).\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Repository check passed for ${files.length} file(s). No secret values were printed.\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Repository check failed: ${message}\n`);
  process.exitCode = 1;
});
