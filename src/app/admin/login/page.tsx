"use client";

import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function LoginForm() {
  const t = useTranslations("security");
  const router = useRouter();
  const params = useSearchParams();
  const candidate = params.get("next") ?? "/admin";
  const next =
    /^\/admin(?:\/|$)/.test(candidate) && !/[\\\r\n]/.test(candidate)
      ? candidate
      : "/admin";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      token: String(data.get("token") ?? ""),
      redirect: false,
    });
    if (!res || res.error) {
      setLoading(false);
      setError(t("loginError"));
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form className="grid" onSubmit={onSubmit}>
      <label>
        {t("email")}
        <input className="input" type="email" name="email" required autoFocus />
      </label>
      <label>
        {t("password")}
        <input
          className="input"
          type="password"
          name="password"
          required
          minLength={8}
        />
      </label>
      <label>
        {t("token")}
        <input
          className="input"
          name="token"
          autoComplete="one-time-code"
          maxLength={64}
        />
      </label>
      <p className="muted">{t("tokenHint")}</p>
      {error ? (
        <p role="alert" style={{ color: "var(--error)", margin: 0 }}>
          {error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={loading}>
        {loading ? t("loading") : t("login")}
      </button>
    </form>
  );
}

export default function Login() {
  const t = useTranslations("security");
  return (
    <section className="card" style={{ maxWidth: 420, margin: "10vh auto" }}>
      <h1>{t("loginTitle")}</h1>
      <Suspense fallback={<p className="muted">{t("loading")}</p>}>
        <LoginForm />
      </Suspense>
    </section>
  );
}
