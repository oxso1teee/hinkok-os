"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { TopbarTicker } from "@/components/ui/topbar-ticker";
import { TotpSettingsPanel } from "@/components/settings/totp-panel";
import { BRAIN_SPHERES, type BrainSphere } from "@/lib/brain/config";
import {
  DEFAULT_PERSONAL_SETTINGS,
  normalizeFolderName,
  type PersonalSettings,
} from "@/lib/settings/normalize";

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function newHabitId(existing: readonly { id: string }[]): string {
  const occupied = new Set(existing.map((habit) => habit.id));
  let index = existing.length + 1;
  while (occupied.has(`habit_${index}`)) index += 1;
  return `habit_${index}`;
}

export function SettingsDashboard({
  initialSettings,
  dataStatus,
}: {
  initialSettings: PersonalSettings;
  dataStatus: "ready" | "unavailable";
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(() => structuredClone(initialSettings));
  const [clock, setClock] = useState(() => new Date());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [folderName, setFolderName] = useState("");
  const [folderSphere, setFolderSphere] = useState<BrainSphere>("personal");
  const [telegramState, setTelegramState] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [googleState, setGoogleState] = useState<
    "loading" | "not_configured" | "disconnected" | "connected" | "working" | "error"
  >("loading");
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/integrations/google/status", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = await response.json() as {
          configured?: boolean;
          connected?: boolean;
          connection?: { connected_email?: string | null } | null;
        };
        if (!response.ok) throw new Error("status_failed");
        if (cancelled) return;
        setGoogleEmail(payload.connection?.connected_email ?? null);
        setGoogleState(!payload.configured ? "not_configured" : payload.connected ? "connected" : "disconnected");
        const callback = new URL(window.location.href).searchParams.get("google");
        if (callback === "connected") setGoogleNotice("Google подключён. Теперь можно запустить синхронизацию календаря.");
        if (callback === "failed") setGoogleNotice("Google не подключён: callback отклонён или завершился ошибкой.");
        if (callback === "cancelled") setGoogleNotice("Подключение Google отменено.");
      } catch {
        if (!cancelled) setGoogleState("error");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  function updateHabit(index: number, patch: Partial<PersonalSettings["habits"][number]>) {
    setSettings((current) => ({
      ...current,
      habits: current.habits.map((habit, itemIndex) =>
        itemIndex === index ? { ...habit, ...patch } : habit,
      ),
    }));
    setSaveState("idle");
  }

  function addHabit(): void {
    setSettings((current) => {
      if (current.habits.length >= 12) return current;
      return {
        ...current,
        habits: [
          ...current.habits,
          { id: newHabitId(current.habits), label: "Новая привычка", eyebrow: "daily", target: 1 },
        ],
      };
    });
    setSaveState("idle");
  }

  function removeHabit(index: number): void {
    setSettings((current) => current.habits.length <= 1
      ? current
      : { ...current, habits: current.habits.filter((_, itemIndex) => itemIndex !== index) });
    setSaveState("idle");
  }

  function addFolderMapping(): void {
    const folder = normalizeFolderName(folderName);
    if (!folder || folder.includes("/") || folder.includes("\\") || folder === "." || folder === "..") return;
    setSettings((current) => ({
      ...current,
      obsidianFolderMapping: {
        ...current.obsidianFolderMapping,
        [folder]: folderSphere,
      },
    }));
    setFolderName("");
    setSaveState("idle");
  }

  function removeFolderMapping(folder: string): void {
    setSettings((current) => {
      const mapping = { ...current.obsidianFolderMapping };
      delete mapping[folder];
      return { ...current, obsidianFolderMapping: mapping };
    });
    setSaveState("idle");
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saveState === "saving") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error("save_failed");
      setSaveState("saved");
      router.refresh();
    } catch {
      setSaveState("error");
    }
  }

  function restoreDefaults(): void {
    setSettings(structuredClone(DEFAULT_PERSONAL_SETTINGS));
    setSaveState("idle");
  }

  async function connectTelegram(): Promise<void> {
    if (telegramState === "connecting") return;
    setTelegramState("connecting");

    try {
      const response = await fetch("/api/telegram/setup", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result: unknown = await response.json().catch(() => null);

      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("ok" in result) ||
        result.ok !== true
      ) {
        throw new Error("telegram_setup_failed");
      }

      setTelegramState("connected");
    } catch {
      setTelegramState("error");
    }
  }

  function connectGoogle(): void {
    if (googleState !== "disconnected") return;
    window.location.assign("/api/integrations/google/connect");
  }

  async function disconnectGoogle(): Promise<void> {
    if (googleState !== "connected") return;
    setGoogleState("working");
    setGoogleNotice(null);
    try {
      const response = await fetch("/api/integrations/google/disconnect", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("disconnect_failed");
      setGoogleEmail(null);
      setGoogleState("disconnected");
      setGoogleNotice("Google отключён, сохранённые события остались в локальной истории.");
    } catch {
      setGoogleState("error");
      setGoogleNotice("Не удалось отключить Google.");
    }
  }

  async function syncGoogleCalendar(): Promise<void> {
    if (googleState !== "connected") return;
    setGoogleState("working");
    setGoogleNotice(null);
    try {
      const response = await fetch("/api/cron/sync-calendar", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json() as { upserted?: number; deleted?: number; skipped?: string };
      if (!response.ok) throw new Error("sync_failed");
      setGoogleState("connected");
      setGoogleNotice(payload.skipped
        ? "Синхронизация уже выполнялась недавно."
        : `Календарь синхронизирован: ${payload.upserted ?? 0} обновлено, ${payload.deleted ?? 0} удалено.`);
      router.refresh();
    } catch {
      setGoogleState("connected");
      setGoogleNotice("Синхронизация Calendar не удалась. Подробности сохранены в STATUS.");
    }
  }

  return (
    <div className="dashboard-page settings-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-dot" /><strong>HinkoK·OS</strong><span>/ v0.1</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link href="/">HOME</Link>
          <Link href="/crm">CRM</Link>
          <Link href="/brain">BRAIN</Link>
          <Link href="/journal">JOURNAL</Link>
          <Link href="/health">HEALTH</Link>
          <Link href="/operations">STATUS</Link>
          <Link className="active" href="/settings">SETTINGS</Link>
          <Link href="/backup">BACKUP</Link>
        </nav>
        <div className="topbar-stats"><TopbarTicker /><span>PERSONAL CONFIG</span><time dateTime={clock.toISOString()}>{formatClock(clock)}</time></div>
      </header>

      {dataStatus === "unavailable" ? (
        <div className="system-notice" role="alert">Показаны безопасные дефолты. Проверьте Supabase и миграцию 013 перед сохранением.</div>
      ) : null}

      <main className="settings-main">
        <section className="settings-hero">
          <div><span>01 / / configuration</span><h1>make it <em>yours.</em></h1><p>Персональные параметры хранятся только в закрытой Supabase-таблице и применяются на сервере.</p></div>
          <aside><strong>{settings.habits.length}</strong><span>habits</span><strong>{Object.keys(settings.obsidianFolderMapping).length}</strong><span>folder rules</span></aside>
        </section>

        <form className="settings-form" onSubmit={save}>
          <section className="settings-panel settings-identity">
            <header><div><span>02</span><span>/ /</span><h2>operator</h2></div><p>identity · focus</p></header>
            <div className="settings-fields two-columns">
              <label><span>Отображаемое имя</span><input value={settings.displayName} maxLength={60} required onChange={(event) => { setSettings({ ...settings, displayName: event.target.value }); setSaveState("idle"); }} /></label>
              <label><span>Текущий фокус</span><input value={settings.focusStatement} maxLength={120} required onChange={(event) => { setSettings({ ...settings, focusStatement: event.target.value }); setSaveState("idle"); }} /></label>
            </div>
          </section>

          <section className="settings-panel">
            <header><div><span>03</span><span>/ /</span><h2>daily protocol</h2></div><button type="button" onClick={addHabit} disabled={settings.habits.length >= 12}>+ ADD HABIT</button></header>
            <div className="settings-habits">
              {settings.habits.map((habit, index) => (
                <article key={habit.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <label><small>Название</small><input value={habit.label} maxLength={40} required onChange={(event) => updateHabit(index, { label: event.target.value })} /></label>
                  <label><small>Метка</small><input value={habit.eyebrow} maxLength={24} required onChange={(event) => updateHabit(index, { eyebrow: event.target.value })} /></label>
                  <label><small>Цель</small><input type="number" min={1} max={10} value={habit.target} onChange={(event) => updateHabit(index, { target: Number(event.target.value) })} /></label>
                  <button type="button" aria-label={`Удалить ${habit.label}`} disabled={settings.habits.length <= 1} onClick={() => removeHabit(index)}>×</button>
                </article>
              ))}
            </div>
          </section>

          <section className="settings-panel">
            <header><div><span>04</span><span>/ /</span><h2>nutrition targets</h2></div><p>daily · bounded</p></header>
            <div className="settings-fields nutrition-columns">
              {([ ["kcal", "Калории", 500, 10000], ["protein", "Белок, г", 0, 1000], ["carbs", "Углеводы, г", 0, 1000], ["fat", "Жиры, г", 0, 1000] ] as const).map(([key, label, min, max]) => (
                <label key={key}><span>{label}</span><input type="number" min={min} max={max} value={settings.nutritionTargets[key]} onChange={(event) => { setSettings({ ...settings, nutritionTargets: { ...settings.nutritionTargets, [key]: Number(event.target.value) } }); setSaveState("idle"); }} /></label>
              ))}
            </div>
          </section>

          <section className="settings-panel">
            <header><div><span>05</span><span>/ /</span><h2>life spheres</h2></div><p>fixed ids · custom meaning</p></header>
            <div className="settings-spheres">
              {BRAIN_SPHERES.map((sphere, index) => (
                <article key={sphere}>
                  <span>{String(index + 1).padStart(2, "0")} · {sphere}</span>
                  <input value={settings.sphereInfo[sphere].label} maxLength={32} required aria-label={`Название сферы ${sphere}`} onChange={(event) => { setSettings({ ...settings, sphereInfo: { ...settings.sphereInfo, [sphere]: { ...settings.sphereInfo[sphere], label: event.target.value } } }); setSaveState("idle"); }} />
                  <textarea value={settings.sphereInfo[sphere].description} maxLength={180} required aria-label={`Описание сферы ${sphere}`} onChange={(event) => { setSettings({ ...settings, sphereInfo: { ...settings.sphereInfo, [sphere]: { ...settings.sphereInfo[sphere], description: event.target.value } } }); setSaveState("idle"); }} />
                </article>
              ))}
            </div>
          </section>

          <section className="settings-panel">
            <header><div><span>06</span><span>/ /</span><h2>obsidian mapping</h2></div><p>folder segment → sphere</p></header>
            <div className="settings-folder-add">
              <input value={folderName} maxLength={80} placeholder="Название папки" aria-label="Название Obsidian-папки" onChange={(event) => setFolderName(event.target.value)} />
              <select value={folderSphere} aria-label="Сфера Obsidian-папки" onChange={(event) => setFolderSphere(event.target.value as BrainSphere)}>{BRAIN_SPHERES.map((sphere) => <option value={sphere} key={sphere}>{settings.sphereInfo[sphere].label}</option>)}</select>
              <button type="button" onClick={addFolderMapping} disabled={!folderName.trim() || Object.keys(settings.obsidianFolderMapping).length >= 100}>ADD RULE</button>
            </div>
            <div className="settings-folder-list">
              {Object.entries(settings.obsidianFolderMapping).sort(([left], [right]) => left.localeCompare(right, "ru")).map(([folder, sphere]) => (
                <div key={folder}><strong>{folder}</strong><span>→</span><em>{settings.sphereInfo[sphere].label}</em><button type="button" onClick={() => removeFolderMapping(folder)} aria-label={`Удалить правило ${folder}`}>×</button></div>
              ))}
            </div>
          </section>

          <section className="settings-panel">
            <header><div><span>07</span><span>/ /</span><h2>google workspace</h2></div><p>calendar · sheets · oauth</p></header>
            <div className="settings-integration">
              <div>
                <strong>{googleState === "connected" || googleState === "working" ? "CONNECTED" : googleState === "not_configured" ? "NOT CONFIGURED" : googleState === "loading" ? "CHECKING" : "DISCONNECTED"}</strong>
                <p>{googleEmail ?? "Подключение выполняется через защищённый OAuth 2.0 PKCE без передачи пароля HinkoK OS."}</p>
              </div>
              <div className="settings-integration-actions">
                {googleState === "disconnected" ? <button type="button" onClick={connectGoogle}>CONNECT GOOGLE</button> : null}
                {googleState === "connected" ? <button type="button" onClick={syncGoogleCalendar}>SYNC CALENDAR</button> : null}
                {googleState === "connected" ? <button className="danger" type="button" onClick={disconnectGoogle}>DISCONNECT</button> : null}
                {googleState === "working" ? <button type="button" disabled>WORKING…</button> : null}
              </div>
            </div>
            {googleState === "not_configured" ? <p className="settings-integration-notice">Сначала добавьте Google OAuth-переменные в Vercel.</p> : null}
            {googleState === "error" ? <p className="settings-integration-notice error">Статус Google недоступен. Проверьте конфигурацию и миграции.</p> : null}
            {googleNotice ? <p className="settings-integration-notice" role="status">{googleNotice}</p> : null}
          </section>

          <section className="settings-panel">
            <header><div><span>08</span><span>/ /</span><h2>telegram intake</h2></div><p>text · voice · photo</p></header>
            <div className="settings-folder-add">
              <p>
                Подключает @HinkoKOSBot_bot к защищённому webhook HinkoK OS.
                Токены остаются только на сервере.
              </p>
              <button
                type="button"
                onClick={connectTelegram}
                disabled={telegramState === "connecting"}
              >
                {telegramState === "connecting"
                  ? "CONNECTING…"
                  : telegramState === "connected"
                    ? "CONNECTED"
                    : "CONNECT TELEGRAM"}
              </button>
            </div>
            {telegramState === "connected" ? (
              <p className="saved">Telegram подключён. Отправьте боту тестовое сообщение.</p>
            ) : telegramState === "error" ? (
              <p className="error">Не удалось подключить Telegram. Проверьте переменные Vercel.</p>
            ) : null}
          </section>

          <footer className="settings-actions">
            <button className="secondary-button" type="button" onClick={restoreDefaults}>RESTORE DEFAULTS</button>
            <p className={saveState}>{saveState === "saved" ? "Настройки сохранены." : saveState === "error" ? "Не удалось сохранить. Проверьте значения и соединение." : "Изменения применятся после сохранения."}</p>
            <button className="primary-button" type="submit" disabled={saveState === "saving"}>{saveState === "saving" ? "SAVING…" : "SAVE SETTINGS"}</button>
          </footer>
        </form>

        <TotpSettingsPanel />
      </main>
    </div>
  );
}
