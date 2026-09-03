"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
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
      redirect: false,
    });
    if (!res || res.error) {
      setLoading(false);
      setError("ایمیل یا رمز عبور نادرست است.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form className="grid" onSubmit={onSubmit}>
      <label>
        ایمیل
        <input className="input" type="email" name="email" required autoFocus />
      </label>
      <label>
        رمز عبور
        <input
          className="input"
          type="password"
          name="password"
          required
          minLength={8}
        />
      </label>
      {error ? (
        <p role="alert" style={{ color: "var(--error)", margin: 0 }}>
          {error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={loading}>
        {loading ? "در حال ورود…" : "ورود امن"}
      </button>
    </form>
  );
}

export default function Login() {
  return (
    <section className="card" style={{ maxWidth: 420, margin: "10vh auto" }}>
      <h1>ورود مدیر</h1>
      <Suspense fallback={<p className="muted">در حال بارگذاری…</p>}>
        <LoginForm />
      </Suspense>
    </section>
  );
}
