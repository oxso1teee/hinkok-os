import assert from "node:assert/strict";
import test from "node:test";

import {
  healthActivityMemoryText,
  healthActivityRequestSchema,
  normalizeHealthActivity,
} from "../src/lib/health/activity";

test("accepts and normalizes a bounded Apple Health payload", () => {
  const parsed = healthActivityRequestSchema.parse({
    date: "2026-07-18",
    recorded_at: "2026-07-18T21:30:00+03:00",
    steps: 13_127,
    kcal_active: 321.56,
    resting_hr: 54.94,
    hrv: 37.456,
    weight_kg: 72.345,
  });
  const normalized = normalizeHealthActivity(
    parsed,
    new Date("2026-07-18T20:00:00.000Z"),
  );

  assert.equal(normalized.source, "apple_health");
  assert.equal(normalized.kcal_active, 321.6);
  assert.equal(normalized.resting_hr, 54.9);
  assert.equal(normalized.hrv, 37.5);
  assert.equal(normalized.weight_kg, 72.35);
  assert.equal(normalized.sleep_minutes, null);
});

test("rejects empty, unknown and physiologically impossible activity", () => {
  assert.equal(
    healthActivityRequestSchema.safeParse({ date: "2026-07-18" }).success,
    false,
  );
  assert.equal(
    healthActivityRequestSchema.safeParse({
      date: "2026-07-18",
      steps: 1,
      attacker_field: true,
    }).success,
    false,
  );
  assert.equal(
    healthActivityRequestSchema.safeParse({
      date: "2026-07-18",
      resting_hr: 500,
    }).success,
    false,
  );
});

test("rejects stale and future-dated health uploads", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const future = healthActivityRequestSchema.parse({
    date: "2099-01-01",
    steps: 100,
  });
  const stale = healthActivityRequestSchema.parse({
    date: "2026-07-18",
    recorded_at: "2010-01-01T00:00:00Z",
    steps: 100,
  });

  assert.throws(() => normalizeHealthActivity(future, now), /outside/);
  assert.throws(() => normalizeHealthActivity(stale, now), /outside/);
});

test("renders only available metrics into memory text", () => {
  const parsed = healthActivityRequestSchema.parse({
    date: "2026-07-18",
    steps: 10_000,
    sleep_minutes: 450,
  });
  const activity = normalizeHealthActivity(
    parsed,
    new Date("2026-07-18T12:00:00.000Z"),
  );
  const text = healthActivityMemoryText(parsed.date, activity);

  assert.match(text, /Шаги: 10000/);
  assert.match(text, /Сон: 450 мин/);
  assert.doesNotMatch(text, /Вес:/);
});
