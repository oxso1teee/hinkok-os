import "server-only";

import { localCaptureTime } from "@/lib/capture/time";
import { serverEnv } from "@/lib/env/server";
import { normalizeHealthDay } from "@/lib/health/normalize";
import type {
  WeeklyCaptureFact,
  WeeklyFinanceFact,
  WeeklyInsightFacts,
  WeeklyInsightMetrics,
  WeeklyTaskFact,
} from "@/lib/insights/normalize";
import { weeklyRangeEnding } from "@/lib/insights/normalize";
import { normalizeJournalDay } from "@/lib/journal/normalize";
import { db } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

type JsonObject = { [key: string]: Json | undefined };

function objectValue(value: Json | undefined): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function safeText(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").replace(/\u0000/gu, "").trim().slice(0, maximum)
    : "";
}

function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function localMidnightUtc(date: string, timeZone: string): Date {
  const guess = new Date(`${date}T00:00:00.000Z`);
  return new Date(guess.getTime() - offsetMinutesAt(guess, timeZone) * 60_000);
}

function dayAfter(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function taskFact(row: { title: string; sphere: string | null; urgency: string }): WeeklyTaskFact {
  return {
    title: safeText(row.title, 160) || "Без названия",
    sphere: safeText(row.sphere, 32) || null,
    urgency: safeText(row.urgency, 32) || "someday",
  };
}

function captureFact(row: { raw_text: string; classification: Json }): WeeklyCaptureFact {
  const classification = objectValue(row.classification);
  return {
    title: safeText(classification.title, 160) || safeText(row.raw_text, 160) || "Захват",
    kind: safeText(classification.kind, 32) || "note",
    sphere: safeText(classification.sphere, 32) || null,
  };
}

function roundedAverage(values: number[], digits = 1): number | null {
  if (!values.length) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average * 10 ** digits) / 10 ** digits;
}

export async function getWeeklyInsightFacts(now = new Date()): Promise<WeeklyInsightFacts> {
  const localToday = localCaptureTime(now, serverEnv.USER_TIMEZONE).date;
  const { weekStart, weekEnd } = weeklyRangeEnding(localToday);
  const startInstant = localMidnightUtc(weekStart, serverEnv.USER_TIMEZONE).toISOString();
  const endExclusive = localMidnightUtc(dayAfter(weekEnd), serverEnv.USER_TIMEZONE).toISOString();

  const [
    completedResult,
    createdResult,
    openKeyResult,
    captureResult,
    dailyResult,
    financeResult,
  ] = await Promise.all([
    db()
      .from("tasks")
      .select("title, sphere, urgency", { count: "exact" })
      .eq("user_id", serverEnv.USER_ID)
      .gte("completed_at", startInstant)
      .lt("completed_at", endExclusive)
      .order("completed_at", { ascending: false })
      .limit(50),
    db()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", serverEnv.USER_ID)
      .gte("created_at", startInstant)
      .lt("created_at", endExclusive),
    db()
      .from("tasks")
      .select("title, sphere, urgency", { count: "exact" })
      .eq("user_id", serverEnv.USER_ID)
      .is("completed_at", null)
      .eq("key", true)
      .order("priority_score", { ascending: false })
      .limit(20),
    db()
      .from("raw_captures")
      .select("raw_text, classification", { count: "exact" })
      .eq("user_id", serverEnv.USER_ID)
      .gte("created_at", startInstant)
      .lt("created_at", endExclusive)
      .order("created_at", { ascending: false })
      .limit(80),
    db()
      .from("daily_logs")
      .select("log_date, mood, notes")
      .eq("user_id", serverEnv.USER_ID)
      .gte("log_date", weekStart)
      .lte("log_date", weekEnd)
      .order("log_date", { ascending: true })
      .limit(7),
    db()
      .from("finance_transactions")
      .select("amount, currency", { count: "exact" })
      .eq("user_id", serverEnv.USER_ID)
      .gte("transaction_date", weekStart)
      .lte("transaction_date", weekEnd)
      .limit(500),
  ]);

  const partialSources = [
    completedResult.error || createdResult.error || openKeyResult.error ? "tasks" : null,
    captureResult.error ? "captures" : null,
    dailyResult.error ? "daily_logs" : null,
    financeResult.error ? "finance" : null,
  ].filter((source): source is string => source !== null);
  const dailyRows = dailyResult.data ?? [];
  const journalDays = dailyRows.map((row) =>
    normalizeJournalDay(row.log_date, row.mood, row.notes),
  );
  const healthDays = dailyRows.map((row) =>
    normalizeHealthDay(row.log_date, row.notes, weekEnd),
  );
  const moodValues = journalDays.flatMap((day) => day.mood ? [Number(day.mood)] : []);
  const sleepValues = healthDays.flatMap((day) =>
    day.activity.sleepMinutes === null ? [] : [day.activity.sleepMinutes],
  );
  const financeByCurrency = new Map<string, WeeklyFinanceFact>();

  for (const row of financeResult.data ?? []) {
    const currency = safeText(row.currency, 3).toUpperCase();
    const amount = Number(row.amount);
    if (!/^[A-Z]{3}$/u.test(currency) || !Number.isFinite(amount)) continue;
    const current = financeByCurrency.get(currency) ?? { currency, income: 0, expenses: 0 };
    if (amount > 0) current.income += amount;
    if (amount < 0) current.expenses += Math.abs(amount);
    financeByCurrency.set(currency, current);
  }

  const metrics: WeeklyInsightMetrics = {
    completedTasks: completedResult.count ?? completedResult.data?.length ?? 0,
    createdTasks: createdResult.count ?? 0,
    openKeyTasks: openKeyResult.count ?? openKeyResult.data?.length ?? 0,
    captures: captureResult.count ?? captureResult.data?.length ?? 0,
    journalDays: journalDays.filter((day) => day.combinedText.length > 0).length,
    moodDays: moodValues.length,
    averageMood: roundedAverage(moodValues),
    healthDays: healthDays.filter((day) => day.activity.source === "apple_health").length,
    averageSleepHours: sleepValues.length
      ? roundedAverage(sleepValues.map((minutes) => minutes / 60))
      : null,
    totalSteps: Math.round(healthDays.reduce((sum, day) => sum + (day.activity.steps ?? 0), 0)),
    nutritionDays: healthDays.filter((day) => day.nutrition.meals > 0).length,
    meals: healthDays.reduce((sum, day) => sum + day.nutrition.meals, 0),
    financeTransactions: financeResult.count ?? financeResult.data?.length ?? 0,
    partialSources,
  };

  return {
    weekStart,
    weekEnd,
    metrics,
    completedTasks: (completedResult.data ?? []).map(taskFact),
    openKeyTasks: (openKeyResult.data ?? []).map(taskFact),
    captures: (captureResult.data ?? []).slice(0, 30).map(captureFact),
    journal: journalDays
      .filter((day) => day.combinedText)
      .map((day) => ({ date: day.date, excerpt: safeText(day.combinedText, 1_200) })),
    finance: [...financeByCurrency.values()].map((item) => ({
      ...item,
      income: Math.round(item.income * 100) / 100,
      expenses: Math.round(item.expenses * 100) / 100,
    })),
  };
}
