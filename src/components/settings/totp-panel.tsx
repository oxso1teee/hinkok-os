"use client";

import { FormEvent, useEffect, useState } from "react";

type SetupState = "idle" | "loading" | "pending" | "error";
type PendingSetup = { secret: string; otpauthUri: string };

async function postJson(url: string, payload?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok && body.ok === true, body };
}

export function TotpSettingsPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState<PendingSetup | null>(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState<SetupState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/totp/setup", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then((body: { ok?: boolean; enabled?: boolean }) => {
        if (!cancelled && body.ok) setEnabled(body.enabled ?? false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function startSetup() {
    setState("loading");
    setMessage("");
    const { ok, body } = await postJson("/api/auth/totp/setup");
    if (ok && typeof body.secret === "string" && typeof body.otpauthUri === "string") {
      setPending({ secret: body.secret, otpauthUri: body.otpauthUri });
      setState("pending");
    } else {
      setState("error");
      setMessage("Не удалось начать настройку 2FA.");
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) return;
    setState("loading");
    const { ok } = await postJson("/api/auth/totp/enable", { code: code.trim() });
    if (ok) {
      setEnabled(true);
      setPending(null);
      setCode("");
      setState("idle");
      setMessage("Двухфакторная аутентификация включена.");
    } else {
      setState("pending");
      setMessage("Неверный код. Проверьте время на устройстве и попробуйте снова.");
    }
  }

  async function disable() {
    setState("loading");
    const { ok } = await postJson("/api/auth/totp/disable");
    if (ok) setEnabled(false);
    setState("idle");
    setMessage(ok ? "Двухфакторная аутентификация отключена." : "Не удалось отключить 2FA.");
  }

  return (
    <section className="settings-panel settings-totp">
      <header>
        <div><span>07</span><span>/ /</span><h2>two-factor auth</h2></div>
        <p>{enabled === null ? "…" : enabled ? "enabled" : "disabled"}</p>
      </header>
      <div className="settings-totp-body">
        {enabled === null ? null : enabled ? (
          <>
            <p>Вход требует пароль и 6-значный код из приложения-аутентификатора.</p>
            <button
              className="secondary-button"
              type="button"
              onClick={disable}
              disabled={state === "loading"}
            >
              Отключить 2FA
            </button>
          </>
        ) : pending ? (
          <form onSubmit={confirmSetup} className="settings-totp-confirm">
            <p>
              Добавьте секрет в приложение-аутентификатор (Google Authenticator, Authy, 1Password…)
              вручную — введите строку ниже как «time-based key», или используйте ссылку.
            </p>
            <p className="settings-totp-secret">{pending.secret}</p>
            <p><a href={pending.otpauthUri}>{pending.otpauthUri}</a></p>
            <label>
              <span>Код из приложения</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                autoFocus
              />
            </label>
            <button className="primary-button" type="submit" disabled={state === "loading" || code.length === 0}>
              Подтвердить и включить
            </button>
          </form>
        ) : (
          <>
            <p>Пароль сам по себе — единственная защита входа. Добавьте второй фактор.</p>
            <button className="primary-button" type="button" onClick={startSetup} disabled={state === "loading"}>
              Настроить 2FA
            </button>
          </>
        )}
        {message ? <p className="settings-totp-message">{message}</p> : null}
      </div>
    </section>
  );
}
