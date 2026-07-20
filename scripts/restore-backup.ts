import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { decryptBackupEnvelope } from "../src/lib/backups/crypto";
import {
  createBackupRestorePlan,
  restoreBackupSnapshot,
} from "../src/lib/backups/repository";

const MAX_ENCRYPTED_FILE_BYTES = 96 * 1024 * 1024;

function parseArguments(): { path: string; apply: boolean } {
  const values = process.argv.slice(2);
  const apply = values.includes("--apply");
  const paths = values.filter((value) => value !== "--apply");
  if (paths.length !== 1 || paths[0].startsWith("-")) {
    throw new Error("Usage: npm run backup:restore -- file.hinkok-backup [--apply]");
  }
  return { path: resolve(paths[0]), apply };
}

async function readEnvelope(path: string): Promise<unknown> {
  const details = await stat(path);
  if (!details.isFile() || details.size < 1 || details.size > MAX_ENCRYPTED_FILE_BYTES) {
    throw new Error("Backup file size is invalid");
  }
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function printPlan(plan: ReturnType<typeof createBackupRestorePlan>): void {
  process.stdout.write(`Backup exported: ${plan.exportedAt}\n`);
  for (const [table, count] of Object.entries(plan.tables)) {
    process.stdout.write(`${table}: ${count}\n`);
  }
  process.stdout.write(`Total rows: ${plan.totalRows}\n`);
}

async function main(): Promise<void> {
  const options = parseArguments();
  const passphrase = process.env.HINKOK_BACKUP_PASSPHRASE ?? "";
  delete process.env.HINKOK_BACKUP_PASSPHRASE;
  const snapshot = await decryptBackupEnvelope(
    await readEnvelope(options.path),
    passphrase,
  );
  const plan = createBackupRestorePlan(snapshot);
  printPlan(plan);

  if (!options.apply) {
    process.stdout.write("Dry run only. No database rows were changed.\n");
    return;
  }
  if (process.env.HINKOK_RESTORE_CONFIRM !== "RESTORE") {
    throw new Error("Set HINKOK_RESTORE_CONFIRM=RESTORE to allow --apply");
  }
  delete process.env.HINKOK_RESTORE_CONFIRM;
  await restoreBackupSnapshot(snapshot);
  process.stdout.write("Backup restore completed with idempotent upserts.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown restore error";
  process.stderr.write(`Backup restore failed: ${message}\n`);
  process.exitCode = 1;
});
