"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { BACKUP_TABLES, type BackupTableName } from "@/lib/backups/config";

type BackupOverview = {
  dataStatus: "ready" | "unavailable";
  counts: Record<BackupTableName, number>;
  totalRows: number;
};

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

function downloadFilename(response: Response): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([A-Za-z0-9_.-]+)"/)?.[1];
  return filename ?? `hinkok-os-${new Date().toISOString().replace(/[:.]/g, "-")}.hinkok-backup`;
}

export function BackupDashboard({ overview }: { overview: BackupOverview }) {
  const [clock, setClock] = useState(() => new Date());
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<"idle" | "working" | "saved" | "error" | "limited">("idle");

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function createBackup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state === "working" || passphrase.length < 16 || passphrase !== confirmation) return;
    setState("working");
    try {
      const response = await fetch("/api/backups/export", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase, confirmation }),
      });
      if (!response.ok) {
        setState(response.status === 429 ? "limited" : "error");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadFilename(response);
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setPassphrase("");
      setConfirmation("");
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const matches = passphrase.length >= 16 && passphrase === confirmation;

  return (
    <div className="dashboard-page backup-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-dot" /><strong>HinkoK·OS</strong><span>/ v0.1</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link href="/">HOME</Link><Link href="/crm">CRM</Link><Link href="/brain">BRAIN</Link><Link href="/journal">JOURNAL</Link><Link href="/health">HEALTH</Link><Link href="/operations">STATUS</Link><Link href="/settings">SETTINGS</Link><Link className="active" href="/backup">BACKUP</Link>
        </nav>
        <div className="topbar-stats"><span>ENCRYPTED EXPORT</span><time dateTime={clock.toISOString()}>{formatClock(clock)}</time></div>
      </header>

      {overview.dataStatus === "unavailable" ? <div className="system-notice" role="alert">Не удалось проверить все таблицы. Создавайте backup только после восстановления Supabase.</div> : null}

      <main className="backup-main">
        <section className="backup-hero">
          <div><span>01 / / data protection</span><h1>your data, <em>portable.</em></h1><p>Полный снимок шифруется до загрузки файла. Пароль не сохраняется в БД, cookie, localStorage или audit log.</p></div>
          <aside><strong>{overview.totalRows}</strong><span>protected rows</span><strong>{BACKUP_TABLES.length}</strong><span>canonical tables</span></aside>
        </section>

        <section className="backup-grid">
          <section className="backup-panel backup-create">
            <header><div><span>02</span><span>/ /</span><h2>create backup</h2></div><p>AES-256-GCM · scrypt</p></header>
            <form onSubmit={createBackup}>
              <p>Используйте уникальную парольную фразу минимум из 16 символов. Без неё восстановить файл невозможно.</p>
              <label><span>Парольная фраза</span><input type="password" autoComplete="new-password" minLength={16} maxLength={1024} required value={passphrase} onChange={(event) => { setPassphrase(event.target.value); setState("idle"); }} /></label>
              <label><span>Повторите фразу</span><input type="password" autoComplete="new-password" minLength={16} maxLength={1024} required value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setState("idle"); }} /></label>
              <div className={`backup-state ${state}`} role="status">{state === "working" ? "Собираю и шифрую снимок…" : state === "saved" ? "Зашифрованный файл загружен." : state === "limited" ? "Достигнут лимит: не более двух экспортов в час." : state === "error" ? "Веб-экспорт не выполнен. Для большой базы используйте backup:create локально." : matches ? "Фразы совпадают. Можно создать backup." : "Фразы должны совпадать и содержать минимум 16 символов."}</div>
              <button className="primary-button" type="submit" disabled={!matches || state === "working" || overview.dataStatus !== "ready"}>{state === "working" ? "ENCRYPTING…" : "CREATE ENCRYPTED BACKUP"}</button>
            </form>
          </section>

          <section className="backup-panel backup-contents">
            <header><div><span>03</span><span>/ /</span><h2>snapshot contents</h2></div><p>USER_ID scoped</p></header>
            <div>{BACKUP_TABLES.map((table, index) => <article key={table.name}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{table.label}</strong><small>{table.name}</small></div><b>{overview.counts[table.name]}</b></article>)}</div>
          </section>
        </section>

        <section className="backup-panel backup-recovery">
          <header><div><span>04</span><span>/ /</span><h2>verified recovery</h2></div><p>dry-run first · explicit apply</p></header>
          <div>
            <p>Восстановление выполняется локальной CLI-командой. Обычный запуск только расшифровывает файл, проверяет GCM, SHA-256, структуру и совпадение USER_ID — база не меняется.</p>
            <ol><li><code>read -rs HINKOK_BACKUP_PASSPHRASE &amp;&amp; export HINKOK_BACKUP_PASSPHRASE</code></li><li><code>npm run backup:verify -- file.hinkok-backup</code></li><li><code>npm run backup:restore -- file.hinkok-backup</code></li><li><code>export HINKOK_RESTORE_CONFIRM=RESTORE &amp;&amp; npm run backup:restore -- file.hinkok-backup --apply</code></li></ol>
          </div>
        </section>
      </main>
    </div>
  );
}
