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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    setShowPassword(false);
    try {
      const res = await signIn("credentials", {
        email: String(data.get("email") ?? "").trim(),
        password: String(data.get("password") ?? ""),
        token: String(data.get("token") ?? "").trim(),
        redirect: false,
      });
      if (!res || res.error) {
        setError(t("loginError"));
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(t("loginConnectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid admin-login-form" onSubmit={onSubmit}>
      <label>
        {t("email")}
        <input
          className="input"
          type="email"
          name="email"
          dir="ltr"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </label>
      <div className="grid gap-2">
        <label htmlFor="admin-password">{t("password")}</label>
        <div className="admin-password-field">
          <input
            id="admin-password"
            className="input"
            type={showPassword ? "text" : "password"}
            name="password"
            dir="ltr"
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={8}
            maxLength={256}
          />
          <button
            className="admin-password-toggle"
            type="button"
            aria-controls="admin-password"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? t("hidePassword") : t("showPassword")}
          </button>
        </div>
      </div>
      <label>
        {t("token")}
        <input
          className="input"
          name="token"
          dir="ltr"
          aria-describedby="admin-token-help"
          autoComplete="one-time-code"
          maxLength={64}
        />
      </label>
      <p id="admin-token-help" className="muted">
        {t("tokenHint")}
      </p>
      <details className="admin-login-help">
        <summary>{t("loginHelpTitle")}</summary>
        <p>{t("loginHelp")}</p>
      </details>
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
