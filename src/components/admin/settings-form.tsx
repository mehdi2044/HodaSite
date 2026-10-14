"use client";
import {
  MediaPickerPendingContext,
  useMediaPickerPending,
} from "./media-picker-pending";
import { useTranslations } from "next-intl";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { useUnsavedForm } from "./unsaved-form";

export function SettingsForm({
  action,
  children,
  submitLabel,
  className,
  disabled = false,
}: {
  action: (
    prevState: ActionResult | null,
    data: FormData,
  ) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const legacy = useTranslations("foundationAdmin");

  const [state, formAction, pending] = useActionState(action, null);
  const navigation = useTranslations("adminShell");
  const formRef = useUnsavedForm(state, navigation("unsavedChanges"));
  const { uploadsPending, reportPending } = useMediaPickerPending();
  return (
    <MediaPickerPendingContext.Provider value={reportPending}>
      <form
        ref={formRef}
        action={formAction}
        className={className ?? "grid gap-4"}
        onSubmit={(event) => {
          if (uploadsPending || disabled) event.preventDefault();
        }}
      >
        <fieldset disabled={pending || disabled} className="contents">
          {children}
        </fieldset>
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
        <Button type="submit" disabled={pending || uploadsPending || disabled}>
          {pending ? legacy("saving") : submitLabel}
        </Button>
      </form>
    </MediaPickerPendingContext.Provider>
  );
}
