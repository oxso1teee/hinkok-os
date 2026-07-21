import "server-only";

import { z } from "zod";

const optionalPassphrase = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(16).max(1_024).optional(),
);

const backupEnvironmentSchema = z.object({
  SCHEDULED_BACKUP_PASSPHRASE: optionalPassphrase,
});

const parsedEnvironment = backupEnvironmentSchema.safeParse({
  SCHEDULED_BACKUP_PASSPHRASE: process.env.SCHEDULED_BACKUP_PASSPHRASE,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid backup environment variables: ${parsedEnvironment.error.issues
      .map((issue) => issue.message)
      .join("; ")}`,
  );
}

export const backupEnv = Object.freeze(parsedEnvironment.data);

export function isScheduledBackupConfigured(): boolean {
  return typeof backupEnv.SCHEDULED_BACKUP_PASSPHRASE === "string";
}
