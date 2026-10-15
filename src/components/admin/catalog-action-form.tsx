"use client";
import {
  MediaPickerPendingContext,
  useMediaPickerPending,
} from "./media-picker-pending";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui";
import { useTranslations } from "next-intl";
import { useUnsavedForm } from "./unsaved-form";

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
  const navigation = useTranslations("adminShell");
  const formRef = useUnsavedForm(state, navigation("unsavedChanges"));
  const { uploadsPending, reportPending } = useMediaPickerPending();
  return (
    <MediaPickerPendingContext.Provider value={reportPending}>
      <form
        ref={formRef}
        action={formAction}
        className={className}
        onSubmit={(event) => {
          if (uploadsPending) event.preventDefault();
        }}
      >
        {children}
        {state && (
          <p role="status" className={state.ok ? "text-success" : "text-error"}>
            {state.ok ? t("saved") : state.message}
          </p>
        )}
        <Button type="submit" disabled={pending || uploadsPending}>
          {pending ? t("saving") : (submitLabel ?? t("save"))}
        </Button>
      </form>
    </MediaPickerPendingContext.Provider>
  );
}
