"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  setupMfaAction,
  confirmMfaAction,
} from "@/app/admin/security/setup/actions";
export function MfaSetup() {
  const t = useTranslations("security");
  const [value, setValue] = useState<{ secret: string; qr: string } | null>(
    null,
  );
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <section className="card mx-auto my-8 grid max-w-lg gap-5">
      <h1>{t("setup")}</h1>
      <p>{t("setupHint")}</p>
      {error && <p role="alert">{t("denied")}</p>}
      {codes.length ? (
        <>
          <p>{t("saveCodes")}</p>
          <pre
            className="overflow-auto rounded-token bg-background p-4"
            dir="ltr"
            data-testid="recovery-codes"
          >
            {codes.join("\n")}
          </pre>
          <Link className="button" href="/admin/login">
            {t("loginAgain")}
          </Link>
        </>
      ) : value ? (
        <>
          <Image
            src={value.qr}
            alt={t("qr")}
            width={260}
            height={260}
            unoptimized
          />
          <p>{t("manualKey")}</p>
          <code className="break-all" dir="ltr" data-testid="mfa-secret">
            {value.secret}
          </code>
          <form
            className="grid gap-4"
            action={async (form) => {
              setBusy(true);
              setError(false);
              try {
                const r = await confirmMfaAction(form);
                if (r.codes) {
                  setCodes(r.codes);
                  setValue(null);
                } else setError(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {t("otp")}
              <input
                className="input w-full"
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
              />
            </label>
            <button className="button" disabled={busy}>
              {t("enable")}
            </button>
          </form>
        </>
      ) : (
        <form
          className="grid gap-4"
          action={async (form) => {
            setBusy(true);
            setError(false);
            try {
              const r = await setupMfaAction(form);
              if ("secret" in r && r.secret && r.qr)
                setValue({ secret: r.secret, qr: r.qr });
              else setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("password")}
            <input
              className="input w-full"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button" disabled={busy}>
            {t("start")}
          </button>
        </form>
      )}
    </section>
  );
}
