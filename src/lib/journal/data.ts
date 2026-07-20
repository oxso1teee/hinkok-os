import "server-only";

import { localCaptureTime } from "@/lib/capture/time";
import { serverEnv } from "@/lib/env/server";
import {
  buildMoodSeries,
  moodSleepCorrelation,
  normalizeJournalDay,
  promptsForDate,
  sleepMoodBands,
  type JournalDay,
  type JournalMoodPoint,
  type SleepMoodBand,
} from "@/lib/journal/normalize";
import { db } from "@/lib/supabase/admin";

export type JournalDashboardData = {
  generatedAt: string;
  today: string;
  timeZone: string;
  dataStatus: "ready" | "partial";
  todayEntry: JournalDay;
  moodSeries: JournalMoodPoint[];
  sleepBands: SleepMoodBand[];
  correlation: number | null;
  prompts: string[];
  archive: JournalDay[];
  stats: {
    averageMood: number | null;
    moodDays: number;
    journalDays: number;
    totalWords: number;
  };
};

function dateBefore(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export async function getJournalDashboardData(
  now = new Date(),
): Promise<JournalDashboardData> {
  const today = localCaptureTime(now, serverEnv.USER_TIMEZONE).date;
  const result = await db()
    .from("daily_logs")
    .select("log_date, mood, notes")
    .eq("user_id", serverEnv.USER_ID)
    .gte("log_date", dateBefore(today, 119))
    .lte("log_date", today)
    .order("log_date", { ascending: false })
    .limit(120);

  const days = (result.data ?? []).map((row) =>
    normalizeJournalDay(row.log_date, row.mood, row.notes),
  );
  const todayEntry = days.find((day) => day.date === today)
    ?? normalizeJournalDay(today, null, {});
  const recentDays = days.filter((day) => day.date >= dateBefore(today, 29));
  const moodValues = recentDays.flatMap((day) => day.mood ? [Number(day.mood)] : []);
  const archive = days.filter((day) => day.combinedText).slice(0, 60);

  return {
    generatedAt: now.toISOString(),
    today,
    timeZone: serverEnv.USER_TIMEZONE,
    dataStatus: result.error ? "partial" : "ready",
    todayEntry,
    moodSeries: buildMoodSeries(today, recentDays),
    sleepBands: sleepMoodBands(recentDays),
    correlation: moodSleepCorrelation(recentDays),
    prompts: promptsForDate(today),
    archive,
    stats: {
      averageMood: moodValues.length
        ? Math.round((moodValues.reduce((sum, value) => sum + value, 0) / moodValues.length) * 10) / 10
        : null,
      moodDays: moodValues.length,
      journalDays: archive.length,
      totalWords: archive.reduce((sum, day) => sum + day.wordCount, 0),
    },
  };
}
