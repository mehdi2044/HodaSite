"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { CommerceForm } from "@/components/storefront/commerce-form";
import { workflowAction } from "@/app/admin/(dashboard)/settings/shipping/actions";
type I18n = { fa: string; tr: string; en: string };
type Leg = {
  type: "INTERNATIONAL" | "DOMESTIC";
  labelI18n: I18n;
  carrierName: string;
  trackingUrlTemplate: string;
};
export type EditableWorkflow = {
  id: string;
  marketId: string;
  version: number;
  nameI18n: I18n;
  isDefault: boolean;
  isActive: boolean;
  legs: Leg[];
};
const blankLeg = (): Leg => ({
  type: "DOMESTIC",
  labelI18n: { fa: "", tr: "", en: "" },
  carrierName: "",
  trackingUrlTemplate: "",
});
export function WorkflowEditor({
  workflow,
  markets,
}: {
  workflow?: EditableWorkflow;
  markets: { id: string; code: string }[];
}) {
  const t = useTranslations("shipping");
  const [legs, setLegs] = useState<Leg[]>(workflow?.legs ?? [blankLeg()]);
  const set = (i: number, value: Partial<Leg>) =>
    setLegs((rows) => rows.map((r, j) => (j === i ? { ...r, ...value } : r)));
  return (
    <CommerceForm action={workflowAction} className="grid gap-5 mt-4">
      <input type="hidden" name="id" value={workflow?.id ?? ""} />
      <input type="hidden" name="version" value={workflow?.version ?? 0} />
      <input type="hidden" name="legs" value={JSON.stringify(legs)} />
      <label>
        {t("market")}
        <select
          aria-label={t("market")}
          className="input w-full"
          name="marketId"
          defaultValue={workflow?.marketId}
        >
          {markets
            .filter((m) => !workflow || m.id === workflow.marketId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.code}
              </option>
            ))}
        </select>
      </label>
      {(["fa", "tr", "en"] as const).map((locale) => (
        <label key={locale}>
          {t("workflowName")} ({t(locale)})
          <input
            className="input w-full"
            name={`name${locale[0].toUpperCase() + locale.slice(1)}`}
            defaultValue={workflow?.nameI18n[locale] ?? ""}
            required
            maxLength={100}
          />
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={workflow?.isActive ?? true}
        />{" "}
        {t("active")}
      </label>
      <label>
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={workflow?.isDefault ?? false}
        />{" "}
        {t("default")}
      </label>
      <p className="text-sm text-muted">{t("defaultHint")}</p>
      {legs.map((leg, i) => (
        <fieldset
          key={i}
          className="grid gap-3 rounded-token border border-black/15 p-4"
          data-testid="workflow-leg"
        >
          <legend>{t("legIndex", { n: i + 1 })}</legend>
          <label>
            {t("type")}
            <select
              aria-label={`${t("type")} ${i + 1}`}
              className="input w-full"
              value={leg.type}
              onChange={(e) => set(i, { type: e.target.value as Leg["type"] })}
            >
              <option value="INTERNATIONAL">{t("INTERNATIONAL")}</option>
              <option value="DOMESTIC">{t("DOMESTIC")}</option>
            </select>
          </label>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale}>
              {t("legLabel")} ({t(locale)})
              <input
                className="input w-full"
                value={leg.labelI18n[locale]}
                onChange={(e) =>
                  set(i, {
                    labelI18n: { ...leg.labelI18n, [locale]: e.target.value },
                  })
                }
                required
                maxLength={100}
              />
            </label>
          ))}
          <label>
            {t("carrier")}
            <input
              className="input w-full"
              value={leg.carrierName}
              onChange={(e) => set(i, { carrierName: e.target.value })}
              maxLength={100}
            />
          </label>
          <label>
            {t("trackingTemplate")}
            <input
              className="input w-full"
              dir="ltr"
              value={leg.trackingUrlTemplate}
              onChange={(e) => set(i, { trackingUrlTemplate: e.target.value })}
              maxLength={1000}
            />
          </label>
          <p className="text-sm text-muted">{t("templateHint")}</p>
          <div className="flex flex-wrap gap-3">
            <button
              className="button"
              type="button"
              disabled={i === 0}
              onClick={() =>
                setLegs((rows) => {
                  const copy = [...rows];
                  [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                  return copy;
                })
              }
            >
              {t("moveUp")}
            </button>
            <button
              type="button"
              className="button"
              disabled={legs.length === 1}
              onClick={() => setLegs((rows) => rows.filter((_, j) => i !== j))}
            >
              {t("removeLeg")}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        className="button"
        type="button"
        disabled={legs.length >= 8}
        onClick={() => setLegs((rows) => [...rows, blankLeg()])}
      >
        {t("addLeg")}
      </button>
      <button className="button">{t("saveWorkflow")}</button>
    </CommerceForm>
  );
}
