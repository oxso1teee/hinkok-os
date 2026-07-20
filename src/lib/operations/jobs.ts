import "server-only";

import { serverEnv } from "@/lib/env/server";
import type {
  SystemJobName,
  SystemJobTrigger,
} from "@/lib/operations/normalize";
import { db } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const STALE_AFTER_SECONDS = 600;
const MIN_INTERVAL_SECONDS = 300;

type JobSummary = Record<string, string | number | boolean | null>;

export type ObservedJobResult<T> =
  | { skipped: true; reason: "running_or_recent" }
  | { skipped: false; value: T };

async function beginSystemJob(
  jobName: SystemJobName,
  trigger: SystemJobTrigger,
): Promise<string | null> {
  const { data, error } = await db().rpc("begin_system_job", {
    p_user_id: serverEnv.USER_ID,
    p_job_name: jobName,
    p_trigger_source: trigger,
    p_stale_after_seconds: STALE_AFTER_SECONDS,
    p_min_interval_seconds: MIN_INTERVAL_SECONDS,
  });

  if (error) {
    throw new Error("Unable to claim the system job", { cause: error });
  }

  return data;
}

async function finishSystemJob(options: {
  runId: string;
  status: "succeeded" | "failed";
  summary: JobSummary;
  errorCode: string | null;
}): Promise<void> {
  const { data, error } = await db().rpc("finish_system_job", {
    p_user_id: serverEnv.USER_ID,
    p_run_id: options.runId,
    p_status: options.status,
    p_summary: options.summary as Json,
    p_error_code: options.errorCode,
  });

  if (error || !data) {
    throw new Error("Unable to complete the system job", { cause: error });
  }
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "request_timeout";
  }
  return "job_failed";
}

export async function withObservedJob<T>(options: {
  jobName: SystemJobName;
  trigger: SystemJobTrigger;
  execute: () => Promise<T>;
  summarize: (value: T) => JobSummary;
}): Promise<ObservedJobResult<T>> {
  const runId = await beginSystemJob(options.jobName, options.trigger);
  if (!runId) {
    return { skipped: true, reason: "running_or_recent" };
  }

  try {
    const value = await options.execute();
    await finishSystemJob({
      runId,
      status: "succeeded",
      summary: options.summarize(value),
      errorCode: null,
    });
    return { skipped: false, value };
  } catch (error: unknown) {
    try {
      await finishSystemJob({
        runId,
        status: "failed",
        summary: {},
        errorCode: errorCode(error),
      });
    } catch (monitoringError: unknown) {
      console.error("System job failure could not be recorded", monitoringError);
    }
    throw error;
  }
}
