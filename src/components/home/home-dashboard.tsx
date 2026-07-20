"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { Icon } from "@/components/ui/icon";
import { TopbarTicker } from "@/components/ui/topbar-ticker";
import type { HomeDashboardData } from "@/lib/home/data";
import type { HomeGoal } from "@/lib/home/normalize";
import type { PersonalSettings } from "@/lib/settings/normalize";

type HomeDashboardProps = {
  data: HomeDashboardData;
  settings: PersonalSettings;
};

type PanelProps = {
  index: string;
  title: string;
  meta?: string;
  className?: string;
  children: React.ReactNode;
};

function Panel({ index, title, meta, className = "", children }: PanelProps) {
  return (
    <section className={`os-panel ${className}`.trim()}>
      <header className="panel-heading">
        <div className="panel-title-wrap">
          <span>{index}</span>
          <span aria-hidden="true">{"//"}</span>
          <h2>{title}</h2>
        </div>
        {meta ? <p>{meta}</p> : null}
      </header>
      {children}
    </section>
  );
}

function formatClock(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} ${currency}`;
  }
}

function NutritionMetric({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const percent = target > 0
    ? Math.min(100, Math.round((value / target) * 100))
    : value > 0
      ? 100
      : 0;
  return (
    <div className="nutrition-metric">
      <div className="nutrition-metric-head">
        <span>{label}</span>
        <strong>{Math.round(value)}{unit}</strong>
      </div>
      <div className="progress-track" aria-label={`${label}: ${percent}%`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>{target}{unit} цель</small>
    </div>
  );
}

function GoalList({
  title,
  period,
  goals,
  pending,
  onAction,
}: {
  title: string;
  period: "week" | "month";
  goals: HomeGoal[];
  pending: boolean;
  onAction: (payload: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState("");

  function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    onAction({ action: "goal_add", period, text: clean });
    setText("");
  }

  return (
    <div className="goal-group">
      <div className="goal-group-title">
        <span>{title}</span>
        <span>{goals.filter((goal) => goal.done).length}/{goals.length}</span>
      </div>
      <form className="goal-add-form" onSubmit={addGoal}>
        <Icon name="plus" size={13} />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={200}
          placeholder="Добавить цель"
          aria-label={`Добавить цель: ${title}`}
          disabled={pending}
        />
      </form>
      <div className="goal-list">
        {goals.length === 0 ? (
          <p className="empty-copy">Целей пока нет.</p>
        ) : (
          goals.map((goal) => (
            <button
              className={`goal-row ${goal.done ? "is-done" : ""}`}
              key={goal.id}
              type="button"
              disabled={pending}
              onClick={() =>
                onAction({
                  action: "goal_completion",
                  period,
                  goalId: goal.id,
                  done: !goal.done,
                })
              }
            >
              <span className="check-control">
                {goal.done ? <Icon name="check" size={11} /> : null}
              </span>
              <span>{goal.text}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function HomeDashboard({ data, settings }: HomeDashboardProps) {
  const router = useRouter();
  const [clock, setClock] = useState(() => new Date(data.generatedAt));
  const [capture, setCapture] = useState("");
  const [captureState, setCaptureState] = useState<"idle" | "sending" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();
  const habitCompleted = settings.habits.filter(
    (habit) => (data.daily.habits[habit.id] ?? 0) >= habit.target,
  ).length;
  const habitScore = Math.round((habitCompleted / settings.habits.length) * 100);
  const displayName = settings.displayName;
  const initials = displayName.slice(0, 2).toLocaleUpperCase("ru-RU");
  const nextEvents = useMemo(() => data.calendarEvents.slice(0, 3), [data.calendarEvents]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function performAction(payload: Record<string, unknown>) {
    startTransition(async () => {
      try {
        const response = await fetch("/api/home/actions", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("action_failed");
        router.refresh();
      } catch {
        window.alert("Не удалось сохранить изменение. Попробуйте ещё раз.");
      }
    });
  }

  async function submitCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = capture.trim();
    if (!text || captureState === "sending") return;
    setCaptureState("sending");

    try {
      const response = await fetch("/api/captures", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `home-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("capture_failed");
      setCapture("");
      setCaptureState("saved");
      router.refresh();
      window.setTimeout(() => setCaptureState("idle"), 2_500);
    } catch {
      setCaptureState("error");
    }
  }

  return (
    <div className="dashboard-page">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-dot" />
          <strong>HinkoK·OS</strong>
          <span>/ v0.1</span>
        </div>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link className="active" href="/">HOME</Link>
          <Link href="/crm">CRM</Link>
          <Link href="/brain">BRAIN</Link>
          <Link href="/journal">JOURNAL</Link>
          <Link href="/health">HEALTH</Link>
          <Link href="/operations">STATUS</Link>
          <Link href="/settings">SETTINGS</Link>
          <Link href="/backup">BACKUP</Link>
        </nav>
        <div className="topbar-stats">
          <TopbarTicker />
          <span><b>{data.stats.openTasks}</b> tasks</span>
          <span><b>{compactNumber(data.stats.memoryChunks)}</b> memory</span>
          <time dateTime={clock.toISOString()}>{formatClock(clock, data.timeZone)}</time>
        </div>
      </header>

      {data.dataStatus === "partial" ? (
        <div className="system-notice" role="status">
          Часть источников временно недоступна — интерфейс показывает безопасное пустое состояние.
        </div>
      ) : null}

      {data.degradedCaptures.length > 0 ? (
        <div className="system-notice system-notice-warning" role="status">
          {data.degradedCaptures.length === 1
            ? "1 захват сохранён не полностью"
            : `${data.degradedCaptures.length} захватов сохранены не полностью`}
          {" — данные не потеряны, но индексация в память, аудит или синхронизация дали сбой: "}
          {data.degradedCaptures.map((capture, index) => (
            <span key={capture.id}>
              {index > 0 ? "; " : ""}
              «{capture.rawText.length > 60 ? `${capture.rawText.slice(0, 60)}…` : capture.rawText}»
            </span>
          ))}
        </div>
      ) : null}

      <main className="dashboard-grid">
        <aside className="dashboard-column left-column">
          <Panel index="01" title="operator" className="operator-panel">
            <div className="operator-profile">
              <div className="operator-avatar" aria-hidden="true">{initials}</div>
              <div>
                <strong>{displayName}</strong>
                <span>operator / private OS</span>
              </div>
              <span className="online-dot" title="Сессия активна" />
            </div>
            <div className="operator-focus">
              <div><span>focus</span><strong>{data.tasks.length ? settings.focusStatement : "Система чиста"}</strong></div>
              <div><span>open</span><strong>{data.stats.openTasks}</strong></div>
            </div>
          </Panel>

          <Panel index="02" title="today · key" meta={`${data.tasks.length} OPEN`}>
            <div className="task-list">
              {data.tasks.length === 0 ? (
                <p className="empty-copy roomy">Ключевых задач на сегодня нет.</p>
              ) : (
                data.tasks.map((task) => (
                  <button
                    className="task-row"
                    key={task.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => performAction({ action: "task_completion", taskId: task.id, completed: true })}
                  >
                    <span className="check-control" />
                    <span className="task-copy">
                      <strong>{task.title}</strong>
                      <small>{task.sphere ?? task.category}{task.timeEstimateMin ? ` · ${task.timeEstimateMin} min` : ""}</small>
                    </span>
                    {task.key ? <span className="key-chip">KEY</span> : null}
                  </button>
                ))
              )}
            </div>
          </Panel>

          <Panel index="03" title="finance · month" meta={data.finance.length ? "LIVE" : "NO DATA"}>
            {data.finance.length === 0 ? (
              <p className="empty-copy roomy">Подключите Google Sheets, чтобы увидеть движение месяца.</p>
            ) : (
              <div className="finance-list">
                {data.finance.slice(0, 2).map((total) => (
                  <div className="finance-row" key={total.currency}>
                    <Icon name="wallet" size={15} />
                    <div><span>{total.currency}</span><small>income / expenses</small></div>
                    <strong>{formatMoney(total.income, total.currency)}<em>−{formatMoney(total.expenses, total.currency)}</em></strong>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>

        <div className="dashboard-column center-column">
          <Panel index="04" title="session" meta="COMMAND">
            <div className="session-hero">
              <div>
                <h1>{data.greeting}, <em>{displayName}.</em></h1>
                <p>{formatLongDate(data.today)} · {data.timeZone}</p>
              </div>
              <strong className="hero-clock">{formatClock(clock, data.timeZone).slice(0, 5)}<sup>{formatClock(clock, data.timeZone).slice(6)}</sup></strong>
            </div>
            <form className={`capture-bar ${captureState}`} onSubmit={submitCapture}>
              <Icon name="spark" size={15} />
              <input
                value={capture}
                onChange={(event) => { setCapture(event.target.value); setCaptureState("idle"); }}
                maxLength={50_000}
                placeholder="Запиши мысль, задачу, событие или приём пищи…"
                aria-label="Быстрый захват"
                disabled={captureState === "sending"}
              />
              <span>{captureState === "saved" ? "СОХРАНЕНО" : captureState === "error" ? "ОШИБКА" : captureState === "sending" ? "РАЗБИРАЮ" : "ENTER"}</span>
              <button type="submit" aria-label="Сохранить захват" disabled={!capture.trim() || captureState === "sending"}>
                <Icon name="arrow" size={15} />
              </button>
            </form>
          </Panel>

          <Panel index="05" title="habits" meta={`${habitCompleted}/${settings.habits.length} · ${habitScore}%`}>
            <div className="habit-summary">
              <div className="score-ring" style={{ background: `conic-gradient(var(--orange) ${habitScore}%, var(--track) 0)` }}>
                <span>{habitScore}</span>
              </div>
              <div><strong>{habitScore >= 70 ? "On track." : "Keep moving."}</strong><span>daily protocol</span></div>
            </div>
            <div className="habit-grid">
              {settings.habits.map((habit) => {
                const current = data.daily.habits[habit.id] ?? 0;
                const complete = current >= habit.target;
                return (
                  <button
                    className={`habit-card ${complete ? "is-complete" : ""}`}
                    key={habit.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => performAction({ action: "habit_completion", habitId: habit.id, completed: !complete })}
                  >
                    <span className="check-control">{complete ? <Icon name="check" size={11} /> : null}</span>
                    <span><strong>{habit.label}</strong><small>{habit.eyebrow}</small></span>
                    <em>{current}/{habit.target}</em>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel index="06" title="calendar" meta="NEXT 7 DAYS">
            <div className="calendar-strip">
              {data.calendarDays.map((day) => (
                <div className={`calendar-day ${day.isToday ? "is-today" : ""}`} key={day.date}>
                  <span>{day.weekday}</span><strong>{day.day}</strong>
                  <i>{day.eventCount ? `${day.eventCount} event` : "—"}</i>
                </div>
              ))}
            </div>
            <div className="event-line">
              <Icon name="calendar" size={14} />
              {nextEvents.length ? nextEvents.map((event) => <span key={event.id}>{event.title}</span>) : <span>Нет ближайших событий</span>}
            </div>
          </Panel>

          <Panel index="07" title="nutrition" meta={`${data.daily.meals.length} MEALS`}>
            <div className="nutrition-grid">
              <NutritionMetric label="Energy" value={data.nutrition.kcal} target={settings.nutritionTargets.kcal} unit="" />
              <NutritionMetric label="Protein" value={data.nutrition.protein} target={settings.nutritionTargets.protein} unit="g" />
              <NutritionMetric label="Carbs" value={data.nutrition.carbs} target={settings.nutritionTargets.carbs} unit="g" />
              <NutritionMetric label="Fat" value={data.nutrition.fat} target={settings.nutritionTargets.fat} unit="g" />
            </div>
          </Panel>
        </div>

        <aside className="dashboard-column right-column">
          <Panel index="08" title="goals" meta="ACTIVE">
            <GoalList title="Эта неделя" period="week" goals={data.daily.weekGoals} pending={isPending} onAction={performAction} />
            <GoalList title="Этот месяц" period="month" goals={data.daily.monthGoals} pending={isPending} onAction={performAction} />
          </Panel>

          <Panel index="09" title="health · today" meta={data.daily.activity.steps !== null ? "SYNCED" : "NO DATA"}>
            <div className="health-primary">
              <Icon name="heart" size={19} />
              <div><strong>{data.daily.activity.steps !== null ? compactNumber(data.daily.activity.steps) : "—"}</strong><span>steps</span></div>
              <div><strong>{data.daily.activity.sleepMinutes !== null ? `${(data.daily.activity.sleepMinutes / 60).toFixed(1)}h` : "—"}</strong><span>sleep</span></div>
            </div>
            <div className="health-metrics">
              <div><span>REST HR</span><strong>{data.daily.activity.restingHr ?? "—"}</strong></div>
              <div><span>HRV</span><strong>{data.daily.activity.hrv ?? "—"}</strong></div>
              <div><span>ACTIVE</span><strong>{data.daily.activity.kcalActive !== null ? `${Math.round(data.daily.activity.kcalActive)} kcal` : "—"}</strong></div>
              <div><span>WEIGHT</span><strong>{data.daily.activity.weightKg !== null ? `${data.daily.activity.weightKg} kg` : "—"}</strong></div>
            </div>
          </Panel>

          <Panel index="10" title="system" meta="PRIVATE">
            <div className="system-grid">
              <div><Icon name="target" size={15} /><span>captures</span><strong>{data.stats.captures}</strong></div>
              <div><Icon name="spark" size={15} /><span>memory</span><strong>{compactNumber(data.stats.memoryChunks)}</strong></div>
            </div>
            <div className="system-footer">
              <span><i /> encrypted session</span>
              <LogoutButton />
            </div>
          </Panel>
        </aside>
      </main>
    </div>
  );
}
