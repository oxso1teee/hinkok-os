import type { Json } from "@/types/database";
import {
  BACKUP_TABLES,
  type BackupTableName,
} from "@/lib/backups/config";

export { BACKUP_TABLES } from "@/lib/backups/config";
export type { BackupTableName } from "@/lib/backups/config";

export const BACKUP_FORMAT = "hinkok-os-encrypted-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const SNAPSHOT_FORMAT = "hinkok-os-snapshot";
export const SNAPSHOT_FORMAT_VERSION = 1;
export const SNAPSHOT_SCHEMA_MIGRATION = "202607180013_personal_settings.sql";
export const MAX_BACKUP_PLAINTEXT_BYTES = 64 * 1024 * 1024;
export const MAX_BACKUP_ROWS = 200_000;

export type BackupRow = Record<string, Json>;
export type BackupTables = Record<BackupTableName, BackupRow[]>;

export type BackupSnapshot = {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_FORMAT_VERSION;
  schemaMigration: typeof SNAPSHOT_SCHEMA_MIGRATION;
  exportedAt: string;
  userId: string;
  tables: BackupTables;
};

export type EncryptedBackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_FORMAT_VERSION;
  cipher: "aes-256-gcm";
  kdf: {
    name: "scrypt";
    salt: string;
    cost: number;
    blockSize: number;
    parallelization: number;
    keyLength: 32;
  };
  iv: string;
  authTag: string;
  plaintextSha256: string;
  ciphertext: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (item) => item === undefined || isJson(item),
  );
}

function strictBase64(value: unknown, minimumBytes: number, maximumBytes: number): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const buffer = Buffer.from(value, "base64");
  return (
    buffer.length >= minimumBytes &&
    buffer.length <= maximumBytes &&
    buffer.toString("base64") === value
  );
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

export function parseEncryptedBackupEnvelope(
  value: unknown,
): EncryptedBackupEnvelope | null {
  if (!isRecord(value) || Object.keys(value).length !== 8) return null;
  const kdf = value.kdf;
  if (!isRecord(kdf) || Object.keys(kdf).length !== 6) return null;
  if (
    value.format !== BACKUP_FORMAT ||
    value.version !== BACKUP_FORMAT_VERSION ||
    value.cipher !== "aes-256-gcm" ||
    kdf.name !== "scrypt" ||
    typeof kdf.cost !== "number" ||
    !Number.isInteger(kdf.cost) ||
    !isPowerOfTwo(kdf.cost) ||
    kdf.cost < 16_384 ||
    kdf.cost > 65_536 ||
    kdf.blockSize !== 8 ||
    kdf.parallelization !== 1 ||
    kdf.keyLength !== 32 ||
    !strictBase64(kdf.salt, 16, 32) ||
    !strictBase64(value.iv, 12, 12) ||
    !strictBase64(value.authTag, 16, 16) ||
    typeof value.plaintextSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.plaintextSha256) ||
    !strictBase64(value.ciphertext, 1, MAX_BACKUP_PLAINTEXT_BYTES + 32)
  ) {
    return null;
  }
  return value as unknown as EncryptedBackupEnvelope;
}

export function emptyBackupTables(): BackupTables {
  return Object.fromEntries(
    BACKUP_TABLES.map((table) => [table.name, []]),
  ) as unknown as BackupTables;
}

export function validateBackupSnapshot(value: unknown): BackupSnapshot {
  if (!isRecord(value) || Object.keys(value).length !== 6) {
    throw new Error("Invalid backup snapshot structure");
  }
  if (
    value.format !== SNAPSHOT_FORMAT ||
    value.version !== SNAPSHOT_FORMAT_VERSION ||
    value.schemaMigration !== SNAPSHOT_SCHEMA_MIGRATION ||
    typeof value.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    typeof value.userId !== "string" ||
    value.userId.trim().length < 1 ||
    value.userId.length > 128 ||
    !isRecord(value.tables)
  ) {
    throw new Error("Invalid backup snapshot metadata");
  }
  const tableKeys = Object.keys(value.tables).sort();
  const expectedKeys = BACKUP_TABLES.map((table) => table.name).sort();
  if (JSON.stringify(tableKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Backup table set is incompatible");
  }

  let rowCount = 0;
  const tables = emptyBackupTables();
  for (const definition of BACKUP_TABLES) {
    const rows = value.tables[definition.name];
    if (!Array.isArray(rows)) throw new Error(`Invalid ${definition.name} backup rows`);
    rowCount += rows.length;
    if (rowCount > MAX_BACKUP_ROWS) throw new Error("Backup row limit exceeded");
    tables[definition.name] = rows.map((row) => {
      if (!isRecord(row) || !isJson(row)) {
        throw new Error(`Invalid ${definition.name} backup row`);
      }
      if (row.user_id !== value.userId) {
        throw new Error(`Backup user scope mismatch in ${definition.name}`);
      }
      return row as BackupRow;
    });
  }

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_FORMAT_VERSION,
    schemaMigration: SNAPSHOT_SCHEMA_MIGRATION,
    exportedAt: value.exportedAt,
    userId: value.userId,
    tables,
  };
}

export function backupRowCounts(
  snapshot: BackupSnapshot,
): Record<BackupTableName, number> {
  return Object.fromEntries(
    BACKUP_TABLES.map((table) => [table.name, snapshot.tables[table.name].length]),
  ) as Record<BackupTableName, number>;
}
