export type WeeklyInsightProvider = "openai" | "extractive";

export type WeeklyInsightMetrics = {
  completedTasks: number;
  createdTasks: number;
  openKeyTasks: number;
  captures: number;
  journalDays: number;
  moodDays: number;
  averageMood: number | null;
  healthDays: number;
  averageSleepHours: number | null;
  totalSteps: number;
  nutritionDays: number;
  meals: number;
  financeTransactions: number;
  partialSources: string[];
};

export type WeeklyTaskFact = {
  title: string;
  sphere: string | null;
  urgency: string;
};

export type WeeklyCaptureFact = {
  title: string;
  kind: string;
  sphere: string | null;
};

export type WeeklyJournalFact = {
  date: string;
  excerpt: string;
};

export type WeeklyFinanceFact = {
  currency: string;
  income: number;
  expenses: number;
};

export type WeeklyInsightFacts = {
  weekStart: string;
  weekEnd: string;
  metrics: WeeklyInsightMetrics;
  completedTasks: WeeklyTaskFact[];
  openKeyTasks: WeeklyTaskFact[];
  captures: WeeklyCaptureFact[];
  journal: WeeklyJournalFact[];
  finance: WeeklyFinanceFact[];
};

export type WeeklyInsightDraft = {
  summary: string;
  highlights: string[];
  patterns: string[];
  recommendations: string[];
};

export type WeeklyInsight = WeeklyInsightDraft & {
  id: string;
  weekStart: string;
  weekEnd: string;
  metrics: WeeklyInsightMetrics;
  provider: WeeklyInsightProvider;
  generatedAt: string;
};

export type StoredWeeklyInsightInput = {
  id: string;
  week_start: string;
  week_end: string;
  summary: string;
  highlights: unknown;
  patterns: unknown;
  recommendations: unknown;
  metrics: unknown;
  provider: string;
  generated_at: string;
};

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DAY_MS = 86_400_000;

function utcDate(value: string): Date {
  if (!CALENDAR_DATE.test(value)) throw new Error("Invalid calendar date");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }
  return date;
}

export function weeklyRangeEnding(date: string): { weekStart: string; weekEnd: string } {
  const weekEnd = utcDate(date);
  return {
    weekStart: new Date(weekEnd.getTime() - 6 * DAY_MS).toISOString().slice(0, 10),
    weekEnd: date,
  };
}

function compactText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\u0000/gu, "")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, maximum);
}

function listValue(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = compactText(item, 500);
    const key = text.toLocaleLowerCase("ru-RU");
    if (!text || seen.has(key)) continue;
    result.push(text);
    seen.add(key);
    if (result.length === 8) break;
  }
  return result.length ? result : fallback;
}

function boundedCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 1_000_000_000)
    : 0;
}

function boundedOptionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
    ? Math.round(value * 10) / 10
    : null;
}

export function normalizeWeeklyMetrics(value: unknown): WeeklyInsightMetrics {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const partialSources = Array.isArray(record.partialSources)
    ? [...new Set(record.partialSources.map((item) => compactText(item, 40)).filter(Boolean))].slice(0, 8)
    : [];
  return {
    completedTasks: boundedCount(record.completedTasks),
    createdTasks: boundedCount(record.createdTasks),
    openKeyTasks: boundedCount(record.openKeyTasks),
    captures: boundedCount(record.captures),
    journalDays: boundedCount(record.journalDays),
    moodDays: boundedCount(record.moodDays),
    averageMood: boundedOptionalNumber(record.averageMood, 1, 5),
    healthDays: boundedCount(record.healthDays),
    averageSleepHours: boundedOptionalNumber(record.averageSleepHours, 0, 24),
    totalSteps: boundedCount(record.totalSteps),
    nutritionDays: boundedCount(record.nutritionDays),
    meals: boundedCount(record.meals),
    financeTransactions: boundedCount(record.financeTransactions),
    partialSources,
  };
}

export function extractJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Weekly insight JSON is missing");
  return JSON.parse(unfenced.slice(first, last + 1)) as unknown;
}

export function normalizeWeeklyInsightDraft(
  candidate: unknown,
  fallback: WeeklyInsightDraft,
): WeeklyInsightDraft {
  const record = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};
  return {
    summary: compactText(record.summary, 4_000) || fallback.summary,
    highlights: listValue(record.highlights, fallback.highlights),
    patterns: listValue(record.patterns, fallback.patterns),
    recommendations: listValue(record.recommendations, fallback.recommendations),
  };
}

export function normalizeStoredWeeklyInsight(
  value: StoredWeeklyInsightInput | null,
): WeeklyInsight | null {
  if (!value) return null;
  const id = compactText(value.id, 128);
  const summary = compactText(value.summary, 4_000);
  const generatedAt = compactText(value.generated_at, 64);
  const provider = value.provider === "openai"
    || value.provider === "extractive"
    ? value.provider
    : null;
  let expectedRange: { weekStart: string; weekEnd: string };
  try {
    expectedRange = weeklyRangeEnding(value.week_end);
  } catch {
    return null;
  }
  if (
    !id
    || !summary
    || !provider
    || expectedRange.weekStart !== value.week_start
    || !Number.isFinite(Date.parse(generatedAt))
  ) return null;

  return {
    id,
    weekStart: value.week_start,
    weekEnd: value.week_end,
    summary,
    highlights: listValue(value.highlights, []),
    patterns: listValue(value.patterns, []),
    recommendations: listValue(value.recommendations, []),
    metrics: normalizeWeeklyMetrics(value.metrics),
    provider,
    generatedAt,
  };
}

function metricSentence(metrics: WeeklyInsightMetrics): string {
  const parts = [
    `${metrics.completedTasks} завершённых задач`,
    `${metrics.captures} захватов`,
    `${metrics.journalDays} дней с дневником`,
  ];
  if (metrics.averageMood !== null) parts.push(`среднее настроение ${metrics.averageMood}/5`);
  if (metrics.averageSleepHours !== null) parts.push(`средний сон ${metrics.averageSleepHours} ч`);
  if (metrics.totalSteps > 0) parts.push(`${metrics.totalSteps.toLocaleString("ru-RU")} шагов`);
  if (metrics.financeTransactions > 0) parts.push(`${metrics.financeTransactions} финансовых операций`);
  return parts.join(", ");
}

export function deterministicWeeklyInsight(
  facts: WeeklyInsightFacts,
): WeeklyInsightDraft {
  const highlights = facts.completedTasks.slice(0, 4).map((task) =>
    `Завершено: ${task.title}${task.sphere ? ` · ${task.sphere}` : ""}`,
  );
  if (!highlights.length) {
    highlights.push("За неделю завершённые задачи не зафиксированы.");
  }

  const patterns: string[] = [];
  if (facts.metrics.journalDays >= 4) patterns.push("Дневник велся регулярно — не менее четырёх дней из семи.");
  if (facts.metrics.healthDays >= 4) patterns.push("Apple Health синхронизировался большую часть недели.");
  if (facts.metrics.openKeyTasks > 0) patterns.push(`На входе в новую неделю осталось ключевых задач: ${facts.metrics.openKeyTasks}.`);
  if (!patterns.length) patterns.push("Данных пока недостаточно для устойчивого недельного паттерна.");

  const recommendations = facts.openKeyTasks.slice(0, 3).map((task) =>
    `Определить ближайшее действие по ключевой задаче: ${task.title}.`,
  );
  if (!recommendations.length) {
    recommendations.push("Выбрать одну проверяемую цель на следующую неделю.");
  }
  if (facts.metrics.partialSources.length) {
    recommendations.push(`Проверить неполные источники данных: ${facts.metrics.partialSources.join(", ")}.`);
  }

  return {
    summary: `Недельный обзор за ${facts.weekStart} — ${facts.weekEnd}: ${metricSentence(facts.metrics)}.`,
    highlights,
    patterns,
    recommendations,
  };
}

export function weeklyInsightMemoryText(insight: Omit<WeeklyInsight, "id">): string {
  return [
    `Недельный обзор ${insight.weekStart} — ${insight.weekEnd}`,
    insight.summary,
    "",
    "Главное:",
    ...insight.highlights.map((item) => `- ${item}`),
    "",
    "Паттерны:",
    ...insight.patterns.map((item) => `- ${item}`),
    "",
    "Следующая неделя:",
    ...insight.recommendations.map((item) => `- ${item}`),
  ].join("\n");
}
