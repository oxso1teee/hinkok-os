import {
  isJournalMood,
  JOURNAL_PROMPTS,
  type JournalMood,
} from "@/lib/journal/config";
import type { Json } from "@/types/database";

export type JournalTextEntry = {
  id: string;
  time: string | null;
  text: string;
  title: string | null;
  source: string;
  updatedAt: string | null;
};

export type JournalDay = {
  date: string;
  mood: JournalMood | null;
  sleepMinutes: number | null;
  dailyEntry: JournalTextEntry | null;
  capturedEntries: JournalTextEntry[];
  combinedText: string;
  title: string;
  wordCount: number;
};

export type JournalMoodPoint = {
  date: string;
  day: string;
  mood: number | null;
  sleepMinutes: number | null;
  isToday: boolean;
};

export type SleepMoodBand = {
  id: "under_6" | "six_to_7" | "seven_to_8" | "eight_plus";
  label: string;
  averageMood: number | null;
  samples: number;
};

type JsonObject = { [key: string]: Json | undefined };

function objectValue(value: Json | undefined): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function textValue(value: Json | undefined, maximum: number): string {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").trim().slice(0, maximum)
    : "";
}

function finiteNumber(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEntry(value: Json | undefined): JournalTextEntry | null {
  const entry = objectValue(value);
  const id = textValue(entry.id, 128);
  const text = textValue(entry.text, 20_000);
  if (!id || !text) return null;
  const time = textValue(entry.t, 8);
  const updatedAt = textValue(entry.updated_at, 64);

  return {
    id,
    time: /^([01]\d|2[0-3]):[0-5]\d$/u.test(time) ? time : null,
    text,
    title: textValue(entry.title, 160) || null,
    source: textValue(entry.source, 32) || "unknown",
    updatedAt: Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
  };
}

function normalizeEntries(value: Json | undefined): JournalTextEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeEntry)
    .filter((entry): entry is JournalTextEntry => entry !== null)
    .slice(-20);
}

function compact(value: string, maximum: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maximum
    ? clean
    : `${clean.slice(0, maximum - 1).trimEnd()}…`;
}

function entryTitle(entries: JournalTextEntry[], date: string): string {
  const titled = entries.find((entry) => entry.title)?.title;
  if (titled) return compact(titled, 110);
  const firstText = entries[0]?.text;
  if (!firstText) return `Запись ${date}`;
  const sentence = firstText.split(/(?<=[.!?])\s+|\n/u)[0];
  return compact(sentence, 110) || `Запись ${date}`;
}

export function normalizeJournalDay(
  date: string,
  moodValue: string | null,
  notes: Json | null,
): JournalDay {
  const root = objectValue(notes ?? {});
  const journal = objectValue(root.journal);
  const activity = objectValue(root.activity);
  const dailyEntry = normalizeEntry(journal.daily_entry);
  const capturedEntries = normalizeEntries(journal.entries);
  const allEntries = [...(dailyEntry ? [dailyEntry] : []), ...capturedEntries];
  const combinedText = allEntries.map((entry) => entry.text).join("\n\n").trim();
  const mood = moodValue && isJournalMood(moodValue) ? moodValue : null;
  const rawSleep = finiteNumber(activity.sleep_minutes);
  const sleepMinutes = rawSleep !== null && rawSleep >= 0 && rawSleep <= 1_440
    ? Math.round(rawSleep)
    : null;

  return {
    date,
    mood,
    sleepMinutes,
    dailyEntry,
    capturedEntries,
    combinedText,
    title: entryTitle(allEntries, date),
    wordCount: combinedText ? combinedText.split(/\s+/u).length : 0,
  };
}

export function buildMoodSeries(
  today: string,
  days: JournalDay[],
  count = 30,
): JournalMoodPoint[] {
  const [year, month, day] = today.split("-").map(Number);
  const end = Date.UTC(year, month - 1, day);
  const byDate = new Map(days.map((item) => [item.date, item]));

  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const date = new Date(end - offset * 86_400_000);
    const iso = date.toISOString().slice(0, 10);
    const item = byDate.get(iso);
    return {
      date: iso,
      day: String(date.getUTCDate()).padStart(2, "0"),
      mood: item?.mood ? Number(item.mood) : null,
      sleepMinutes: item?.sleepMinutes ?? null,
      isToday: iso === today,
    };
  });
}

export function sleepMoodBands(days: JournalDay[]): SleepMoodBand[] {
  const bands: Array<SleepMoodBand & { values: number[] }> = [
    { id: "under_6", label: "< 6h", averageMood: null, samples: 0, values: [] },
    { id: "six_to_7", label: "6–7h", averageMood: null, samples: 0, values: [] },
    { id: "seven_to_8", label: "7–8h", averageMood: null, samples: 0, values: [] },
    { id: "eight_plus", label: "8h+", averageMood: null, samples: 0, values: [] },
  ];

  for (const day of days) {
    if (!day.mood || day.sleepMinutes === null) continue;
    const index = day.sleepMinutes < 360 ? 0 : day.sleepMinutes < 420 ? 1 : day.sleepMinutes < 480 ? 2 : 3;
    bands[index].values.push(Number(day.mood));
  }

  return bands.map(({ values, ...band }) => ({
    ...band,
    samples: values.length,
    averageMood: values.length
      ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
      : null,
  }));
}

export function moodSleepCorrelation(days: JournalDay[]): number | null {
  const samples = days.flatMap((day) =>
    day.mood && day.sleepMinutes !== null
      ? [{ x: day.sleepMinutes, y: Number(day.mood) }]
      : [],
  );
  if (samples.length < 3) return null;
  const meanX = samples.reduce((sum, item) => sum + item.x, 0) / samples.length;
  const meanY = samples.reduce((sum, item) => sum + item.y, 0) / samples.length;
  const numerator = samples.reduce((sum, item) => sum + (item.x - meanX) * (item.y - meanY), 0);
  const denominatorX = Math.sqrt(samples.reduce((sum, item) => sum + (item.x - meanX) ** 2, 0));
  const denominatorY = Math.sqrt(samples.reduce((sum, item) => sum + (item.y - meanY) ** 2, 0));
  if (denominatorX === 0 || denominatorY === 0) return null;
  return Math.round((numerator / (denominatorX * denominatorY)) * 100) / 100;
}

export function promptsForDate(date: string, count = 3): string[] {
  const seed = date.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Array.from({ length: Math.min(count, JOURNAL_PROMPTS.length) }, (_, index) =>
    JOURNAL_PROMPTS[(seed + index * 4) % JOURNAL_PROMPTS.length],
  );
}
