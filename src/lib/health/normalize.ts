import type { Json } from "@/types/database";

export type HealthActivitySnapshot = {
  source: "apple_health" | null;
  recordedAt: string | null;
  sleepMinutes: number | null;
  sleepScore: number | null;
  steps: number | null;
  kcalActive: number | null;
  minutesActive: number | null;
  restingHr: number | null;
  hrv: number | null;
  vo2Max: number | null;
  weightKg: number | null;
};

export type HealthNutrition = {
  meals: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type HealthDay = {
  date: string;
  day: string;
  weekday: string;
  isToday: boolean;
  activity: HealthActivitySnapshot;
  nutrition: HealthNutrition;
};

export type HealthMetricKey =
  | "restingHr"
  | "steps"
  | "kcalActive"
  | "weightKg"
  | "vo2Max"
  | "hrv";

export type HealthMetricSnapshot = {
  value: number | null;
  previousValue: number | null;
  delta: number | null;
  date: string | null;
};

type JsonObject = { [key: string]: Json | undefined };

const DAY_MS = 86_400_000;

function objectValue(value: Json | undefined): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function boundedNumber(
  value: Json | undefined,
  minimum: number,
  maximum: number,
  digits = 1,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < minimum || value > maximum) return null;
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

function safeRecordedAt(value: Json | undefined): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function emptyActivity(): HealthActivitySnapshot {
  return {
    source: null,
    recordedAt: null,
    sleepMinutes: null,
    sleepScore: null,
    steps: null,
    kcalActive: null,
    minutesActive: null,
    restingHr: null,
    hrv: null,
    vo2Max: null,
    weightKg: null,
  };
}

function normalizeActivity(value: Json | undefined): HealthActivitySnapshot {
  const activity = objectValue(value);
  return {
    source: activity.source === "apple_health" ? "apple_health" : null,
    recordedAt: safeRecordedAt(activity.recorded_at),
    sleepMinutes: boundedNumber(activity.sleep_minutes, 0, 1_440, 0),
    sleepScore: boundedNumber(activity.sleep_score, 0, 100),
    steps: boundedNumber(activity.steps, 0, 200_000, 0),
    kcalActive: boundedNumber(activity.kcal_active, 0, 20_000),
    minutesActive: boundedNumber(activity.minutes_active, 0, 1_440, 0),
    restingHr: boundedNumber(activity.resting_hr, 20, 250),
    hrv: boundedNumber(activity.hrv, 0, 1_000),
    vo2Max: boundedNumber(activity.vo2_max, 5, 100),
    weightKg: boundedNumber(activity.weight_kg, 20, 500, 2),
  };
}

function normalizeNutrition(value: Json | undefined): HealthNutrition {
  const nutrition = objectValue(value);
  const meals = nutrition.meals;
  if (!Array.isArray(meals)) {
    return { meals: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }

  const totals = meals.slice(-40).reduce<HealthNutrition>(
    (result, item) => {
      const meal = objectValue(item);
      const hasIdentity = typeof meal.id === "string"
        && meal.id.trim().length > 0
        && meal.id.length <= 128;
      const hasName = typeof meal.n === "string" && meal.n.trim().length > 0;
      if (!hasIdentity || !hasName) return result;

      return {
        meals: result.meals + 1,
        kcal: result.kcal + (boundedNumber(meal.kcal, 0, 5_000) ?? 0),
        protein: result.protein + (boundedNumber(meal.p, 0, 1_000) ?? 0),
        carbs: result.carbs + (boundedNumber(meal.c, 0, 1_000) ?? 0),
        fat: result.fat + (boundedNumber(meal.f, 0, 1_000) ?? 0),
      };
    },
    { meals: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    meals: totals.meals,
    kcal: Math.round(totals.kcal),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
}

function utcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateBefore(date: string, days: number): string {
  return new Date(utcDate(date).getTime() - days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function dayLabels(date: string, today: string): Pick<HealthDay, "day" | "weekday" | "isToday"> {
  const value = utcDate(date);
  return {
    day: String(value.getUTCDate()).padStart(2, "0"),
    weekday: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "UTC",
    }).format(value).toUpperCase(),
    isToday: date === today,
  };
}

export function normalizeHealthDay(
  date: string,
  notes: Json | null,
  today = date,
): HealthDay {
  const root = objectValue(notes ?? {});
  return {
    date,
    ...dayLabels(date, today),
    activity: normalizeActivity(root.activity),
    nutrition: normalizeNutrition(root.nutrition),
  };
}

export function buildHealthSeries(
  today: string,
  days: HealthDay[],
  count = 7,
): HealthDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: count }, (_, index) => {
    const date = dateBefore(today, count - index - 1);
    return byDate.get(date) ?? {
      date,
      ...dayLabels(date, today),
      activity: emptyActivity(),
      nutrition: { meals: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 },
    };
  });
}

export function metricSnapshot(
  daysNewestFirst: HealthDay[],
  key: HealthMetricKey,
): HealthMetricSnapshot {
  const measured = daysNewestFirst.filter((day) => day.activity[key] !== null);
  const current = measured[0];
  const previous = measured[1];
  const value = current?.activity[key] ?? null;
  const previousValue = previous?.activity[key] ?? null;
  return {
    value,
    previousValue,
    delta: value !== null && previousValue !== null
      ? Math.round((value - previousValue) * 100) / 100
      : null,
    date: current?.date ?? null,
  };
}

export function averageMetric(
  days: HealthDay[],
  selector: (day: HealthDay) => number | null,
  digits = 1,
): number | null {
  const values = days.flatMap((day) => {
    const value = selector(day);
    return value === null ? [] : [value];
  });
  if (!values.length) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average * 10 ** digits) / 10 ** digits;
}

export function sumMetric(
  days: HealthDay[],
  selector: (day: HealthDay) => number | null,
): number {
  return Math.round(days.reduce((sum, day) => sum + (selector(day) ?? 0), 0));
}
