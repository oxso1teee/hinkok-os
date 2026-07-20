import type { Json } from "@/types/database";

export type HomeGoal = {
  id: string;
  text: string;
  done: boolean;
};

export type HomeMeal = {
  id: string;
  time: string | null;
  name: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type HomeActivity = {
  sleepMinutes: number | null;
  sleepScore: number | null;
  steps: number | null;
  kcalActive: number | null;
  restingHr: number | null;
  hrv: number | null;
  weightKg: number | null;
};

export type HomeDailyState = {
  habits: Record<string, number>;
  weekGoals: HomeGoal[];
  monthGoals: HomeGoal[];
  meals: HomeMeal[];
  activity: HomeActivity;
};

type JsonObject = { [key: string]: Json | undefined };

function objectValue(value: Json | undefined): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function finiteNumber(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactText(value: Json | undefined, maximumLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maximumLength)
    : "";
}

function goals(value: Json | undefined): HomeGoal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const goal = objectValue(item);
      const id = compactText(goal.id, 128);
      const text = compactText(goal.text, 200);

      return id && text
        ? { id, text, done: goal.done === true }
        : null;
    })
    .filter((goal): goal is HomeGoal => goal !== null)
    .slice(0, 20);
}

function meals(value: Json | undefined): HomeMeal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const meal = objectValue(item);
      const id = compactText(meal.id, 128);
      const name = compactText(meal.n, 120);

      return id && name
        ? {
            id,
            time: compactText(meal.t, 8) || null,
            name,
            kcal: finiteNumber(meal.kcal),
            protein: finiteNumber(meal.p),
            carbs: finiteNumber(meal.c),
            fat: finiteNumber(meal.f),
          }
        : null;
    })
    .filter((meal): meal is HomeMeal => meal !== null)
    .slice(-12);
}

export function normalizeHomeDailyState(notes: Json | null): HomeDailyState {
  const root = objectValue(notes ?? {});
  const rawHabits = objectValue(root.habits);
  const normalizedHabits: Record<string, number> = {};

  for (const [key, value] of Object.entries(rawHabits)) {
    const count = finiteNumber(value);
    if (/^[a-z][a-z0-9_-]{0,63}$/.test(key) && count !== null) {
      normalizedHabits[key] = Math.max(0, Math.min(100, Math.floor(count)));
    }
  }

  const nutrition = objectValue(root.nutrition);
  const rawActivity = objectValue(root.activity);

  return {
    habits: normalizedHabits,
    weekGoals: goals(root.goals_week_items),
    monthGoals: goals(root.goals_month_items),
    meals: meals(nutrition.meals),
    activity: {
      sleepMinutes: finiteNumber(rawActivity.sleep_minutes),
      sleepScore: finiteNumber(rawActivity.sleep_score),
      steps: finiteNumber(rawActivity.steps),
      kcalActive: finiteNumber(rawActivity.kcal_active),
      restingHr: finiteNumber(rawActivity.resting_hr),
      hrv: finiteNumber(rawActivity.hrv),
      weightKg: finiteNumber(rawActivity.weight_kg),
    },
  };
}

export function nutritionTotals(mealItems: HomeMeal[]) {
  return mealItems.reduce(
    (total, meal) => ({
      kcal: total.kcal + (meal.kcal ?? 0),
      protein: total.protein + (meal.protein ?? 0),
      carbs: total.carbs + (meal.carbs ?? 0),
      fat: total.fat + (meal.fat ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export type HomeDateItem = {
  date: string;
  day: string;
  weekday: string;
  isToday: boolean;
};

export function buildHomeDateStrip(
  startDate: string,
  count = 7,
): HomeDateItem[] {
  const [year, month, day] = startDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  const weekdayFormatter = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    timeZone: "UTC",
  });

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1_000);
    const isoDate = date.toISOString().slice(0, 10);
    return {
      date: isoDate,
      day: String(date.getUTCDate()).padStart(2, "0"),
      weekday: weekdayFormatter.format(date).replace(".", "").toUpperCase(),
      isToday: index === 0,
    };
  });
}
