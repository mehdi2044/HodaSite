"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";

export function ActionSubmit({
  action,
  fields,
  label,
  variant = "secondary",
}: {
  action: (
    previous: ActionResult | null,
    data: FormData,
  ) => Promise<ActionResult>;
  fields: Record<string, string>;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="grid gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button variant={variant} disabled={pending}>
        {label}
      </Button>
      {state && !state.ok && (
        <span role="alert" className="text-sm text-error">
          {state.message}
        </span>
      )}
    </form>
  );
}
