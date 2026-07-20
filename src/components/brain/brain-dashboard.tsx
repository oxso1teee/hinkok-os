"use client";

import Link from "next/link";
import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { TopbarTicker } from "@/components/ui/topbar-ticker";
import {
  BRAIN_SPHERES,
  type BrainSphere,
} from "@/lib/brain/config";
import type { BrainDashboardData, BrainTask } from "@/lib/brain/data";
import type { BrainBriefing } from "@/lib/brain/normalize";

type RagSource = {
  ref: number;
  sourceType: string;
  title: string | null;
  path: string | null;
  sphere: string | null;
  excerpt: string;
  href: string;
  label: string;
};

type AskResult = {
  answer: string;
  provider: string;
  sources: RagSource[];
};

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

function formatGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function postJson(url: string, payload?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error ?? "request_failed"));
  return body;
}

function GroundedAnswer({ answer, sources }: { answer: string; sources: RagSource[] }) {
  const sourceByRef = new Map(sources.map((source) => [source.ref, source]));
  const parts: ReactNode[] = [];
  const pattern = /\[ref:(\d+)\]/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(answer)) !== null) {
    if (match.index > cursor) parts.push(answer.slice(cursor, match.index));
    const ref = Number(match[1]);
    const source = sourceByRef.get(ref);

    if (source) {
      parts.push(
        <a
          key={`${match.index}:${ref}`}
          className="brain-inline-ref"
          href={source.href}
          title={source.path ?? source.title ?? source.sourceType}
        >
          [ref: {source.label}]
        </a>,
      );
    } else {
      parts.push(match[0]);
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < answer.length) parts.push(answer.slice(cursor));
  return <p>{parts}</p>;
}

function TaskLine({
  task,
  busy,
  onComplete,
}: {
  task: BrainTask;
  busy: boolean;
  onComplete: () => void;
}) {
  return (
    <div className={`brain-task-line ${busy ? "is-busy" : ""}`}>
      <button type="button" disabled={busy} onClick={onComplete} aria-label={`Завершить ${task.title}`}>
        <span>{task.key ? "✦" : ""}</span>
      </button>
      <div>
        <strong>{task.title}</strong>
        <small>{task.urgency}{task.timeEstimateMin ? ` · ${task.timeEstimateMin} min` : ""}</small>
      </div>
      <em>{task.key || task.priorityScore >= 70 ? "high" : task.priorityScore >= 30 ? "normal" : "low"}</em>
    </div>
  );
}

export function BrainDashboard({ data }: { data: BrainDashboardData }) {
  const router = useRouter();
  const [sphere, setSphere] = useState<BrainSphere>("work");
  const [tasks, setTasks] = useState(data.tasks);
  const [briefings, setBriefings] = useState(data.briefings);
  const [query, setQuery] = useState("");
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [askState, setAskState] = useState<"idle" | "loading" | "error">("idle");
  const [briefingState, setBriefingState] = useState<"idle" | "loading" | "error">("idle");
  const [syncState, setSyncState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [weeklyState, setWeeklyState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [busyTaskIds, setBusyTaskIds] = useState<Set<string>>(new Set());
  const [clock, setClock] = useState(() => new Date(data.generatedAt));

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.sphere === sphere),
    [tasks, sphere],
  );
  const activeNotes = useMemo(
    () => data.notes.filter((note) => note.sphere === sphere),
    [data.notes, sphere],
  );
  const activeBriefing = briefings[sphere];

  async function askMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.replace(/\s+/g, " ").trim();
    if (!cleanQuery || askState === "loading") return;
    setAskState("loading");
    try {
      const result = await postJson("/api/memory/query", {
        query: cleanQuery,
        matchCount: 12,
        minSimilarity: 0.2,
      });
      setAskResult({
        answer: String(result.answer ?? ""),
        provider: String(result.provider ?? "none"),
        sources: Array.isArray(result.sources) ? result.sources as RagSource[] : [],
      });
      setAskState("idle");
    } catch {
      setAskState("error");
    }
  }

  async function generateBriefing() {
    if (briefingState === "loading") return;
    setBriefingState("loading");
    try {
      const result = await postJson("/api/brain/briefing", { sphere });
      const briefing = result.briefing as BrainBriefing | undefined;
      if (!briefing || briefing.sphere !== sphere) throw new Error("invalid_briefing");
      setBriefings((current) => ({ ...current, [sphere]: briefing }));
      setBriefingState("idle");
    } catch {
      setBriefingState("error");
    }
  }

  async function syncObsidian() {
    if (syncState === "loading" || !data.obsidianConfigured) return;
    setSyncState("loading");
    try {
      await postJson("/api/memory/sync-obsidian");
      setSyncState("done");
      router.refresh();
    } catch {
      setSyncState("error");
    }
  }

  async function generateWeeklyReview() {
    if (weeklyState === "loading") return;
    setWeeklyState("loading");
    try {
      await postJson("/api/insights/weekly");
      setWeeklyState("done");
      router.refresh();
    } catch {
      setWeeklyState("error");
    }
  }

  async function completeTask(task: BrainTask) {
    if (busyTaskIds.has(task.id)) return;
    const snapshot = tasks;
    setBusyTaskIds((current) => new Set(current).add(task.id));
    setTasks((current) => current.filter((item) => item.id !== task.id));
    try {
      await postJson("/api/crm/tasks", {
        action: "completion",
        taskId: task.id,
        completed: true,
      });
    } catch {
      setTasks(snapshot);
    } finally {
      setBusyTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  return (
    <div className="dashboard-page brain-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-dot" /><strong>HinkoK·OS</strong><span>/ v0.1</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link href="/">HOME</Link>
          <Link href="/crm">CRM</Link>
          <Link className="active" href="/brain">BRAIN</Link>
          <Link href="/journal">JOURNAL</Link>
          <Link href="/health">HEALTH</Link>
          <Link href="/operations">STATUS</Link>
          <Link href="/settings">SETTINGS</Link>
          <Link href="/backup">BACKUP</Link>
        </nav>
        <div className="topbar-stats"><TopbarTicker /><time dateTime={clock.toISOString()}>{formatClock(clock, data.timeZone)}</time></div>
      </header>

      {data.dataStatus === "partial" ? <div className="system-notice" role="status">BRAIN показывает безопасное частичное состояние. Проверьте Supabase и примените последнюю миграцию.</div> : null}

      <main className="brain-main">
        <section className="brain-hero">
          <h1>notes that <em>keep thinking.</em></h1>
          <div className="brain-stat-grid">
            {[
              [data.stats.spheres, "spheres"],
              [data.stats.openTasks, "open tasks"],
              [data.stats.notes, "notes"],
              [data.stats.obsidianNotes, "obsidian"],
            ].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
            <button type="button" disabled={!data.obsidianConfigured || syncState === "loading"} onClick={syncObsidian}>
              <Icon name="spark" size={11} />
              {syncState === "loading" ? "syncing" : syncState === "done" ? "synced" : "refresh obsidian"}
            </button>
          </div>
        </section>

        <section className="brain-ask-panel">
          <header><div><span>01</span><span>/ /</span><h2>ask the os</h2></div><p>memory · rag</p></header>
          <form onSubmit={askMemory}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={4_000}
              placeholder="Спроси что-нибудь о своих заметках, решениях или планах…"
              aria-label="Вопрос к персональной памяти"
            />
            <button type="submit" disabled={askState === "loading" || !query.trim()}>
              {askState === "loading" ? "thinking" : "ask"}
            </button>
          </form>
          {askState === "error" ? <p className="brain-error">Не удалось получить ответ. Проверьте AI-ключи и подключение к памяти.</p> : null}
          {askResult ? (
            <div className="brain-answer">
              <div className="brain-answer-copy">
                <span>answer / {askResult.provider}</span>
                <GroundedAnswer answer={askResult.answer} sources={askResult.sources} />
              </div>
              {askResult.sources.length ? (
                <details>
                  <summary>Источники · {askResult.sources.length}</summary>
                  <div className="brain-source-list">
                    {askResult.sources.map((source) => (
                      <div id={`memory-source-${source.ref}`} key={source.ref}><strong><a href={source.href}>[ref: {source.label}] {source.title ?? source.sourceType}</a></strong><span>{source.path ?? source.sphere ?? source.sourceType}</span><p>{source.excerpt}</p></div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="brain-weekly-panel">
          <header>
            <div><span>02</span><span>/ /</span><h2>weekly review</h2></div>
            <div>
              {data.latestWeeklyInsight ? <small>{data.latestWeeklyInsight.weekStart} — {data.latestWeeklyInsight.weekEnd} · {data.latestWeeklyInsight.provider}</small> : null}
              <button type="button" onClick={generateWeeklyReview} disabled={weeklyState === "loading"}>
                {weeklyState === "loading" ? "generating" : weeklyState === "done" ? "generated" : data.latestWeeklyInsight ? "regenerate" : "generate"}
              </button>
            </div>
          </header>
          {weeklyState === "error" ? <p className="brain-error">Не удалось сформировать недельный обзор. Проверьте миграцию, AI-ключи и подключение к Supabase.</p> : null}
          {data.latestWeeklyInsight ? (
            <div className="brain-weekly-content">
              <section>
                <strong>summary</strong>
                <p>{data.latestWeeklyInsight.summary}</p>
                <div className="brain-weekly-metrics">
                  <span>{data.latestWeeklyInsight.metrics.completedTasks} done</span>
                  <span>{data.latestWeeklyInsight.metrics.captures} captures</span>
                  <span>{data.latestWeeklyInsight.metrics.journalDays} journal days</span>
                  <span>{data.latestWeeklyInsight.metrics.healthDays} health days</span>
                </div>
              </section>
              <section><strong>highlights</strong><ul>{data.latestWeeklyInsight.highlights.map((item) => <li key={item}>{item}</li>)}</ul></section>
              <section><strong>patterns</strong><ul>{data.latestWeeklyInsight.patterns.map((item) => <li key={item}>{item}</li>)}</ul></section>
              <section><strong>next week</strong><ul>{data.latestWeeklyInsight.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></section>
            </div>
          ) : <p className="brain-weekly-empty">Недельный обзор появится после ручного запуска или воскресного cron.</p>}
        </section>

        <nav className="brain-spheres" aria-label="Сферы жизни">
          {BRAIN_SPHERES.map((item, index) => {
            const stats = data.sphereStats[item];
            return (
              <button className={sphere === item ? "active" : ""} type="button" key={item} onClick={() => setSphere(item)}>
                <small>{String(index + 1).padStart(2, "0")}</small>
                <strong>{data.sphereInfo[item].label}</strong>
                <span>{stats.taskCount} tasks · {stats.noteCount} notes</span>
              </button>
            );
          })}
        </nav>

        <section className="brain-sphere-panel">
          <header className="brain-sphere-head">
            <div><span>↗ /</span><h2>{data.sphereInfo[sphere].label}</h2></div>
            <p>{data.sphereInfo[sphere].description}</p>
            <strong>operational</strong>
          </header>

          <section className="brain-briefing-section">
            <header>
              <div><span>AI briefing</span>{activeBriefing ? <small>{formatGeneratedAt(activeBriefing.generatedAt)} · {activeBriefing.provider}</small> : null}</div>
              <button type="button" onClick={generateBriefing} disabled={briefingState === "loading"}>
                {briefingState === "loading" ? "generating" : activeBriefing ? "regenerate" : "generate"}
              </button>
            </header>
            {briefingState === "error" ? <p className="brain-error">Не удалось сформировать брифинг. Попробуйте ещё раз.</p> : null}
            <div className="brain-briefing-copy">
              {activeBriefing ? activeBriefing.text : "Нажмите Generate — система прочитает задачи и заметки этой сферы и подготовит короткий операционный брифинг."}
            </div>
          </section>

          <div className="brain-content-grid">
            <section className="brain-list-section">
              <header><span>open tasks ({activeTasks.length})</span><Link href="/crm">open crm ↗</Link></header>
              <div>
                {activeTasks.length ? activeTasks.map((task) => (
                  <TaskLine key={task.id} task={task} busy={busyTaskIds.has(task.id)} onComplete={() => completeTask(task)} />
                )) : <p className="brain-empty">Открытых задач в этой сфере нет.</p>}
              </div>
            </section>

            <section className="brain-list-section brain-notes-section">
              <header><span>notes ({activeNotes.length})</span><small>latest sources</small></header>
              <div>
                {activeNotes.length ? activeNotes.slice(0, 14).map((note, index) => (
                  <article key={`${note.sourceType}:${note.sourceKey}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{note.title}</strong><p>{note.excerpt}</p><small>{note.path ?? note.sourceType}</small></div>
                  </article>
                )) : <p className="brain-empty">Заметок в этой сфере пока нет.</p>}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
