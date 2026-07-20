"use client";

import { useEffect, useState } from "react";

type SessionRow = {
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
};

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function fetchSessions(): Promise<SessionRow[] | null> {
  const response = await fetch("/api/auth/sessions", { credentials: "same-origin", cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; sessions?: SessionRow[] };
  return body.ok && body.sessions ? body.sessions : null;
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchSessions()
      .then((result) => {
        if (!cancelled && result) setSessions(result);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  async function revokeOthers() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/sessions/revoke-others", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; revokedCount?: number };
    if (body.ok) {
      setMessage(
        body.revokedCount ? `Завершено сессий: ${body.revokedCount}.` : "Других активных сессий не найдено.",
      );
      const refreshed = await fetchSessions();
      if (refreshed) setSessions(refreshed);
    } else {
      setMessage("Не удалось завершить остальные сессии.");
    }
    setBusy(false);
  }

  return (
    <section className="settings-panel settings-sessions">
      <header>
        <div><span>08</span><span>/ /</span><h2>active sessions</h2></div>
        <button
          className="secondary-button"
          type="button"
          onClick={revokeOthers}
          disabled={busy || !sessions || sessions.length <= 1}
        >
          Завершить все остальные
        </button>
      </header>
      <div className="settings-sessions-body">
        {sessions === null ? null : sessions.length === 0 ? (
          <p>Нет активных сессий.</p>
        ) : (
          sessions.map((session) => (
            <div className="settings-session-row" key={session.sessionId}>
              <span className="settings-session-ip">{session.ip ?? "неизвестный IP"}</span>
              <span className="settings-session-agent">{session.userAgent ?? "неизвестное устройство"}</span>
              <span>вход {formatWhen(session.createdAt)} · активна {formatWhen(session.lastSeenAt)}</span>
              {session.isCurrent ? <span className="settings-session-current">это устройство</span> : null}
            </div>
          ))
        )}
        {message ? <p className="settings-totp-message">{message}</p> : null}
      </div>
    </section>
  );
}
