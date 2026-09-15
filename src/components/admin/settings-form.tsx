"use client";
import { useTranslations } from "next-intl";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";

export function SettingsForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (
    prevState: ActionResult | null,
    data: FormData,
  ) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const legacy = useTranslations("foundationAdmin");

  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "grid gap-4"}>
      {children}
      {state && !state.ok && (
        <p
          role="alert"
          className="text-error"
          style={{ color: "var(--error)" }}
        >
          {state.message}
        </p>
      )}
      {state?.ok && (
        <p role="status" style={{ color: "var(--success)" }}>
          {" "}
          {legacy("saved")}{" "}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? legacy("saving") : submitLabel}
      </Button>
    </form>
  );
}
