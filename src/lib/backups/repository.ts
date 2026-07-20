import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import {
  BACKUP_TABLES,
  MAX_BACKUP_ROWS,
  SNAPSHOT_FORMAT,
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_SCHEMA_MIGRATION,
  backupRowCounts,
  emptyBackupTables,
  validateBackupSnapshot,
  type BackupRow,
  type BackupSnapshot,
  type BackupTableName,
} from "@/lib/backups/schema";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

const PAGE_SIZE = 500;
const RESTORE_BATCH_SIZE = 200;

type DatabaseError = { message?: string } | null;
type BackupQueryResult = { data: BackupRow[] | null; error: DatabaseError };
type BackupQuery = {
  eq(column: "user_id", value: string): BackupQuery;
  order(column: string, options: { ascending: boolean }): BackupQuery;
  range(from: number, to: number): PromiseLike<BackupQueryResult>;
};
type BackupTable = {
  select(columns: "*"): BackupQuery;
  upsert(
    rows: BackupRow[],
    options: { onConflict: string; ignoreDuplicates: boolean },
  ): PromiseLike<{ error: DatabaseError }>;
};
type BackupDatabase = {
  from(table: BackupTableName): BackupTable;
};
type BackupCountDatabase = {
  from(table: BackupTableName): {
    select(
      columns: "*",
      options: { count: "exact"; head: true },
    ): {
      eq(
        column: "user_id",
        value: string,
      ): PromiseLike<{ count: number | null; error: DatabaseError }>;
    };
  };
};

function backupDb(): BackupDatabase {
  return db() as unknown as BackupDatabase;
}

export async function getBackupOverview(): Promise<{
  dataStatus: "ready" | "unavailable";
  counts: Record<BackupTableName, number>;
  totalRows: number;
}> {
  const countDb = db() as unknown as BackupCountDatabase;
  const results = await Promise.all(
    BACKUP_TABLES.map(async (definition) => {
      const result = await countDb
        .from(definition.name)
        .select("*", { count: "exact", head: true })
        .eq("user_id", serverEnv.USER_ID);
      return { name: definition.name, ...result };
    }),
  );
  const counts = Object.fromEntries(
    results.map((result) => [result.name, result.count ?? 0]),
  ) as Record<BackupTableName, number>;
  return {
    dataStatus: results.some((result) => result.error)
      ? "unavailable"
      : "ready",
    counts,
    totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0),
  };
}

async function readTable(table: BackupTableName, orderBy: string): Promise<BackupRow[]> {
  const rows: BackupRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await backupDb()
      .from(table)
      .select("*")
      .eq("user_id", serverEnv.USER_ID)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (result.error) {
      throw new Error(`Unable to export ${table}`, { cause: result.error });
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (rows.length > MAX_BACKUP_ROWS) throw new Error("Backup row limit exceeded");
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function collectBackupSnapshot(
  now = new Date(),
): Promise<BackupSnapshot> {
  const tables = emptyBackupTables();
  let totalRows = 0;
  for (const definition of BACKUP_TABLES) {
    const rows = await readTable(definition.name, definition.orderBy);
    totalRows += rows.length;
    if (totalRows > MAX_BACKUP_ROWS) throw new Error("Backup row limit exceeded");
    tables[definition.name] = rows;
  }
  return validateBackupSnapshot({
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_FORMAT_VERSION,
    schemaMigration: SNAPSHOT_SCHEMA_MIGRATION,
    exportedAt: now.toISOString(),
    userId: serverEnv.USER_ID,
    tables,
  });
}

export type BackupRestorePlan = {
  userId: string;
  exportedAt: string;
  totalRows: number;
  tables: ReturnType<typeof backupRowCounts>;
};

export function createBackupRestorePlan(snapshot: BackupSnapshot): BackupRestorePlan {
  const verified = validateBackupSnapshot(snapshot);
  if (verified.userId !== serverEnv.USER_ID) {
    throw new Error("Backup USER_ID does not match the configured identity");
  }
  const tables = backupRowCounts(verified);
  return {
    userId: verified.userId,
    exportedAt: verified.exportedAt,
    totalRows: Object.values(tables).reduce((sum, count) => sum + count, 0),
    tables,
  };
}

export async function restoreBackupSnapshot(
  snapshot: BackupSnapshot,
): Promise<BackupRestorePlan> {
  const verified = validateBackupSnapshot(snapshot);
  const plan = createBackupRestorePlan(verified);

  for (const definition of BACKUP_TABLES) {
    const rows = verified.tables[definition.name];
    for (let from = 0; from < rows.length; from += RESTORE_BATCH_SIZE) {
      const batch = rows.slice(from, from + RESTORE_BATCH_SIZE);
      const { error } = await backupDb().from(definition.name).upsert(batch, {
        onConflict: definition.conflict,
        // audit_log's service_role grant is select+insert only (append-only
        // by design), so ON CONFLICT DO UPDATE would fail with 42501; use
        // DO NOTHING there instead of the update-existing-rows default.
        ignoreDuplicates: definition.appendOnly,
      });
      if (error) {
        throw new Error(`Unable to restore ${definition.name}`, { cause: error });
      }
    }
  }

  await recordAuditEvent({
    action: "backup.restored",
    resourceType: "backup",
    metadata: {
      exportedAt: plan.exportedAt,
      totalRows: plan.totalRows,
    },
  });
  return plan;
}
