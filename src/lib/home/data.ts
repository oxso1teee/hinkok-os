import "server-only";

import { localCaptureTime } from "@/lib/capture/time";
import { serverEnv } from "@/lib/env/server";
import {
  buildHomeDateStrip,
  normalizeHomeDailyState,
  nutritionTotals,
  type HomeDailyState,
} from "@/lib/home/normalize";
import {
  listUpcomingGoogleCalendarEvents,
  type HomeCalendarEvent,
} from "@/lib/integrations/google-calendar";
import { db } from "@/lib/supabase/admin";

export type HomeTask = {
  id: string;
  title: string;
  category: string;
  sphere: string | null;
  urgency: string;
  key: boolean;
  timeEstimateMin: number | null;
};

export type HomeCalendarDay = {
  date: string;
  day: string;
  weekday: string;
  isToday: boolean;
  eventCount: number;
};

export type HomeFinanceTotal = {
  currency: string;
  income: number;
  expenses: number;
};

export type HomeDashboardData = {
  generatedAt: string;
  today: string;
  timeZone: string;
  greeting: string;
  dataStatus: "ready" | "partial";
  tasks: HomeTask[];
  daily: HomeDailyState;
  nutrition: ReturnType<typeof nutritionTotals>;
  calendarDays: HomeCalendarDay[];
  calendarEvents: HomeCalendarEvent[];
  finance: HomeFinanceTotal[];
  stats: {
    openTasks: number;
    memoryChunks: number;
    captures: number;
  };
};

function greetingForHour(hour: number): string {
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function eventLocalDate(event: HomeCalendarEvent): string {
  if (event.allDay) {
    return event.start.slice(0, 10);
  }

  return localCaptureTime(new Date(event.start), serverEnv.USER_TIMEZONE).date;
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), milliseconds);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getHomeDashboardData(
  now = new Date(),
): Promise<HomeDashboardData> {
  const localNow = localCaptureTime(now, serverEnv.USER_TIMEZONE);
  const today = localNow.date;
  const monthStart = `${today.slice(0, 7)}-01`;
  const [tasksResult, dailyResult, financeResult, taskCountResult, memoryCountResult, captureCountResult, calendarResult] =
    await Promise.all([
      db()
        .from("tasks")
        .select(
          "id, title, category, sphere, urgency, key, time_estimate_min, priority_score",
        )
        .eq("user_id", serverEnv.USER_ID)
        .is("completed_at", null)
        .or(`urgency.eq.today,key.eq.true,due_date.eq.${today}`)
        .order("priority_score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(8),
      db()
        .from("daily_logs")
        .select("notes")
        .eq("user_id", serverEnv.USER_ID)
        .eq("log_date", today)
        .maybeSingle(),
      db()
        .from("finance_transactions")
        .select("amount, currency")
        .eq("user_id", serverEnv.USER_ID)
        .gte("transaction_date", monthStart)
        .lte("transaction_date", today),
      db()
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", serverEnv.USER_ID)
        .is("completed_at", null),
      db()
        .from("memory_chunks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", serverEnv.USER_ID),
      db()
        .from("raw_captures")
        .select("id", { count: "exact", head: true })
        .eq("user_id", serverEnv.USER_ID),
      withTimeout(
        listUpcomingGoogleCalendarEvents(now).catch(() => null),
        6_000,
        null,
      ),
    ]);

  const daily = normalizeHomeDailyState(dailyResult.data?.notes ?? null);
  const calendarEvents = calendarResult ?? [];
  const eventCounts = new Map<string, number>();

  for (const event of calendarEvents) {
    const date = eventLocalDate(event);
    eventCounts.set(date, (eventCounts.get(date) ?? 0) + 1);
  }

  const financeByCurrency = new Map<string, HomeFinanceTotal>();
  for (const row of financeResult.data ?? []) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const total = financeByCurrency.get(row.currency) ?? {
      currency: row.currency,
      income: 0,
      expenses: 0,
    };
    if (amount >= 0) total.income += amount;
    else total.expenses += Math.abs(amount);
    financeByCurrency.set(row.currency, total);
  }

  const hasDatabaseError = Boolean(
    tasksResult.error ||
      dailyResult.error ||
      financeResult.error ||
      taskCountResult.error ||
      memoryCountResult.error ||
      captureCountResult.error,
  );

  return {
    generatedAt: now.toISOString(),
    today,
    timeZone: serverEnv.USER_TIMEZONE,
    greeting: greetingForHour(Number(localNow.time.slice(0, 2))),
    dataStatus: hasDatabaseError || calendarResult === null ? "partial" : "ready",
    tasks: (tasksResult.data ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      sphere: task.sphere,
      urgency: task.urgency,
      key: task.key,
      timeEstimateMin: task.time_estimate_min,
    })),
    daily,
    nutrition: nutritionTotals(daily.meals),
    calendarDays: buildHomeDateStrip(today).map((day) => ({
      ...day,
      eventCount: eventCounts.get(day.date) ?? 0,
    })),
    calendarEvents: calendarEvents.slice(0, 6),
    finance: [...financeByCurrency.values()].map((total) => ({
      ...total,
      income: Math.round(total.income * 100) / 100,
      expenses: Math.round(total.expenses * 100) / 100,
    })),
    stats: {
      openTasks: taskCountResult.count ?? 0,
      memoryChunks: memoryCountResult.count ?? 0,
      captures: captureCountResult.count ?? 0,
    },
  };
}
