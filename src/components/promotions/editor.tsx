"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type {
  PromotionRevision,
  PromotionSelector,
} from "@/modules/promotions";
import { initialConfig, editorInput } from "@/modules/promotions/editor";
import { RequestForm, ConfirmSave } from "./request-form";
import { saveProgramAction } from "@/app/admin/(dashboard)/promotions/actions";
type Option = { id: string; name: string };
type Condition = PromotionRevision["definition"]["conditions"][number];
export type EditorSaved = {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  ownerNotes: string;
  titleI18n: Record<string, string>;
  descriptionI18n: Record<string, string>;
  config: PromotionRevision;
};
export function PromotionEditor({
  marketId,
  currency,
  now,
  saved,
  options,
  segmentAllowed,
}: {
  marketId: string;
  currency: string;
  now: string;
  saved?: EditorSaved;
  options: {
    product: Option[];
    category: Option[];
    collection: Option[];
    segment: Option[];
    program: Option[];
  };
  segmentAllowed: boolean;
}) {
  const t = useTranslations("promotionAdmin"),
    router = useRouter();
  const c = saved?.config ?? initialConfig(now);
  const [conditions, setConditions] = useState<Condition[]>(
      c.definition.conditions,
    ),
    [selector, setSelector] = useState(c.definition.selector),
    [effect, setEffect] = useState(c.definition.effect.type),
    [status, setStatus] = useState(c.status);
  const fields = [
    "market",
    "locale",
    ...(segmentAllowed ? ["segment"] : []),
    "orders",
    "subtotal",
    "quantity",
    "product",
    "category",
    "collection",
    "tag",
    "consent",
  ];
  function initial(field: string): Condition {
    return (
      field === "consent"
        ? { field, channel: "email", value: "OPTED_IN" }
        : ["orders", "quantity", "subtotal"].includes(field)
          ? { field, op: "gte", value: field === "subtotal" ? "100" : 1 }
          : {
              field,
              value:
                field === "market" ? marketId : field === "locale" ? "fa" : "",
            }
    ) as Condition;
  }
  const change = (index: number, value: Condition) =>
    setConditions((rows) => rows.map((r, i) => (i === index ? value : r)));
  const input = (
    key: string,
    value: string | number | null | undefined,
    required = false,
    type = "text",
  ) => (
    <label className="grid gap-1 min-w-0" key={key}>
      {t(key)}
      <input
        className="input w-full min-w-0"
        name={key}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        maxLength={
          key === "ownerNotes" ? 4000 : key === "description" ? 2000 : 100
        }
        step={
          type === "number"
            ? "1"
            : type === "datetime-local"
              ? "0.001"
              : undefined
        }
      />
    </label>
  );
  const select = (key: string, values: string[], value: string) => (
    <label className="grid gap-1" key={key}>
      {t(key)}
      <select className="input w-full" name={key} defaultValue={value}>
        {values.map((v) => (
          <option key={v} value={v}>
            {t(`${key}Options.${v}`)}
          </option>
        ))}
      </select>
    </label>
  );
  function optionNodes(rows: Option[], selected: string[]) {
    return [
      ...rows,
      ...selected
        .filter((id) => !rows.some((r) => r.id === id))
        .map((id) => ({ id, name: t("unavailable", { id }) })),
    ].map((o) => (
      <option key={o.id} value={o.id}>
        {o.name}
      </option>
    ));
  }
  return (
    <RequestForm
      build={(f) =>
        editorInput(
          f,
          marketId,
          saved,
          { ...c.definition, conditions, selector },
          crypto.randomUUID(),
        )
      }
      action={saveProgramAction}
      onSuccess={(r) => {
        if (saved) router.refresh();
        else router.push(`/admin/promotions?marketId=${marketId}&id=${r.id}`);
      }}
    >
      <fieldset
        disabled={c.status === "ARCHIVED"}
        className="grid gap-6 min-w-0"
      >
        <section className="card grid gap-4">
          <h2>{t("basics")}</h2>
          <p className="text-muted">{t("safeDefault")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {input("name", saved?.name, true)}
            {input("category", saved?.category ?? "promotion", true)}
            {input("description", saved?.description)}
            {input("ownerNotes", saved?.ownerNotes)}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {["fa", "tr", "en"].map((l) => (
              <div className="grid gap-3" key={l}>
                <label>
                  {t("publicTitle", { locale: t(`locales.${l}`) })}
                  <input
                    className="input w-full"
                    name={`titleI18n.${l}`}
                    required
                    maxLength={300}
                    dir={l === "fa" ? "rtl" : "ltr"}
                    defaultValue={saved?.titleI18n[l] ?? ""}
                  />
                </label>
                <label>
                  {t("publicDescription", { locale: t(`locales.${l}`) })}
                  <textarea
                    className="input w-full"
                    name={`descriptionI18n.${l}`}
                    maxLength={2000}
                    dir={l === "fa" ? "rtl" : "ltr"}
                    defaultValue={saved?.descriptionI18n[l] ?? ""}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>
        <section className="card grid gap-4">
          <h2>{t("schedule")}</h2>
          <p>{t("scheduleHelp")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              {t("status")}
              <select
                className="input w-full"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                {[
                  "DRAFT",
                  "STAGED",
                  "SCHEDULED",
                  "ACTIVE",
                  "PAUSED",
                  "ARCHIVED",
                ].map((s) => (
                  <option key={s} value={s}>
                    {t(`statusOptions.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 min-h-11">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={c.enabled}
              />
              {t("enabled")}
            </label>
            {input(
              "startsAt",
              c.startsAt.replace(/Z$/, ""),
              true,
              "datetime-local",
            )}
            {input(
              "endsAt",
              c.endsAt?.replace(/Z$/, ""),
              false,
              "datetime-local",
            )}
          </div>
          {["ACTIVE", "SCHEDULED", "ARCHIVED"].includes(status) && (
            <p className="rounded-token bg-background p-3" role="note">
              {t(status === "ARCHIVED" ? "archiveWarning" : "activateWarning")}
            </p>
          )}
        </section>
        <section className="card grid gap-4">
          <h2>{t("when")}</h2>
          <p>{t("conditionsHelp")}</p>
          <p className="text-muted">{t("example")}</p>
          {conditions.map((r, i) => {
            const opts =
              r.field in options
                ? options[r.field as keyof typeof options]
                : null;
            return (
              <div
                className="grid gap-3 rounded-token bg-background p-4 md:grid-cols-4 min-w-0"
                key={i}
                data-testid="promotion-condition"
              >
                <label>
                  {t("condition")}
                  <select
                    className="input w-full"
                    value={r.field}
                    onChange={(e) => change(i, initial(e.target.value))}
                  >
                    {[...new Set([...fields, r.field])].map((k) => (
                      <option value={k} key={k}>
                        {t(`fields.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {"op" in r && (
                  <label>
                    {t("operator")}
                    <select
                      className="input w-full"
                      value={r.op}
                      onChange={(e) =>
                        change(i, { ...r, op: e.target.value } as Condition)
                      }
                    >
                      {["gte", "lte", "eq"].map((op) => (
                        <option key={op} value={op}>
                          {t(`operators.${op}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {r.field === "consent" && (
                  <label>
                    {t("channel")}
                    <select
                      className="input w-full"
                      value={r.channel}
                      onChange={(e) =>
                        change(i, {
                          ...r,
                          channel: e.target.value,
                        } as Condition)
                      }
                    >
                      {["email", "sms", "whatsapp", "telegram", "push"].map(
                        (v) => (
                          <option key={v} value={v}>
                            {t(`channels.${v}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                )}
                <label>
                  {t("value")}
                  {opts ? (
                    <select
                      className="input w-full"
                      required
                      value={r.value}
                      onChange={(e) =>
                        change(i, { ...r, value: e.target.value } as Condition)
                      }
                    >
                      <option value="">{t("choose")}</option>
                      {optionNodes(opts, [String(r.value)].filter(Boolean))}
                    </select>
                  ) : r.field === "locale" || r.field === "consent" ? (
                    <select
                      className="input w-full"
                      value={r.value}
                      onChange={(e) =>
                        change(i, { ...r, value: e.target.value } as Condition)
                      }
                    >
                      {(r.field === "locale"
                        ? ["fa", "tr", "en"]
                        : ["OPTED_IN", "OPTED_OUT", "UNKNOWN"]
                      ).map((v) => (
                        <option value={v} key={v}>
                          {t(
                            `${r.field === "locale" ? "locales" : "consents"}.${v}`,
                          )}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input w-full"
                      required
                      maxLength={100}
                      readOnly={r.field === "market"}
                      type={
                        r.field === "orders" || r.field === "quantity"
                          ? "number"
                          : "text"
                      }
                      min={0}
                      value={r.value}
                      onChange={(e) =>
                        change(i, {
                          ...r,
                          value:
                            r.field === "orders" || r.field === "quantity"
                              ? Number(e.target.value)
                              : e.target.value,
                        } as Condition)
                      }
                    />
                  )}
                </label>
                <button
                  className="button self-end"
                  type="button"
                  onClick={() =>
                    setConditions((rows) =>
                      rows.filter((_, index) => i !== index),
                    )
                  }
                >
                  {t("remove")}
                </button>
              </div>
            );
          })}
          <button
            className="button justify-self-start"
            type="button"
            disabled={conditions.length >= 24}
            onClick={() => setConditions([...conditions, initial("subtotal")])}
          >
            {t("addCondition")}
          </button>
          <details>
            <summary className="min-h-11 cursor-pointer">
              {t("selectors")}
            </summary>
            <p>{t("selectorHelp")}</p>
            <div className="grid gap-4 md:grid-cols-3">
              {(Object.keys(selector) as (keyof PromotionSelector)[]).map(
                (k) => (
                  <label className="grid gap-1" key={k}>
                    {t(k)}
                    <select
                      className="input w-full"
                      multiple
                      size={5}
                      value={selector[k]}
                      onChange={(e) =>
                        setSelector({
                          ...selector,
                          [k]: Array.from(
                            e.target.selectedOptions,
                            (o) => o.value,
                          ),
                        })
                      }
                    >
                      {optionNodes(
                        k.toLowerCase().includes("product")
                          ? options.product
                          : k.toLowerCase().includes("category")
                            ? options.category
                            : options.collection,
                        selector[k],
                      )}
                    </select>
                    <button
                      className="button"
                      type="button"
                      onClick={() => setSelector({ ...selector, [k]: [] })}
                    >
                      {t("clear")}
                    </button>
                  </label>
                ),
              )}
            </div>
          </details>
        </section>
        <section className="card grid gap-4">
          <h2>{t("then")}</h2>
          <p>{t("amountHelp", { currency })}</p>
          <label>
            {t("effect")}
            <select
              className="input w-full"
              name="effect"
              value={effect}
              onChange={(e) => setEffect(e.target.value as typeof effect)}
            >
              {[
                "percent",
                "fixed",
                "freeShipping",
                "buyXGetY",
                "spendXGetY",
              ].map((k) => (
                <option key={k} value={k}>
                  {t(`effects.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 md:grid-cols-2" key={effect}>
            {effect === "percent" &&
              input(
                "percent",
                "percent" in c.definition.effect
                  ? c.definition.effect.percent
                  : "10",
                true,
              )}
            {(effect === "fixed" || effect === "spendXGetY") &&
              input(
                "amount",
                "amount" in c.definition.effect
                  ? c.definition.effect.amount
                  : "",
                true,
              )}
            {effect === "buyXGetY" && (
              <>
                {input(
                  "buy",
                  "buy" in c.definition.effect ? c.definition.effect.buy : 2,
                  true,
                  "number",
                )}
                {input(
                  "get",
                  "get" in c.definition.effect ? c.definition.effect.get : 1,
                  true,
                  "number",
                )}
              </>
            )}
            {effect === "spendXGetY" && (
              <>
                {input(
                  "spend",
                  "spend" in c.definition.effect
                    ? c.definition.effect.spend
                    : "",
                  true,
                )}
                {input(
                  "maxSets",
                  "maxSets" in c.definition.effect
                    ? c.definition.effect.maxSets
                    : null,
                  false,
                  "number",
                )}
              </>
            )}
            {input("maxDiscount", c.definition.maxDiscount)}
          </div>
          <p>{t(`effectHelp.${effect}`)}</p>
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              name="couponRequired"
              defaultChecked={c.couponRequired}
            />
            {t("couponRequired")}
          </label>
        </section>
        <section className="card grid gap-4">
          <h2>{t("limits")}</h2>
          <p>{t("limitsHelp")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {input("budget", c.budget)}
            {input("totalUsageCap", c.totalUsageCap, false, "number")}
            {input("perCustomerCap", c.perCustomerCap, false, "number")}
            {input("priority", c.priority, true, "number")}
            {input("group", c.group, true)}
            {select("stacking", ["EXCLUSIVE_GROUP", "STACKABLE"], c.stacking)}
            <label>
              {t("excludes")}
              <select
                className="input w-full"
                name="excludes"
                multiple
                size={4}
                defaultValue={c.excludes}
              >
                {optionNodes(options.program, c.excludes)}
              </select>
            </label>
          </div>
          <p className="text-muted">{t("stackingHelp")}</p>
        </section>
        {c.status !== "ARCHIVED" && <ConfirmSave />}
      </fieldset>
    </RequestForm>
  );
}
