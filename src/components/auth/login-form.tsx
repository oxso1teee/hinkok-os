"use client";

import { FormEvent, useState } from "react";

type LoginFormProps = {
  nextPath: string;
};

type LoginErrorCode =
  | "invalid_credentials"
  | "rate_limited"
  | "invalid_request"
  | "unavailable";

type LoginResponse =
  | { ok: true; next: string }
  | { ok: true; totpRequired: true; pendingToken: string }
  | { ok: false; error: LoginErrorCode };

type TotpErrorCode = "invalid_code" | "rate_limited" | "invalid_request" | "unavailable";

type TotpResponse =
  | { ok: true; next: string }
  | { ok: false; error: TotpErrorCode };

function errorMessage(error: LoginErrorCode | TotpErrorCode): string {
  switch (error) {
    case "rate_limited":
      return "Слишком много попыток. Вход временно заблокирован на 15 минут.";
    case "unavailable":
      return "Сервис входа временно недоступен. Повтори попытку позже.";
    case "invalid_request":
      return "Запрос отклонён системой безопасности. Обнови страницу.";
    case "invalid_code":
      return "Неверный код.";
    default:
      return "Неверный пароль.";
  }
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || password.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
          next: nextPath,
        }),
      });

      const result = (await response.json()) as LoginResponse;

      if (!response.ok || !result.ok) {
        setPassword("");
        setError(errorMessage(result.ok ? "unavailable" : result.error));
        return;
      }

      if ("totpRequired" in result) {
        setPendingToken(result.pendingToken);
        return;
      }

      window.location.assign(result.next);
    } catch {
      setError("Не удалось связаться с сервером. Проверь соединение.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || code.length === 0 || !pendingToken) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/totp/verify", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pendingToken, code, next: nextPath }),
      });

      const result = (await response.json()) as TotpResponse;

      if (!response.ok || !result.ok) {
        setCode("");
        setError(errorMessage(result.ok ? "unavailable" : result.error));
        return;
      }

      window.location.assign(result.next);
    } catch {
      setError("Не удалось связаться с сервером. Проверь соединение.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (pendingToken) {
    return (
      <form className="login-form" onSubmit={handleCodeSubmit} noValidate>
        <div className="login-field">
          <label htmlFor="totp-code">Код из приложения-аутентификатора</label>
          <input
            id="totp-code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
            maxLength={6}
            required
            autoFocus
            disabled={isSubmitting}
            aria-invalid={error !== null}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>

        {error ? (
          <p id="login-error" className="login-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || code.length === 0}
        >
          {isSubmitting ? "Проверка…" : "Подтвердить"}
        </button>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={handlePasswordSubmit} noValidate>
      <div className="login-field">
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          minLength={12}
          maxLength={256}
          required
          autoFocus
          disabled={isSubmitting}
          aria-invalid={error !== null}
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>

      {error ? (
        <p id="login-error" className="login-error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="primary-button"
        type="submit"
        disabled={isSubmitting || password.length === 0}
      >
        {isSubmitting ? "Проверка…" : "Войти"}
      </button>
    </form>
  );
}
