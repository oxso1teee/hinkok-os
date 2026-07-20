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
  | {
      ok: true;
      next: string;
    }
  | {
      ok: false;
      error: LoginErrorCode;
    };

function errorMessage(error: LoginErrorCode): string {
  switch (error) {
    case "rate_limited":
      return "Слишком много попыток. Вход временно заблокирован на 15 минут.";
    case "unavailable":
      return "Сервис входа временно недоступен. Повтори попытку позже.";
    case "invalid_request":
      return "Запрос отклонён системой безопасности. Обнови страницу.";
    default:
      return "Неверный пароль.";
  }
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

      window.location.assign(result.next);
    } catch {
      setError("Не удалось связаться с сервером. Проверь соединение.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
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
