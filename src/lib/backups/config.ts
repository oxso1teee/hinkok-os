export const BACKUP_TABLES = [
  { name: "entities", label: "Entities", orderBy: "created_at", conflict: "id" },
  { name: "raw_captures", label: "Captures", orderBy: "created_at", conflict: "id" },
  { name: "tasks", label: "Tasks", orderBy: "created_at", conflict: "id" },
  { name: "daily_logs", label: "Daily logs", orderBy: "log_date", conflict: "user_id,log_date" },
  { name: "finance_transactions", label: "Finance", orderBy: "transaction_date", conflict: "user_id,source,external_key" },
  { name: "weekly_insights", label: "Weekly insights", orderBy: "week_start", conflict: "user_id,week_start" },
  { name: "memory_chunks", label: "Memory", orderBy: "created_at", conflict: "user_id,source_type,source_key,chunk_index" },
  { name: "personal_settings", label: "Settings", orderBy: "updated_at", conflict: "user_id" },
  { name: "audit_log", label: "Audit log", orderBy: "created_at", conflict: "id" },
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number]["name"];
