import assert from "node:assert/strict";
import test from "node:test";

import {
  averageMetric,
  buildHealthSeries,
  metricSnapshot,
  normalizeHealthDay,
  sumMetric,
} from "../src/lib/health/normalize";

test("normalizes bounded Apple Health and nutrition values", () => {
  const day = normalizeHealthDay("2026-07-18", {
    activity: {
      source: "apple_health",
      recorded_at: "2026-07-18T18:30:00.000Z",
      sleep_minutes: 452,
      sleep_score: 86.44,
      steps: 13_127,
      kcal_active: 322.18,
      minutes_active: 88,
      resting_hr: 54.96,
      hrv: 37.84,
      vo2_max: 46.73,
      weight_kg: 72.345,
    },
    nutrition: {
      meals: [
        { id: "meal-1", n: "Завтрак", kcal: 620, p: 32, c: 71, f: 21 },
        { id: "meal-2", n: "Ужин", kcal: 780, p: 51, c: 63, f: 29 },
      ],
    },
  }, "2026-07-18");

  assert.equal(day.isToday, true);
  assert.equal(day.activity.source, "apple_health");
  assert.equal(day.activity.restingHr, 55);
  assert.equal(day.activity.weightKg, 72.35);
  assert.equal(day.nutrition.meals, 2);
  assert.equal(day.nutrition.kcal, 1_400);
  assert.equal(day.nutrition.protein, 83);
});

test("rejects unsafe or out-of-range values while preserving the day", () => {
  const day = normalizeHealthDay("2026-07-17", {
    activity: {
      source: "attacker",
      recorded_at: "not-a-date",
      sleep_minutes: -1,
      steps: 999_999,
      resting_hr: 500,
      hrv: Number.NaN,
    },
    nutrition: {
      meals: [
        { id: "", n: "Без id", kcal: 200 },
        { id: "meal-1", n: "Impossible", kcal: 100_000, p: -2 },
      ],
    },
  }, "2026-07-18");

  assert.equal(day.activity.source, null);
  assert.equal(day.activity.recordedAt, null);
  assert.equal(day.activity.sleepMinutes, null);
  assert.equal(day.activity.steps, null);
  assert.equal(day.activity.restingHr, null);
  assert.equal(day.nutrition.meals, 1);
  assert.equal(day.nutrition.kcal, 0);
  assert.equal(day.nutrition.protein, 0);
});

test("builds an ordered trailing week and fills missing dates", () => {
  const today = normalizeHealthDay("2026-07-18", {
    activity: { source: "apple_health", steps: 10_000 },
  }, "2026-07-18");
  const older = normalizeHealthDay("2026-07-15", {
    activity: { source: "apple_health", steps: 8_000 },
  }, "2026-07-18");
  const series = buildHealthSeries("2026-07-18", [today, older], 7);

  assert.equal(series.length, 7);
  assert.equal(series[0].date, "2026-07-12");
  assert.equal(series[3].activity.steps, 8_000);
  assert.equal(series[6].activity.steps, 10_000);
  assert.equal(series[6].isToday, true);
  assert.equal(series[1].activity.steps, null);
});

test("uses the two latest measured days for metric deltas", () => {
  const latest = normalizeHealthDay("2026-07-18", {
    activity: { source: "apple_health", weight_kg: 72.3 },
  });
  const gap = normalizeHealthDay("2026-07-17", {
    activity: { source: "apple_health", steps: 100 },
  });
  const previous = normalizeHealthDay("2026-07-16", {
    activity: { source: "apple_health", weight_kg: 73.1 },
  });
  const snapshot = metricSnapshot([latest, gap, previous], "weightKg");

  assert.equal(snapshot.value, 72.3);
  assert.equal(snapshot.previousValue, 73.1);
  assert.equal(snapshot.delta, -0.8);
  assert.equal(snapshot.date, "2026-07-18");
});

test("calculates averages and sums from available measurements only", () => {
  const days = [
    normalizeHealthDay("2026-07-18", { activity: { sleep_minutes: 480, steps: 10_000 } }),
    normalizeHealthDay("2026-07-17", { activity: { sleep_minutes: 420, steps: 8_000 } }),
    normalizeHealthDay("2026-07-16", {}),
  ];

  assert.equal(averageMetric(days, (day) => day.activity.sleepMinutes), 450);
  assert.equal(sumMetric(days, (day) => day.activity.steps), 18_000);
});
