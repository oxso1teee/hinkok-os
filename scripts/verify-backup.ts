import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { decryptBackupEnvelope } from "../src/lib/backups/crypto";
import { backupRowCounts } from "../src/lib/backups/schema";

const MAX_ENCRYPTED_FILE_BYTES = 96 * 1024 * 1024;

async function readEnvelope(path: string): Promise<unknown> {
  const details = await stat(path);
  if (!details.isFile() || details.size < 1 || details.size > MAX_ENCRYPTED_FILE_BYTES) {
    throw new Error("Backup file size is invalid");
  }
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (!argument || argument.startsWith("-")) {
    throw new Error("Usage: npm run backup:verify -- file.hinkok-backup");
  }
  const passphrase = process.env.HINKOK_BACKUP_PASSPHRASE ?? "";
  delete process.env.HINKOK_BACKUP_PASSPHRASE;
  const path = resolve(argument);
  const snapshot = await decryptBackupEnvelope(await readEnvelope(path), passphrase);
  if (process.env.USER_ID && snapshot.userId !== process.env.USER_ID) {
    throw new Error("Backup USER_ID does not match the current environment");
  }
  const counts = backupRowCounts(snapshot);
  const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0);
  process.stdout.write("Backup authentication and checksum are valid.\n");
  process.stdout.write(`Exported: ${snapshot.exportedAt}; rows: ${totalRows}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown verification error";
  process.stderr.write(`Backup verification failed: ${message}\n`);
  process.exitCode = 1;
});
