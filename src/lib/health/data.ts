import "server-only";

import { localCaptureTime } from "@/lib/capture/time";
import { serverEnv } from "@/lib/env/server";
import {
  averageMetric,
  buildHealthSeries,
  metricSnapshot,
  normalizeHealthDay,
  sumMetric,
  type HealthDay,
  type HealthMetricKey,
  type HealthMetricSnapshot,
} from "@/lib/health/normalize";
import { db } from "@/lib/supabase/admin";

export type HealthDashboardData = {
  generatedAt: string;
  today: string;
  timeZone: string;
  dataStatus: "ready" | "partial";
  latestSync: {
    date: string;
    recordedAt: string | null;
    source: "apple_health";
  } | null;
  metrics: Record<HealthMetricKey, HealthMetricSnapshot>;
  week: HealthDay[];
  heartRateTrend: HealthDay[];
  stats: {
    averageSleepHours: number | null;
    averageSleepScore: number | null;
    totalSteps: number;
    activeDays: number;
    totalActiveMinutes: number;
    averageNutritionKcal: number | null;
    nutritionDays: number;
    heartRateDays: number;
  };
};

function dateBefore(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export async function getHealthDashboardData(
  now = new Date(),
): Promise<HealthDashboardData> {
  const today = localCaptureTime(now, serverEnv.USER_TIMEZONE).date;
  const result = await db()
    .from("daily_logs")
    .select("log_date, notes")
    .eq("user_id", serverEnv.USER_ID)
    .gte("log_date", dateBefore(today, 29))
    .lte("log_date", today)
    .order("log_date", { ascending: false })
    .limit(30);

  const daysNewestFirst = (result.data ?? []).map((row) =>
    normalizeHealthDay(row.log_date, row.notes, today),
  );
  const week = buildHealthSeries(today, daysNewestFirst, 7);
  const heartRateTrend = buildHealthSeries(today, daysNewestFirst, 30);
  const latestActivity = daysNewestFirst.find((day) =>
    day.activity.source === "apple_health",
  );
  const sleepMinutes = averageMetric(week, (day) => day.activity.sleepMinutes);
  const nutritionDays = week.filter((day) => day.nutrition.meals > 0);
  const activeDays = week.filter((day) =>
    (day.activity.steps ?? 0) > 0 || (day.activity.minutesActive ?? 0) > 0,
  ).length;

  return {
    generatedAt: now.toISOString(),
    today,
    timeZone: serverEnv.USER_TIMEZONE,
    dataStatus: result.error ? "partial" : "ready",
    latestSync: latestActivity
      ? {
          date: latestActivity.date,
          recordedAt: latestActivity.activity.recordedAt,
          source: "apple_health",
        }
      : null,
    metrics: {
      restingHr: metricSnapshot(daysNewestFirst, "restingHr"),
      steps: metricSnapshot(daysNewestFirst, "steps"),
      kcalActive: metricSnapshot(daysNewestFirst, "kcalActive"),
      weightKg: metricSnapshot(daysNewestFirst, "weightKg"),
      vo2Max: metricSnapshot(daysNewestFirst, "vo2Max"),
      hrv: metricSnapshot(daysNewestFirst, "hrv"),
    },
    week,
    heartRateTrend,
    stats: {
      averageSleepHours: sleepMinutes === null
        ? null
        : Math.round((sleepMinutes / 60) * 10) / 10,
      averageSleepScore: averageMetric(week, (day) => day.activity.sleepScore, 0),
      totalSteps: sumMetric(week, (day) => day.activity.steps),
      activeDays,
      totalActiveMinutes: sumMetric(week, (day) => day.activity.minutesActive),
      averageNutritionKcal: nutritionDays.length
        ? averageMetric(nutritionDays, (day) => day.nutrition.kcal, 0)
        : null,
      nutritionDays: nutritionDays.length,
      heartRateDays: heartRateTrend.filter((day) => day.activity.restingHr !== null).length,
    },
  };
}
