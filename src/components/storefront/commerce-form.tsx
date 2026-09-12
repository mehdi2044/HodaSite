"use client";
import { useOnline } from "@/components/pwa/online";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { useTranslations } from "next-intl";
export type CommerceResult = {
  error?: string;
  url?: string;
  ok?: boolean;
  partial?: { succeeded: number; failed: number };
};
export function CommerceForm({
  action,
  children,
  className = "grid gap-4",
  navigation = "client",
}: {
  action: (form: FormData) => Promise<CommerceResult>;
  children: React.ReactNode;
  className?: string;
  navigation?: "client" | "document";
}) {
  const online = useOnline(),
    pwa = useTranslations("pwa");
  const [state, submit, pending] = useActionState(
      async (_: CommerceResult, form: FormData) => {
        if (!navigator.onLine) return { error: "OFFLINE" };
        try {
          return await action(form);
        } catch (error) {
          if (isRedirectError(error)) throw error;
          return { error: "REQUEST_FAILED" };
        }
      },
      {},
    ),
    router = useRouter(),
    t = useTranslations("commerce");
  useEffect(() => {
    if (state.url) {
      if (navigation === "document") window.location.assign(state.url);
      else router.push(state.url);
    } else if (state.ok) router.refresh();
  }, [state, router, navigation]);
  return (
    <form action={submit} className={className}>
      <fieldset disabled={pending || !online} className="contents">
        {children}
      </fieldset>
      {!online && <p role="status">{pwa("onlineRequired")}</p>}
      {pending && <p role="status">{t("working")}</p>}
      {state.partial && <p role="status">{t("bulkResult", state.partial)}</p>}
      {state.error && (
        <p role="alert" className="text-error">
          {t.has(`errors.${state.error}`)
            ? t(`errors.${state.error}`)
            : t("errors.REQUEST_FAILED")}
        </p>
      )}
      {state.ok && !state.url && (
        <p role="status" className="text-success">
          {t("saved")}
        </p>
      )}
    </form>
  );
}
