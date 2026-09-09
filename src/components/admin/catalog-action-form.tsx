"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui";

export function CatalogActionForm({
  action,
  children,
  submitLabel = "ذخیره",
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
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && (
        <p role="status" className={state.ok ? "text-success" : "text-error"}>
          {state.ok ? "با موفقیت ذخیره شد." : state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "در حال ذخیره…" : submitLabel}
      </Button>
    </form>
  );
}
