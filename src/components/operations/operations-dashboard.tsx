"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { TopbarTicker } from "@/components/ui/topbar-ticker";
import type {
  OperationsDashboardData,
  OperationsJob,
} from "@/lib/operations/data";
import type {
  SystemJobHealth,
  SystemJobName,
  SystemJobRun,
} from "@/lib/operations/normalize";

const jobEndpoints: Record<SystemJobName, string> = {
  obsidian_sync: "/api/memory/sync-obsidian",
  calendar_sync: "/api/cron/sync-calendar",
  finance_sync: "/api/finance/sync-google-sheets",
  weekly_insight: "/api/insights/weekly",
};

const healthLabels: Record<SystemJobHealth, string> = {
  healthy: "healthy",
  running: "running",
  pending: "awaiting first run",
  stale: "overdue",
  attention: "attention",
  disabled: "not configured",
  unavailable: "status unavailable",
};

const summaryLabels: Record<string, string> = {
  status: "result",
  noteCount: "notes",
  changedCount: "changed",
  removedCount: "removed",
  indexedCount: "indexed",
  embeddedCount: "embedded",
  upserted: "upserted",
  deleted: "deleted",
  fullSync: "full sync",
  transactionCount: "transactions",
  upsertedCount: "upserted",
  deletedCount: "deleted",
  skippedBlankRows: "blank rows",
  weekStart: "week start",
  weekEnd: "week end",
  provider: "provider",
  memoryIndexed: "memory indexed",
  recovered: "recovered",
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

function formatDate(value: string | null, timeZone: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null) return "—";
  if (value < 1_000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1_000)}s`;
}

function Summary({ run }: { run: SystemJobRun }) {
  const values = Object.entries(run.summary);
  if (!values.length) {
    return <span className="operations-empty-value">no technical summary</span>;
  }
  return (
    <div className="operations-summary">
      {values.map(([key, value]) => (
        <span key={key}>
          <small>{summaryLabels[key] ?? key}</small>
          <b>{typeof value === "boolean" ? (value ? "yes" : "no") : String(value)}</b>
        </span>
      ))}
    </div>
  );
}

function JobCard({
  job,
  timeZone,
  runningJob,
  onRun,
}: {
  job: OperationsJob;
  timeZone: string;
  runningJob: SystemJobName | null;
  onRun: (name: SystemJobName) => void;
}) {
  return (
    <article className={`operations-job-card state-${job.health}`}>
      <header>
        <div>
          <span className="operations-state-dot" />
          <h2>{job.label}</h2>
        </div>
        <span className="operations-chip">{healthLabels[job.health]}</span>
      </header>
      <p>{job.description}</p>
      <dl>
        <div><dt>schedule</dt><dd>{job.schedule}</dd></div>
        <div><dt>last start</dt><dd>{formatDate(job.latest?.startedAt ?? null, timeZone)}</dd></div>
        <div><dt>duration</dt><dd>{formatDuration(job.latest?.durationMs ?? null)}</dd></div>
        <div><dt>trigger</dt><dd>{job.latest?.trigger ?? "—"}</dd></div>
      </dl>
      {job.latest ? <Summary run={job.latest} /> : null}
      {job.latest?.errorCode ? (
        <p className="operations-error-code">error · {job.latest.errorCode}</p>
      ) : null}
      <button
        type="button"
        disabled={!job.configured || runningJob !== null || job.health === "running"}
        onClick={() => onRun(job.name)}
      >
        {runningJob === job.name ? "RUNNING…" : "RUN NOW"}
      </button>
    </article>
  );
}

export function OperationsDashboard({
  data,
}: {
  data: OperationsDashboardData;
}) {
  const router = useRouter();
  const [clock, setClock] = useState(() => new Date(data.generatedAt));
  const [runningJob, setRunningJob] = useState<SystemJobName | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function runJob(name: SystemJobName): Promise<void> {
    setRunningJob(name);
    setNotice(null);
    try {
      const response = await fetch(jobEndpoints[name], {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(response.status === 429 ? "Повторный запуск пока ограничен." : "Задание завершилось с ошибкой.");
      }
      const skipped = typeof payload === "object" && payload !== null && "skipped" in payload;
      setNotice(skipped ? "Запуск уже выполняется или недавно завершился." : "Задание успешно завершено.");
      router.refresh();
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "Не удалось запустить задание.");
      router.refresh();
    } finally {
      setRunningJob(null);
    }
  }

  return (
    <div className="dashboard-page operations-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-dot" /><strong>HinkoK·OS</strong><span>/ v0.1</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link href="/">HOME</Link>
          <Link href="/crm">CRM</Link>
          <Link href="/brain">BRAIN</Link>
          <Link href="/journal">JOURNAL</Link>
          <Link href="/health">HEALTH</Link>
          <Link className="active" href="/operations">STATUS</Link>
          <Link href="/settings">SETTINGS</Link>
          <Link href="/backup">BACKUP</Link>
        </nav>
        <div className="topbar-stats">
          <TopbarTicker />
          <span>PRIVATE OPERATIONS</span>
          <time dateTime={clock.toISOString()}>{formatClock(clock, data.timeZone)}</time>
        </div>
      </header>

      {data.dataStatus === "unavailable" ? (
        <div className="system-notice" role="alert">
          Статус недоступен. Проверьте соединение с Supabase и применение миграции 012.
        </div>
      ) : null}
      {notice ? <div className="system-notice" role="status">{notice}</div> : null}

      <main className="operations-main">
        <section className={`operations-hero state-${data.overall}`}>
          <div>
            <span>01 / / operations</span>
            <h1>systems, <em>observed.</em></h1>
            <p>Закрытый эксплуатационный контур: блокировки, история запусков и безопасное ручное восстановление.</p>
          </div>
          <aside>
            <span>overall status</span>
            <strong>{healthLabels[data.overall]}</strong>
            <small>updated {formatDate(data.generatedAt, data.timeZone)}</small>
          </aside>
        </section>

        <section className="operations-jobs" aria-label="Системные задания">
          {data.jobs.map((job) => (
            <JobCard
              job={job}
              timeZone={data.timeZone}
              runningJob={runningJob}
              onRun={runJob}
              key={job.name}
            />
          ))}
        </section>

        <section className="operations-history">
          <header>
            <div><span>02</span><span>/ /</span><h2>recent runs</h2></div>
            <p>90 day retention · technical metadata only</p>
          </header>
          {data.recentRuns.length ? (
            <div className="operations-table-wrap">
              <table>
                <thead><tr><th>JOB</th><th>STATUS</th><th>TRIGGER</th><th>STARTED</th><th>DURATION</th><th>ERROR</th></tr></thead>
                <tbody>
                  {data.recentRuns.map((run) => (
                    <tr key={run.id}>
                      <td>{run.jobName}</td>
                      <td><span className={`operations-table-status status-${run.status}`}>{run.status}</span></td>
                      <td>{run.trigger}</td>
                      <td>{formatDate(run.startedAt, data.timeZone)}</td>
                      <td>{formatDuration(run.durationMs)}</td>
                      <td>{run.errorCode ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="operations-empty">История появится после первого cron- или ручного запуска.</p>
          )}
        </section>
      </main>
    </div>
  );
}
