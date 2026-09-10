"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
export type CommerceResult = { error?: string; url?: string; ok?: boolean };
export function CommerceForm({
  action,
  children,
  className = "grid gap-4",
}: {
  action: (form: FormData) => Promise<CommerceResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, submit, pending] = useActionState(
      async (_: CommerceResult, form: FormData) => action(form),
      {},
    ),
    router = useRouter(),
    t = useTranslations("commerce");
  useEffect(() => {
    if (state.url) router.push(state.url);
    else if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={submit} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending && <p role="status">{t("working")}</p>}
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
