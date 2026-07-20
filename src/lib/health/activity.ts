import { z } from "zod";

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isZonedDateTime(value: string): boolean {
  return (
    value.length <= 64 &&
    /T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

const optionalMetric = (schema: z.ZodNumber) => schema.nullable().optional();

export const healthActivityRequestSchema = z
  .object({
    date: z.string().refine(isCalendarDate, "date must use YYYY-MM-DD"),
    source: z.literal("apple_health").default("apple_health"),
    recorded_at: z.string().refine(isZonedDateTime).optional(),
    sleep_minutes: optionalMetric(z.int().min(0).max(1_440)),
    sleep_score: optionalMetric(z.number().min(0).max(100)),
    steps: optionalMetric(z.int().min(0).max(200_000)),
    kcal_active: optionalMetric(z.number().min(0).max(20_000)),
    minutes_active: optionalMetric(z.int().min(0).max(1_440)),
    resting_hr: optionalMetric(z.number().min(20).max(250)),
    hrv: optionalMetric(z.number().min(0).max(1_000)),
    vo2_max: optionalMetric(z.number().min(5).max(100)),
    weight_kg: optionalMetric(z.number().min(20).max(500)),
  })
  .strict()
  .refine(
    (value) =>
      [
        value.sleep_minutes,
        value.sleep_score,
        value.steps,
        value.kcal_active,
        value.minutes_active,
        value.resting_hr,
        value.hrv,
        value.vo2_max,
        value.weight_kg,
      ].some((metric) => metric !== undefined && metric !== null),
    "at least one health metric is required",
  );

export type HealthActivityRequest = z.infer<typeof healthActivityRequestSchema>;

export type StoredHealthActivity = {
  source: "apple_health";
  recorded_at: string;
  sleep_minutes: number | null;
  sleep_score: number | null;
  steps: number | null;
  kcal_active: number | null;
  minutes_active: number | null;
  resting_hr: number | null;
  hrv: number | null;
  vo2_max: number | null;
  weight_kg: number | null;
};

export function normalizeHealthActivity(
  input: HealthActivityRequest,
  now = new Date(),
): StoredHealthActivity {
  const recordedAt = input.recorded_at ?? now.toISOString();
  const recordedAtMs = Date.parse(recordedAt);
  const activityDateMs = Date.parse(`${input.date}T00:00:00.000Z`);

  if (
    recordedAtMs > now.getTime() + 24 * 60 * 60 * 1_000 ||
    recordedAtMs < now.getTime() - 5 * 366 * 24 * 60 * 60 * 1_000 ||
    activityDateMs > now.getTime() + 2 * 24 * 60 * 60 * 1_000 ||
    activityDateMs < now.getTime() - 5 * 366 * 24 * 60 * 60 * 1_000
  ) {
    throw new Error("Health activity timestamp is outside the accepted window");
  }

  const round = (value: number | null | undefined, digits = 1) =>
    value === undefined || value === null
      ? null
      : Math.round(value * 10 ** digits) / 10 ** digits;

  return {
    source: "apple_health",
    recorded_at: new Date(recordedAtMs).toISOString(),
    sleep_minutes: input.sleep_minutes ?? null,
    sleep_score: round(input.sleep_score),
    steps: input.steps ?? null,
    kcal_active: round(input.kcal_active),
    minutes_active: input.minutes_active ?? null,
    resting_hr: round(input.resting_hr),
    hrv: round(input.hrv),
    vo2_max: round(input.vo2_max),
    weight_kg: round(input.weight_kg, 2),
  };
}

export function healthActivityMemoryText(
  date: string,
  activity: StoredHealthActivity,
): string {
  const labels: Array<[keyof StoredHealthActivity, string, string]> = [
    ["sleep_minutes", "Сон", "мин"],
    ["sleep_score", "Оценка сна", "из 100"],
    ["steps", "Шаги", ""],
    ["kcal_active", "Активные калории", "ккал"],
    ["minutes_active", "Активность", "мин"],
    ["resting_hr", "Пульс в покое", "уд/мин"],
    ["hrv", "HRV", "мс"],
    ["vo2_max", "VO2 max", "мл/кг/мин"],
    ["weight_kg", "Вес", "кг"],
  ];
  const metrics = labels
    .filter(([key]) => typeof activity[key] === "number")
    .map(([key, label, unit]) => `${label}: ${activity[key]}${unit ? ` ${unit}` : ""}`);

  return `Данные Apple Health за ${date}.\n${metrics.join("\n")}`;
}
