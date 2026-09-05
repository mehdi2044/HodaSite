"use client";
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
          ذخیره شد.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "در حال ذخیره…" : submitLabel}
      </Button>
    </form>
  );
}
