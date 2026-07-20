import "server-only";

import { cronEnv } from "@/lib/env/cron";
import { isGoogleCalendarConfigured, isGoogleSheetsFinanceConfigured } from "@/lib/env/google";
import { isObsidianConfigured } from "@/lib/env/obsidian";
import {
  latestRunsByJob,
  normalizeSystemJobRun,
  overallSystemHealth,
  SYSTEM_JOB_DEFINITIONS,
  systemJobHealth,
  type SystemJobHealth,
  type SystemJobName,
  type SystemJobRun,
} from "@/lib/operations/normalize";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

export type OperationsJob = {
  name: SystemJobName;
  label: string;
  description: string;
  schedule: string;
  configured: boolean;
  health: SystemJobHealth;
  latest: SystemJobRun | null;
};

export type OperationsDashboardData = {
  generatedAt: string;
  timeZone: string;
  dataStatus: "ready" | "unavailable";
  overall: SystemJobHealth;
  jobs: OperationsJob[];
  recentRuns: SystemJobRun[];
};

function configuration(): Record<SystemJobName, boolean> {
  const cronConfigured = Boolean(cronEnv.CRON_SECRET);
  return {
    obsidian_sync: cronConfigured && isObsidianConfigured(),
    calendar_sync: cronConfigured && isGoogleCalendarConfigured(),
    finance_sync: cronConfigured && isGoogleSheetsFinanceConfigured(),
    weekly_insight: cronConfigured,
  };
}

export async function getOperationsDashboardData(
  now = new Date(),
): Promise<OperationsDashboardData> {
  const result = await db()
    .from("system_job_runs")
    .select(
      "id, job_name, trigger_source, status, started_at, finished_at, duration_ms, summary, error_code",
    )
    .eq("user_id", serverEnv.USER_ID)
    .order("started_at", { ascending: false })
    .limit(40);
  const dataAvailable = !result.error;
  const recentRuns = (result.data ?? [])
    .map(normalizeSystemJobRun)
    .filter((run): run is SystemJobRun => run !== null);
  const latest = latestRunsByJob(recentRuns);
  const configured = configuration();
  const jobs = SYSTEM_JOB_DEFINITIONS.map((definition) => ({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    schedule: definition.schedule,
    configured: configured[definition.name],
    health: systemJobHealth({
      configured: configured[definition.name],
      dataAvailable,
      latest: latest[definition.name],
      expectedWithinMs: definition.expectedWithinMs,
      now,
    }),
    latest: latest[definition.name],
  }));

  return {
    generatedAt: now.toISOString(),
    timeZone: serverEnv.USER_TIMEZONE,
    dataStatus: dataAvailable ? "ready" : "unavailable",
    overall: overallSystemHealth(jobs.map((job) => job.health)),
    jobs,
    recentRuns,
  };
}
