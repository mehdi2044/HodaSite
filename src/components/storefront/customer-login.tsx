"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  requestOtpAction,
  verifyOtpAction,
} from "@/app/[locale]/commerce-actions";
import { CommerceForm } from "./commerce-form";
import { AccountProgress } from "./account-progress";
export function CustomerLogin({ locale }: { locale: string }) {
  const next = useSearchParams().get("next") ?? "";
  const [challenge, setChallenge] = useState(""),
    [token, setToken] = useState(""),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [resendAt, setResendAt] = useState(0),
    [remaining, setRemaining] = useState(0),
    codeInput = useRef<HTMLInputElement>(null),
    t = useTranslations("commerce"),
    a = useTranslations("accountDesign");
  useEffect(() => {
    if (challenge && !token) codeInput.current?.focus();
  }, [challenge, token]);
  useEffect(() => {
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(() => {
      if (!document.hidden) update();
    }, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [resendAt]);
  useEffect(() => {
    const readLink = () => {
      const p = new URLSearchParams(location.hash.slice(1));
      if (p.get("challenge") && p.get("token")) {
        setChallenge(p.get("challenge")!);
        setToken(p.get("token")!);
        history.replaceState(null, "", location.pathname + location.search);
      }
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);
  const request = async (form: FormData) => {
    const result = await requestOtpAction(locale, form);
    if (result.challengeId) {
      setEmail(String(form.get("email") ?? ""));
      setChallenge(result.challengeId);
      setCode("");
      setResendAt(Date.now() + 60_000);
      setRemaining(60);
    }
    return result;
  };
  return (
    <div className="grid gap-5">
      <AccountProgress step={challenge ? 2 : 1} />
      {challenge ? (
        <>
          <CommerceForm
            navigation="document"
            action={verifyOtpAction.bind(null, locale)}
          >
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="challengeId" value={challenge} />
            {token ? (
              <>
                <input type="hidden" name="token" value={token} />
                <p>{t("magicConfirm")}</p>
              </>
            ) : (
              <label>
                {t("otp")}
                <input
                  ref={codeInput}
                  className="input mt-2 w-full"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/[۰-۹٠-٩]/g, (digit) =>
                          String(
                            digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632),
                          ),
                        )
                        .replace(/\D/g, "")
                        .slice(0, 6),
                    )
                  }
                  dir="ltr"
                  data-testid="otp-code"
                  required
                />
              </label>
            )}
            <button className="button">{t("login")}</button>
            <button
              type="button"
              className="underline"
              onClick={() => {
                setChallenge("");
                setToken("");
              }}
            >
              {a("changeEmail")}
            </button>
          </CommerceForm>
          {email && !token && (
            <CommerceForm action={request}>
              <input type="hidden" name="email" value={email} />
              <button
                className="button button-outline"
                disabled={remaining > 0}
              >
                {remaining > 0
                  ? a("resendIn", { seconds: remaining })
                  : t("resend")}
              </button>
            </CommerceForm>
          )}
        </>
      ) : (
        <CommerceForm action={request}>
          <p className="text-muted">{t("loginIntro")}</p>
          <label>
            {t("email")}
            <input
              className="input mt-2 w-full"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className="button">{t("sendCode")}</button>
        </CommerceForm>
      )}
    </div>
  );
}
