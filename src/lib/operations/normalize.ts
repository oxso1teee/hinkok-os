export const SYSTEM_JOB_NAMES = [
  "obsidian_sync",
  "calendar_sync",
  "finance_sync",
  "weekly_insight",
  "backup_scheduled",
] as const;

export type SystemJobName = (typeof SYSTEM_JOB_NAMES)[number];
export type SystemJobTrigger = "cron" | "manual";
export type SystemJobStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "abandoned";
export type SystemJobHealth =
  | "healthy"
  | "running"
  | "pending"
  | "stale"
  | "attention"
  | "disabled"
  | "unavailable";

export type SystemJobRun = {
  id: string;
  jobName: SystemJobName;
  trigger: SystemJobTrigger;
  status: SystemJobStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  summary: Record<string, string | number | boolean | null>;
  errorCode: string | null;
};

export type SystemJobDefinition = {
  name: SystemJobName;
  label: string;
  description: string;
  schedule: string;
  expectedWithinMs: number;
};

export const SYSTEM_JOB_DEFINITIONS: readonly SystemJobDefinition[] = [
  {
    name: "obsidian_sync",
    label: "Obsidian memory",
    description: "Синхронизация изменённых Markdown-заметок с векторной памятью.",
    schedule: "ежедневно · 03:00 UTC",
    expectedWithinMs: 36 * 60 * 60 * 1_000,
  },
  {
    name: "calendar_sync",
    label: "Google Calendar",
    description: "Инкрементальная синхронизация событий с локальной проекцией HOME.",
    schedule: "каждые 15 минут · UTC",
    expectedWithinMs: 60 * 60 * 1_000,
  },
  {
    name: "finance_sync",
    label: "Google Sheets finance",
    description: "Атомарная сверка финансовой проекции с таблицей-источником.",
    schedule: "ежедневно · 03:15 UTC",
    expectedWithinMs: 36 * 60 * 60 * 1_000,
  },
  {
    name: "weekly_insight",
    label: "Weekly insight",
    description: "Недельный обзор записанных фактов и индексация результата.",
    schedule: "воскресенье · 09:00 UTC",
    expectedWithinMs: 8 * 24 * 60 * 60 * 1_000,
  },
  {
    name: "backup_scheduled",
    label: "Scheduled backup",
    description: "Еженедельный зашифрованный экспорт всех данных с доставкой в Telegram.",
    schedule: "воскресенье · 04:00 UTC",
    expectedWithinMs: 8 * 24 * 60 * 60 * 1_000,
  },
];

const triggers = new Set<SystemJobTrigger>(["cron", "manual"]);
const statuses = new Set<SystemJobStatus>([
  "running",
  "succeeded",
  "failed",
  "abandoned",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeSummary(
  value: unknown,
): Record<string, string | number | boolean | null> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).flatMap(([key, item]) => {
    if (key.length > 64) return [];
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      return [[key, item] as const];
    }
    return [];
  });
  return Object.fromEntries(entries);
}

export function normalizeSystemJobRun(value: unknown): SystemJobRun | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !SYSTEM_JOB_NAMES.includes(value.job_name as SystemJobName) ||
    !triggers.has(value.trigger_source as SystemJobTrigger) ||
    !statuses.has(value.status as SystemJobStatus) ||
    !isIsoDate(value.started_at)
  ) {
    return null;
  }

  const finishedAt = value.finished_at;
  const durationMs = value.duration_ms;
  const errorCode = value.error_code;

  if (finishedAt !== null && !isIsoDate(finishedAt)) return null;
  if (
    durationMs !== null &&
    (!Number.isInteger(durationMs) || (durationMs as number) < 0)
  ) {
    return null;
  }
  if (errorCode !== null && typeof errorCode !== "string") return null;

  return {
    id: value.id,
    jobName: value.job_name as SystemJobName,
    trigger: value.trigger_source as SystemJobTrigger,
    status: value.status as SystemJobStatus,
    startedAt: value.started_at,
    finishedAt: finishedAt as string | null,
    durationMs: durationMs as number | null,
    summary: normalizeSummary(value.summary),
    errorCode: errorCode as string | null,
  };
}

export function latestRunsByJob(
  runs: readonly SystemJobRun[],
): Record<SystemJobName, SystemJobRun | null> {
  const latest: Record<SystemJobName, SystemJobRun | null> = {
    obsidian_sync: null,
    calendar_sync: null,
    finance_sync: null,
    weekly_insight: null,
    backup_scheduled: null,
  };

  for (const run of runs) {
    const current = latest[run.jobName];
    if (!current || Date.parse(run.startedAt) > Date.parse(current.startedAt)) {
      latest[run.jobName] = run;
    }
  }

  return latest;
}

export function systemJobHealth(options: {
  configured: boolean;
  dataAvailable: boolean;
  latest: SystemJobRun | null;
  expectedWithinMs: number;
  now: Date;
}): SystemJobHealth {
  if (!options.configured) return "disabled";
  if (!options.dataAvailable) return "unavailable";
  if (!options.latest) return "pending";
  if (options.latest.status === "running") return "running";
  if (
    options.latest.status === "failed" ||
    options.latest.status === "abandoned"
  ) {
    return "attention";
  }

  const age = options.now.getTime() - Date.parse(options.latest.startedAt);
  return age > options.expectedWithinMs ? "stale" : "healthy";
}

export function overallSystemHealth(
  health: readonly SystemJobHealth[],
): SystemJobHealth {
  if (health.includes("unavailable")) return "unavailable";
  if (health.includes("attention") || health.includes("stale")) {
    return "attention";
  }
  if (health.includes("running")) return "running";
  if (health.includes("pending")) return "pending";
  if (health.some((value) => value === "healthy")) return "healthy";
  return "disabled";
}
