"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/action-result";
import { slots } from "@/modules/editorial/contracts";

export function WeeklyEditor({
  looks,
  action,
}: {
  looks: { id: string; slugEn: string }[];
  action: (
    previous: ActionResult | null,
    data: FormData,
  ) => Promise<ActionResult>;
}) {
  const [state, submit, pending] = useActionState(action, null);
  const t = useTranslations("editorial");
  return (
    <form action={submit} className="max-w-md grid gap-3">
      <label className="grid">
        {t("gallery")}
        <select className="input" name="id" required>
          <option value="">{t("choose")}</option>
          {looks.map((look) => (
            <option key={look.id} value={look.id}>
              {look.slugEn}
            </option>
          ))}
        </select>
      </label>
      <label className="grid">
        {t("slot")}
        <select className="input" name="slot">
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {t(`facet.${slot}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid">
        {t("from")}
        <input className="input" type="datetime-local" name="start" required />
      </label>
      <label className="grid">
        {t("until")}
        <input className="input" type="datetime-local" name="end" required />
      </label>
      <button className="button" disabled={pending}>
        {t("schedule")}
      </button>
      {state && (
        <p role={state.ok ? "status" : "alert"}>
          {state.ok ? t("saved") : state.message}
        </p>
      )}
    </form>
  );
}
