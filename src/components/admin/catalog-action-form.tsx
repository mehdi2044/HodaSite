"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui";
import { useTranslations } from "next-intl";

export function CatalogActionForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (
    previous: ActionResult | null,
    data: FormData,
  ) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const t = useTranslations("catalogAdmin");
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && (
        <p role="status" className={state.ok ? "text-success" : "text-error"}>
          {state.ok ? t("saved") : state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : (submitLabel ?? t("save"))}
      </Button>
    </form>
  );
}
