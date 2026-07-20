export const BACKUP_TABLES = [
  { name: "entities", label: "Entities", orderBy: "created_at", conflict: "id", appendOnly: false },
  { name: "raw_captures", label: "Captures", orderBy: "created_at", conflict: "id", appendOnly: false },
  { name: "tasks", label: "Tasks", orderBy: "created_at", conflict: "id", appendOnly: false },
  { name: "daily_logs", label: "Daily logs", orderBy: "log_date", conflict: "user_id,log_date", appendOnly: false },
  { name: "finance_transactions", label: "Finance", orderBy: "transaction_date", conflict: "user_id,source,external_key", appendOnly: false },
  { name: "weekly_insights", label: "Weekly insights", orderBy: "week_start", conflict: "user_id,week_start", appendOnly: false },
  { name: "memory_chunks", label: "Memory", orderBy: "created_at", conflict: "user_id,source_type,source_key,chunk_index", appendOnly: false },
  { name: "personal_settings", label: "Settings", orderBy: "updated_at", conflict: "user_id", appendOnly: false },
  // audit_log is append-only by design (service_role only has select+insert,
  // see supabase/migrations/202607170001_initial_schema.sql and the
  // prevent_audit_log_mutation() trigger) — restoring it must never attempt
  // an UPDATE, which that grant intentionally disallows.
  { name: "audit_log", label: "Audit log", orderBy: "created_at", conflict: "id", appendOnly: true },
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number]["name"];
