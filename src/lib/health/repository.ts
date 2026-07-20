import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { serverEnv } from "@/lib/env/server";
import type { StoredHealthActivity } from "@/lib/health/activity";
import { db } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export async function storeDailyActivity(
  date: string,
  activity: StoredHealthActivity,
): Promise<string> {
  const { data, error } = await db().rpc("upsert_daily_activity", {
    p_user_id: serverEnv.USER_ID,
    p_log_date: date,
    p_activity: activity as unknown as Json,
  });

  if (error || typeof data !== "string") {
    throw new Error("Unable to store daily health activity", { cause: error });
  }

  const metricNames = Object.entries(activity)
    .filter(([key, value]) => key !== "source" && key !== "recorded_at" && value !== null)
    .map(([key]) => key);

  await recordAuditEvent({
    action: "health.activity_upserted",
    resourceType: "daily_logs",
    resourceId: data,
    metadata: { date, source: activity.source, metricNames },
  });

  return data;
}
