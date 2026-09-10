"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  requestOtpAction,
  verifyOtpAction,
} from "@/app/[locale]/commerce-actions";
import { CommerceForm } from "./commerce-form";
export function CustomerLogin({ locale }: { locale: string }) {
  const next = useSearchParams().get("next") ?? "";
  const [challenge, setChallenge] = useState(""),
    [token, setToken] = useState(""),
    t = useTranslations("commerce");
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get("challenge") && p.get("token")) {
      setChallenge(p.get("challenge")!);
      setToken(p.get("token")!);
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, []);
  return challenge ? (
    <CommerceForm action={verifyOtpAction.bind(null, locale)}>
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
            className="input mt-2 w-full"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
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
        {t("resend")}
      </button>
    </CommerceForm>
  ) : (
    <CommerceForm
      action={async (form) => {
        const result = await requestOtpAction(locale, form);
        if (result.challengeId) setChallenge(result.challengeId);
        return result;
      }}
    >
      <p className="text-muted">{t("loginIntro")}</p>
      <label>
        {t("email")}
        <input
          className="input mt-2 w-full"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <button className="button">{t("sendCode")}</button>
    </CommerceForm>
  );
}
