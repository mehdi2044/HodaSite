"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/action-result";
export function EngagementForm({
  action,
  children,
  refresh = true,
}: {
  action: (
    previous: ActionResult | null,
    form: FormData,
  ) => Promise<ActionResult>;
  children: React.ReactNode;
  refresh?: boolean;
}) {
  const t = useTranslations("engagement"),
    [state, submit, pending] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && refresh) router.refresh();
  }, [state, router, refresh]);
  return (
    <form action={submit} className="grid gap-3">
      <fieldset disabled={pending} className="grid gap-3">
        {children}
      </fieldset>
      {pending && <p role="status">{t("working")}</p>}
      {state && (
        <p role={state.ok ? "status" : "alert"}>
          {state.ok ? t("saved") : state.message}
        </p>
      )}
    </form>
  );
}
