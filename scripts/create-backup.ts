import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { encryptBackupSnapshot } from "../src/lib/backups/crypto";
import { collectBackupSnapshot } from "../src/lib/backups/repository";
import { backupRowCounts } from "../src/lib/backups/schema";

function outputPath(argument: string | undefined): string {
  if (argument?.startsWith("-")) {
    throw new Error("Usage: npm run backup:create -- [output.hinkok-backup]");
  }
  const fallback = `backups/hinkok-os-${new Date().toISOString().replace(/[:.]/g, "-")}.hinkok-backup`;
  const path = resolve(argument ?? fallback);
  if (!path.endsWith(".hinkok-backup")) {
    throw new Error("Backup filename must end with .hinkok-backup");
  }
  return path;
}

async function main(): Promise<void> {
  const passphrase = process.env.HINKOK_BACKUP_PASSPHRASE ?? "";
  delete process.env.HINKOK_BACKUP_PASSPHRASE;
  const path = outputPath(process.argv[2]);
  const snapshot = await collectBackupSnapshot();
  const envelope = await encryptBackupSnapshot(snapshot, passphrase);
  const bytes = Buffer.from(JSON.stringify(envelope), "utf8");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  const counts = backupRowCounts(snapshot);
  const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0);
  process.stdout.write(`Encrypted backup created: ${path}\n`);
  process.stdout.write(`Rows: ${totalRows}; encrypted bytes: ${bytes.length}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown backup error";
  process.stderr.write(`Backup creation failed: ${message}\n`);
  process.exitCode = 1;
});
