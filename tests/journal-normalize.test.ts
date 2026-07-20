import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMoodSeries,
  moodSleepCorrelation,
  normalizeJournalDay,
  promptsForDate,
  sleepMoodBands,
} from "../src/lib/journal/normalize";

test("JOURNAL preserves web and captured entries without trusting malformed JSON", () => {
  const day = normalizeJournalDay("2026-07-18", "5", {
    journal: {
      daily_entry: { id: "daily", t: "20:10", text: "  Хороший день. ", source: "web" },
      entries: [
        { id: "capture", t: "13:00", text: "Мысль из Telegram", source: "telegram", title: "Мысль" },
        { id: "bad", text: "" },
      ],
    },
    activity: { sleep_minutes: 455 },
  });

  assert.equal(day.mood, "5");
  assert.equal(day.sleepMinutes, 455);
  assert.equal(day.dailyEntry?.text, "Хороший день.");
  assert.equal(day.capturedEntries.length, 1);
  assert.equal(day.wordCount, 5);
});

test("JOURNAL builds a stable 30-day series including missing dates", () => {
  const recorded = normalizeJournalDay("2026-07-17", "4", {});
  const series = buildMoodSeries("2026-07-18", [recorded]);
  assert.equal(series.length, 30);
  assert.equal(series.at(-1)?.date, "2026-07-18");
  assert.equal(series.at(-1)?.isToday, true);
  assert.equal(series.at(-2)?.mood, 4);
});

test("JOURNAL calculates sleep bands and Pearson correlation", () => {
  const days = [
    normalizeJournalDay("2026-07-16", "2", { activity: { sleep_minutes: 330 } }),
    normalizeJournalDay("2026-07-17", "3", { activity: { sleep_minutes: 390 } }),
    normalizeJournalDay("2026-07-18", "5", { activity: { sleep_minutes: 500 } }),
  ];
  const bands = sleepMoodBands(days);
  assert.equal(bands[0].averageMood, 2);
  assert.equal(bands[1].averageMood, 3);
  assert.equal(bands[3].averageMood, 5);
  assert.ok((moodSleepCorrelation(days) ?? 0) > 0.9);
});

test("JOURNAL prompts are deterministic and unique for a date", () => {
  const first = promptsForDate("2026-07-18");
  const second = promptsForDate("2026-07-18");
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, 3);
});
