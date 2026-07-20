"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { JOURNAL_MOODS, type JournalMood } from "@/lib/journal/config";
import type { JournalDashboardData } from "@/lib/journal/data";
import type { JournalDay } from "@/lib/journal/normalize";

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

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function moodColor(mood: number | null): string {
  if (mood === null) return "empty";
  if (mood <= 2) return "low";
  if (mood === 3) return "middle";
  return "high";
}

async function postJournal(payload: Record<string, unknown>) {
  const response = await fetch("/api/journal/actions", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error ?? "journal_action_failed"));
  return body;
}

function ArchiveEntry({
  day,
  expanded,
  onToggle,
}: {
  day: JournalDay;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className={`journal-archive-entry ${expanded ? "expanded" : ""}`}>
      <header>
        <span>{formatDate(day.date)}</span>
        <div>
          {day.mood ? <em>{JOURNAL_MOODS[Number(day.mood) - 1].emoji}</em> : null}
          <button type="button" onClick={onToggle}>{expanded ? "hide" : "show raw"}</button>
        </div>
      </header>
      <strong>{day.title}</strong>
      <p>{day.combinedText}</p>
      <small>{day.wordCount} слов{day.sleepMinutes !== null ? ` · сон ${(day.sleepMinutes / 60).toFixed(1)}h` : ""}</small>
    </article>
  );
}

export function JournalDashboard({ data }: { data: JournalDashboardData }) {
  const [mood, setMood] = useState<JournalMood | null>(data.todayEntry.mood);
  const [entry, setEntry] = useState(data.todayEntry.dailyEntry?.text ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "save_error" | "memory_error">("idle");
  const [moodBusy, setMoodBusy] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date(data.generatedAt));
  const wordCount = useMemo(() => entry.trim() ? entry.trim().split(/\s+/u).length : 0, [entry]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function chooseMood(nextMood: JournalMood) {
    if (moodBusy) return;
    const previous = mood;
    setMood(nextMood);
    setMoodBusy(true);
    try {
      await postJournal({ action: "mood", mood: nextMood });
    } catch {
      setMood(previous);
    } finally {
      setMoodBusy(false);
    }
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = entry.trim();
    if (!text || saveState === "saving") return;
    setSaveState("saving");
    try {
      const result = await postJournal({ action: "save_entry", text });
      setEntry(text);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2_500);
      if (result.memoryIndexed === false) {
        window.setTimeout(() => setSaveState("memory_error"), 2_600);
      }
    } catch {
      setSaveState("save_error");
    }
  }

  function insertPrompt(prompt: string) {
    setEntry((current) => `${current.trim()}${current.trim() ? "\n\n" : ""}${prompt}\n`);
  }

  return (
    <div className="dashboard-page journal-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-dot" /><strong>HinkoK·OS</strong><span>/ v0.1</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link href="/">HOME</Link>
          <Link href="/crm">CRM</Link>
          <Link href="/brain">BRAIN</Link>
          <Link className="active" href="/journal">JOURNAL</Link>
          <Link href="/health">HEALTH</Link>
          <Link href="/operations">STATUS</Link>
          <Link href="/settings">SETTINGS</Link>
          <Link href="/backup">BACKUP</Link>
        </nav>
        <div className="topbar-stats"><time dateTime={clock.toISOString()}>{formatClock(clock, data.timeZone)}</time></div>
      </header>

      {data.dataStatus === "partial" ? <div className="system-notice" role="status">JOURNAL показывает безопасное пустое состояние. Проверьте Supabase и примените последнюю миграцию.</div> : null}

      <main className="journal-main">
        <section className="journal-top-grid">
          <section className="journal-panel journal-mood-picker">
            <header><div><span>01</span><span>/ /</span><h2>how are you?</h2></div><p>mood</p></header>
            <div className="journal-moods">
              <span>mood</span>
              {JOURNAL_MOODS.map((item) => (
                <button
                  className={mood === item.value ? "active" : ""}
                  type="button"
                  key={item.value}
                  disabled={moodBusy}
                  onClick={() => chooseMood(item.value)}
                  aria-label={`Настроение: ${item.label}`}
                >
                  <strong>{item.emoji}</strong>
                  <small>{item.label}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="journal-panel journal-mood-chart">
            <header><div><span>02</span><span>/ /</span><h2>mood · 30d</h2></div><p>avg <strong>{data.stats.averageMood ?? "—"}</strong></p></header>
            <div className="mood-bars" aria-label="Настроение за 30 дней">
              {data.moodSeries.map((point, index) => (
                <div className={`mood-bar ${moodColor(point.mood)} ${point.isToday ? "today" : ""}`} key={point.date} title={`${point.date}: ${point.mood ?? "нет данных"}`}>
                  <span style={{ height: point.mood ? `${26 + point.mood * 12}%` : "10%" }} />
                  {(index === 0 || index === 14 || point.isToday) ? <small>{point.day}</small> : null}
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="journal-panel journal-sleep-panel">
          <header><div><span>02b</span><span>/ /</span><h2>mood × sleep</h2></div><p>{data.correlation === null ? "need 3+ paired days" : `30d · R ${data.correlation >= 0 ? "+" : ""}${data.correlation}`}</p></header>
          <div className="sleep-band-list">
            {data.sleepBands.map((band) => {
              const width = band.averageMood === null ? 0 : Math.max(8, band.averageMood * 20);
              return (
                <div key={band.id}>
                  <span>{band.label}</span>
                  <div><i style={{ width: `${width}%` }} /></div>
                  <strong>{band.averageMood === null ? "—" : band.averageMood.toFixed(1)} <small>· {band.samples}d</small></strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="journal-body-grid">
          <form className="journal-panel journal-editor" onSubmit={saveEntry}>
            <header><div><span>01</span><span>/ /</span><h2>today&apos;s entry</h2></div><p>{wordCount} words</p></header>
            {data.todayEntry.capturedEntries.length ? (
              <details className="journal-captures">
                <summary>Захвачено сегодня · {data.todayEntry.capturedEntries.length}</summary>
                {data.todayEntry.capturedEntries.map((item) => <p key={item.id}><strong>{item.time ?? "—"}</strong>{item.text}</p>)}
              </details>
            ) : null}
            <textarea
              value={entry}
              onChange={(event) => { setEntry(event.target.value); if (saveState !== "idle") setSaveState("idle"); }}
              maxLength={20_000}
              placeholder="Продолжай писать…"
              aria-label="Запись в дневнике за сегодня"
            />
            <footer>
              <button type="submit" disabled={!entry.trim() || saveState === "saving"}>
                {saveState === "saving" ? "saving" : saveState === "saved" ? "saved" : "save entry"}
              </button>
              <span className={saveState === "save_error" || saveState === "memory_error" ? "error" : ""}>
                {saveState === "save_error"
                  ? "Не удалось подтвердить сохранение. Повторите попытку."
                  : saveState === "memory_error"
                    ? "Текст сохранён, но векторная память пока не обновилась."
                    : `${entry.length.toLocaleString("ru-RU")} / 20 000`}
              </span>
            </footer>
          </form>

          <aside className="journal-side-column">
            <section className="journal-panel journal-prompts">
              <header><div><span>03</span><span>/ /</span><h2>prompts</h2></div><p>3 · day</p></header>
              <div>
                {data.prompts.map((prompt, index) => (
                  <button type="button" key={prompt} onClick={() => insertPrompt(prompt)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{prompt}</strong>
                    <Icon name="plus" size={11} />
                  </button>
                ))}
              </div>
            </section>

            <section className="journal-panel journal-archive">
              <header><div><span>04</span><span>/ /</span><h2>archive</h2></div><p>last {data.archive.length}</p></header>
              <div className="journal-archive-list">
                {data.archive.length ? data.archive.map((day) => (
                  <ArchiveEntry key={day.date} day={day} expanded={expandedDate === day.date} onToggle={() => setExpandedDate((current) => current === day.date ? null : day.date)} />
                )) : <p className="journal-empty">Сохранённые записи появятся здесь.</p>}
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
