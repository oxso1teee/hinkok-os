import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { serverEnv } from "@/lib/env/server";
import type { WeeklyInsight } from "@/lib/insights/normalize";
import { db } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export async function storeWeeklyInsight(
  insight: Omit<WeeklyInsight, "id">,
): Promise<string> {
  const { data, error } = await db().rpc("upsert_weekly_insight", {
    p_user_id: serverEnv.USER_ID,
    p_week_start: insight.weekStart,
    p_week_end: insight.weekEnd,
    p_summary: insight.summary,
    p_highlights: insight.highlights as unknown as Json,
    p_patterns: insight.patterns as unknown as Json,
    p_recommendations: insight.recommendations as unknown as Json,
    p_metrics: insight.metrics as unknown as Json,
    p_provider: insight.provider,
    p_generated_at: insight.generatedAt,
  });

  if (error || typeof data !== "string") {
    throw new Error("Unable to store weekly insight", { cause: error });
  }

  await recordAuditEvent({
    action: "insights.weekly_generated",
    resourceType: "weekly_insights",
    resourceId: data,
    metadata: {
      weekStart: insight.weekStart,
      weekEnd: insight.weekEnd,
      provider: insight.provider,
      partialSources: insight.metrics.partialSources,
    },
  });

  return data;
}
