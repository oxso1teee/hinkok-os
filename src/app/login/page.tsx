import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { sanitizeNextPath } from "@/lib/auth/navigation";

export const metadata: Metadata = {
  title: "Вход",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requestedNext = Array.isArray(parameters.next)
    ? parameters.next[0]
    : parameters.next;
  const nextPath = sanitizeNextPath(requestedNext);

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true">
          H
        </div>
        <p className="status-label">HinkoK OS</p>
        <h1 id="login-title">Защищённый вход</h1>
        <p className="login-description">
          Персональные данные доступны только после проверки локального пароля.
        </p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
