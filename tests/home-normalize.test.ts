import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHomeDateStrip,
  normalizeHomeDailyState,
  nutritionTotals,
} from "../src/lib/home/normalize";

test("normalizes HOME daily JSON without trusting malformed values", () => {
  const state = normalizeHomeDailyState({
    habits: { sport: 1.9, journal: -5, "bad key": 10, huge: 999 },
    goals_week_items: [
      { id: "goal-1", text: "  Ship   the release ", done: true },
      { id: "", text: "invalid", done: false },
    ],
    nutrition: {
      meals: [
        {
          id: "meal-1",
          t: "12:30",
          n: "Lunch",
          kcal: 600,
          p: 40,
          c: 70,
          f: 18,
        },
      ],
    },
    activity: { steps: 12_000, resting_hr: "not-a-number" },
  });

  assert.deepEqual(state.habits, { sport: 1, journal: 0, huge: 100 });
  assert.deepEqual(state.weekGoals, [
    { id: "goal-1", text: "Ship the release", done: true },
  ]);
  assert.equal(state.meals[0].name, "Lunch");
  assert.equal(state.activity.steps, 12_000);
  assert.equal(state.activity.restingHr, null);
});

test("calculates nutrition totals from available meal estimates", () => {
  const state = normalizeHomeDailyState({
    nutrition: {
      meals: [
        { id: "one", n: "One", kcal: 500, p: 30, c: 50, f: 15 },
        { id: "two", n: "Two", kcal: null, p: 20, c: 10, f: 5 },
      ],
    },
  });

  assert.deepEqual(nutritionTotals(state.meals), {
    kcal: 500,
    protein: 50,
    carbs: 60,
    fat: 20,
  });
});

test("builds a stable seven-day calendar strip across month boundaries", () => {
  const strip = buildHomeDateStrip("2026-07-29");
  assert.equal(strip.length, 7);
  assert.equal(strip[0].date, "2026-07-29");
  assert.equal(strip[0].isToday, true);
  assert.equal(strip[3].date, "2026-08-01");
  assert.equal(strip[6].date, "2026-08-04");
});
