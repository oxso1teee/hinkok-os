"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TopbarTicker } from "@/components/ui/topbar-ticker";
import type { HealthDashboardData } from "@/lib/health/data";
import type {
  HealthDay,
  HealthMetricKey,
  HealthMetricSnapshot,
} from "@/lib/health/normalize";

type MetricDefinition = {
  key: HealthMetricKey;
  label: string;
  unit: string;
  digits: number;
  context: "latest" | "today";
};

const METRICS: MetricDefinition[] = [
  { key: "restingHr", label: "RHR", unit: "bpm", digits: 0, context: "latest" },
  { key: "steps", label: "STEPS", unit: "", digits: 0, context: "today" },
  { key: "kcalActive", label: "CALORIES", unit: "active", digits: 0, context: "today" },
  { key: "weightKg", label: "WEIGHT", unit: "kg", digits: 1, context: "latest" },
  { key: "vo2Max", label: "VO₂ MAX", unit: "ml/kg/min", digits: 1, context: "latest" },
  { key: "hrv", label: "HRV", unit: "ms", digits: 0, context: "latest" },
];

function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMetric(value: number | null, digits: number): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function shortDate(value: string | null): string {
  if (!value) return "no data";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`)).toUpperCase();
}

function metricDelta(metric: HealthMetricSnapshot): string {
  if (metric.delta === null) return "no previous";
  const rounded = Math.abs(metric.delta) >= 10
    ? Math.round(metric.delta)
    : Math.round(metric.delta * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} vs prev`;
}

function MetricCard({
  definition,
  metric,
  today,
}: {
  definition: MetricDefinition;
  metric: HealthMetricSnapshot;
  today: string;
}) {
  const context = metric.date === today
    ? "today"
    : definition.context === "today" && metric.date
      ? shortDate(metric.date)
      : metric.date
        ? `as of ${shortDate(metric.date)}`
        : "no data";

  return (
    <article className="health-metric-card">
      <header><span>{definition.label}</span><small>{context}</small></header>
      <div>
        <strong>{formatMetric(metric.value, definition.digits)}</strong>
        <em>{definition.unit}</em>
      </div>
      <p className={metric.delta === null ? "empty" : metric.delta > 0 ? "up" : metric.delta < 0 ? "down" : "flat"}>
        {metricDelta(metric)}
      </p>
    </article>
  );
}

function PanelHeader({ index, title, meta }: { index: string; title: string; meta: string }) {
  return (
    <header>
      <div><span>{index}</span><span>/ /</span><h2>{title}</h2></div>
      <p>{meta}</p>
    </header>
  );
}

function SleepWeek({ data }: { data: HealthDashboardData }) {
  return (
    <section className="health-panel health-sleep-week">
      <PanelHeader
        index="01"
        title="sleep · week"
        meta={`avg ${data.stats.averageSleepHours === null ? "—" : `${data.stats.averageSleepHours}h`} · ${data.stats.averageSleepScore ?? "—"} score`}
      />
      <div className="health-sleep-bars" aria-label="Сон за последние семь дней">
        {data.week.map((day) => {
          const minutes = day.activity.sleepMinutes;
          const height = minutes === null ? 6 : Math.max(10, Math.min(100, (minutes / 540) * 100));
          return (
            <div className={day.isToday ? "today" : ""} key={day.date}>
              <div className={minutes === null ? "empty" : ""} title={`${day.date}: ${minutes ?? "нет данных"}`}>
                <i style={{ height: `${height}%` }} />
              </div>
              <strong>{minutes === null ? "—" : `${(minutes / 60).toFixed(1)}h`}</strong>
              <span>{day.weekday}</span>
            </div>
          );
        })}
      </div>
      <footer><span className="health-legend-dot sleep" /> target · 8h <b>{data.week.filter((day) => (day.activity.sleepMinutes ?? 0) >= 480).length}/7 days</b></footer>
    </section>
  );
}

function ActivityWeek({ data }: { data: HealthDashboardData }) {
  const maximum = Math.max(10_000, ...data.week.map((day) => day.activity.steps ?? 0));
  return (
    <section className="health-panel health-activity-week">
      <PanelHeader
        index="02"
        title="activity · week"
        meta={`${compactNumber(data.stats.totalSteps)} steps · ${data.stats.activeDays}/7 days`}
      />
      <div className="health-activity-list">
        {[...data.week].reverse().map((day) => {
          const steps = day.activity.steps;
          const minutes = day.activity.minutesActive;
          const calories = day.activity.kcalActive;
          return (
            <div className={day.isToday ? "today" : ""} key={day.date}>
              <span>{day.weekday}</span>
              <p><strong>{steps === null ? "—" : compactNumber(steps)} steps</strong><small>{minutes === null ? "— min" : `${minutes} min`}</small></p>
              <div className={steps === null ? "empty" : ""}><i style={{ width: `${steps === null ? 0 : Math.max(3, (steps / maximum) * 100)}%` }} /></div>
              <b>{calories === null ? "—" : Math.round(calories)}</b>
            </div>
          );
        })}
      </div>
      <footer><span className="health-legend-dot activity" /> active kcal <b>{data.stats.totalActiveMinutes} min total</b></footer>
    </section>
  );
}

function buildHeartRatePath(days: HealthDay[]): {
  path: string;
  points: Array<{ x: number; y: number; value: number; date: string }>;
  minimum: number | null;
  maximum: number | null;
} {
  const measured = days.flatMap((day, index) => {
    const value = day.activity.restingHr;
    return value === null ? [] : [{ index, value, date: day.date }];
  });
  if (!measured.length) return { path: "", points: [], minimum: null, maximum: null };
  const values = measured.map((item) => item.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(8, maximum - minimum);
  const points = measured.map((item) => ({
    x: days.length === 1 ? 500 : (item.index / (days.length - 1)) * 1_000,
    y: 120 - ((item.value - minimum) / range) * 76,
    value: item.value,
    date: item.date,
  }));
  return {
    path: points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
    points,
    minimum,
    maximum,
  };
}

function HeartRateTrend({ data }: { data: HealthDashboardData }) {
  const chart = useMemo(() => buildHeartRatePath(data.heartRateTrend), [data.heartRateTrend]);
  return (
    <section className="health-panel health-heart-rate">
      <PanelHeader
        index="03"
        title="resting heart rate · 30d"
        meta={`${data.stats.heartRateDays} measured days · ${chart.minimum ?? "—"}–${chart.maximum ?? "—"} bpm`}
      />
      <div className="health-line-chart">
        {chart.path ? (
          <svg viewBox="0 0 1000 150" preserveAspectRatio="none" role="img" aria-label="Пульс в покое за 30 дней">
            <defs>
              <linearGradient id="health-heart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff9a61" stopOpacity=".28" />
                <stop offset="1" stopColor="#ff9a61" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="area" d={`${chart.path} L${chart.points.at(-1)?.x ?? 1000},145 L${chart.points[0]?.x ?? 0},145 Z`} />
            <path className="line" d={chart.path} />
            {chart.points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="3" />)}
          </svg>
        ) : <p className="health-empty">После первой синхронизации Apple Health здесь появится честный 30-дневный тренд.</p>}
        <div className="health-chart-axis"><span>30d ago</span><span>15d</span><span>today</span></div>
      </div>
    </section>
  );
}

function macroPercent(day: HealthDay, key: "protein" | "carbs" | "fat"): number {
  const protein = day.nutrition.protein * 4;
  const carbs = day.nutrition.carbs * 4;
  const fat = day.nutrition.fat * 9;
  const total = protein + carbs + fat;
  if (!total) return 0;
  const value = key === "protein" ? protein : key === "carbs" ? carbs : fat;
  return (value / total) * 100;
}

function NutritionWeek({ data }: { data: HealthDashboardData }) {
  const maximum = Math.max(2_500, ...data.week.map((day) => day.nutrition.kcal));
  return (
    <section className="health-panel health-nutrition-week">
      <PanelHeader
        index="04"
        title="nutrition · week"
        meta={`avg ${data.stats.averageNutritionKcal === null ? "—" : compactNumber(data.stats.averageNutritionKcal)} kcal · ${data.stats.nutritionDays}/7 days`}
      />
      <div className="health-nutrition-bars" aria-label="Питание за последние семь дней">
        {data.week.map((day) => {
          const height = day.nutrition.kcal ? Math.max(8, (day.nutrition.kcal / maximum) * 100) : 6;
          return (
            <div className={day.isToday ? "today" : ""} key={day.date}>
              <span>{day.weekday}</span>
              <div className={day.nutrition.kcal ? "" : "empty"} style={{ height: `${height}%` }} title={`${day.date}: ${day.nutrition.kcal || "нет данных"}`}>
                <i className="protein" style={{ height: `${macroPercent(day, "protein")}%` }} />
                <i className="carbs" style={{ height: `${macroPercent(day, "carbs")}%` }} />
                <i className="fat" style={{ height: `${macroPercent(day, "fat")}%` }} />
              </div>
              <strong>{day.nutrition.kcal ? compactNumber(day.nutrition.kcal) : "—"}</strong>
            </div>
          );
        })}
      </div>
      <footer>
        <span><i className="protein" /> protein</span>
        <span><i className="carbs" /> carbs</span>
        <span><i className="fat" /> fat</span>
      </footer>
    </section>
  );
}

export function HealthDashboard({ data }: { data: HealthDashboardData }) {
  const [clock, setClock] = useState(() => new Date(data.generatedAt));

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="dashboard-page health-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-dot" /><strong>HinkoK·OS</strong><span>/ v0.1</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link href="/">HOME</Link>
          <Link href="/crm">CRM</Link>
          <Link href="/brain">BRAIN</Link>
          <Link href="/journal">JOURNAL</Link>
          <Link className="active" href="/health">HEALTH</Link>
          <Link href="/operations">STATUS</Link>
          <Link href="/settings">SETTINGS</Link>
          <Link href="/backup">BACKUP</Link>
        </nav>
        <div className="topbar-stats">
          <TopbarTicker />
          <span>{data.latestSync ? `APPLE HEALTH · ${shortDate(data.latestSync.date)}` : "APPLE HEALTH · NOT SYNCED"}</span>
          <time dateTime={clock.toISOString()}>{formatClock(clock, data.timeZone)}</time>
        </div>
      </header>

      {data.dataStatus === "partial" ? <div className="system-notice" role="status">HEALTH показывает безопасное пустое состояние. Проверьте соединение с Supabase.</div> : null}

      <main className="health-main">
        <section className="health-metric-grid" aria-label="Ключевые показатели здоровья">
          {METRICS.map((definition) => (
            <MetricCard
              definition={definition}
              metric={data.metrics[definition.key]}
              today={data.today}
              key={definition.key}
            />
          ))}
        </section>

        {!data.latestSync && data.dataStatus === "ready" ? (
          <div className="health-sync-notice" role="status">
            <strong>Apple Health ещё не синхронизирован.</strong>
            <span>Запустите iOS Shortcut из инструкции — повторная отправка за день безопасно заменит только activity.</span>
          </div>
        ) : null}

        <section className="health-dashboard-grid">
          <SleepWeek data={data} />
          <ActivityWeek data={data} />
          <HeartRateTrend data={data} />
          <NutritionWeek data={data} />
        </section>
      </main>
    </div>
  );
}
