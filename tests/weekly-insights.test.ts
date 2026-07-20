import assert from "node:assert/strict";
import test from "node:test";

import {
  deterministicWeeklyInsight,
  extractJsonObject,
  normalizeStoredWeeklyInsight,
  normalizeWeeklyInsightDraft,
  weeklyInsightMemoryText,
  weeklyRangeEnding,
  type WeeklyInsightFacts,
} from "../src/lib/insights/normalize";

function facts(): WeeklyInsightFacts {
  return {
    weekStart: "2026-07-12",
    weekEnd: "2026-07-18",
    metrics: {
      completedTasks: 2,
      createdTasks: 4,
      openKeyTasks: 1,
      captures: 8,
      journalDays: 5,
      moodDays: 5,
      averageMood: 4.2,
      healthDays: 6,
      averageSleepHours: 7.4,
      totalSteps: 72_000,
      nutritionDays: 4,
      meals: 11,
      financeTransactions: 3,
      partialSources: [],
    },
    completedTasks: [
      { title: "Опубликовать ролик", sphere: "content", urgency: "today" },
      { title: "Закрыть отчёт", sphere: "work", urgency: "this_week" },
    ],
    openKeyTasks: [
      { title: "Подготовить запуск", sphere: "work", urgency: "next_week" },
    ],
    captures: [
      { title: "Идея сценария", kind: "idea", sphere: "content" },
    ],
    journal: [{ date: "2026-07-18", excerpt: "Неделя прошла спокойно." }],
    finance: [{ currency: "EUR", income: 500, expenses: 120 }],
  };
}

test("builds an exact trailing seven-day range across month boundaries", () => {
  assert.deepEqual(weeklyRangeEnding("2026-08-02"), {
    weekStart: "2026-07-27",
    weekEnd: "2026-08-02",
  });
  assert.throws(() => weeklyRangeEnding("2026-02-30"), /Invalid calendar date/);
});

test("extracts JSON from a model markdown wrapper", () => {
  const value = extractJsonObject("```json\n{\"summary\":\"ok\"}\n```") as Record<string, unknown>;
  assert.equal(value.summary, "ok");
  assert.throws(() => extractJsonObject("not json"), /missing/);
});

test("normalizes model output and removes duplicate or oversized lists", () => {
  const fallback = deterministicWeeklyInsight(facts());
  const result = normalizeWeeklyInsightDraft({
    summary: "  Конкретный итог.  ",
    highlights: ["Первое", "первое", "", 7, ...Array.from({ length: 12 }, (_, index) => `Пункт ${index}`)],
    patterns: null,
    recommendations: ["Сделать следующий шаг"],
    attacker: "ignored",
  }, fallback);

  assert.equal(result.summary, "Конкретный итог.");
  assert.equal(result.highlights.length, 8);
  assert.equal(result.highlights[0], "Первое");
  assert.deepEqual(result.patterns, fallback.patterns);
  assert.deepEqual(result.recommendations, ["Сделать следующий шаг"]);
});

test("deterministic fallback uses only supplied weekly facts", () => {
  const result = deterministicWeeklyInsight(facts());
  assert.match(result.summary, /2 завершённых задач/);
  assert.match(result.summary, /72.?000 шагов/);
  assert.match(result.highlights[0], /Опубликовать ролик/);
  assert.match(result.recommendations[0], /Подготовить запуск/);
});

test("normalizes a stored insight and rejects invalid ranges or providers", () => {
  const stored = normalizeStoredWeeklyInsight({
    id: "70f93e2a-f3d3-4f40-a9e5-024e22e90cab",
    week_start: "2026-07-12",
    week_end: "2026-07-18",
    summary: "Итог недели",
    highlights: ["Готово"],
    patterns: ["Паттерн"],
    recommendations: ["Следующий шаг"],
    metrics: facts().metrics,
    provider: "openai",
    generated_at: "2026-07-18T10:00:00.000Z",
  });
  assert.equal(stored?.metrics.averageMood, 4.2);
  assert.equal(stored?.provider, "openai");

  assert.equal(normalizeStoredWeeklyInsight({
    id: "id",
    week_start: "2026-07-11",
    week_end: "2026-07-18",
    summary: "bad",
    highlights: [],
    patterns: [],
    recommendations: [],
    metrics: {},
    provider: "attacker",
    generated_at: "2026-07-18T10:00:00.000Z",
  }), null);
});

test("renders a bounded weekly insight for vector memory", () => {
  const draft = deterministicWeeklyInsight(facts());
  const text = weeklyInsightMemoryText({
    ...draft,
    weekStart: "2026-07-12",
    weekEnd: "2026-07-18",
    metrics: facts().metrics,
    provider: "extractive",
    generatedAt: "2026-07-18T10:00:00.000Z",
  });
  assert.match(text, /Недельный обзор 2026-07-12/);
  assert.match(text, /Главное:/);
  assert.match(text, /Следующая неделя:/);
});
