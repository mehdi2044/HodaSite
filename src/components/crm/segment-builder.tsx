"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { EngagementForm } from "@/components/engagement/form";
import type { ActionResult } from "@/lib/action-result";
import { segmentSchema, type SegmentDefinition } from "@/modules/crm/contracts";
type Rule = SegmentDefinition["rules"][number];
const fields = [
  "locale",
  "market",
  "orders",
  "value",
  "aov",
  "lastOrder",
  "category",
  "tag",
  "consent",
] as const;
function initial(field: Rule["field"], marketId: string): Rule {
  switch (field) {
    case "market":
      return { field, value: marketId };
    case "locale":
      return { field, value: "en" };
    case "orders":
      return { field, op: "gte", value: 1 };
    case "value":
    case "aov":
      return { field, op: "gte", value: "0" };
    case "lastOrder":
      return { field, op: "gte", value: new Date().toISOString().slice(0, 10) };
    case "consent":
      return { field, channel: "email", value: "OPTED_IN" };
    default:
      return { field, value: "" };
  }
}
export function SegmentBuilder({
  marketId,
  categories,
  action,
  saved,
  previewAction,
}: {
  marketId: string;
  categories: { id: string; name: string }[];
  saved?: {
    id: string;
    version: number;
    name: string;
    definition: SegmentDefinition;
  };
  action: (_: unknown, f: FormData) => Promise<ActionResult>;
  previewAction: (
    marketId: string,
    definition: unknown,
    page: number,
  ) => Promise<
    | {
        ok: true;
        count: number;
        rows: { id: string; locale: string }[];
        page: number;
      }
    | { ok: false }
  >;
}) {
  const t = useTranslations("crm"),
    [rules, setRules] = useState<Rule[]>(saved?.definition.rules ?? []),
    [preview, setPreview] = useState<Awaited<
      ReturnType<typeof previewAction>
    > | null>(null),
    [busy, setBusy] = useState(false);
  function change(index: number, rule: Rule) {
    setRules((rs) => rs.map((r, i) => (i === index ? rule : r)));
    setPreview(null);
  }
  async function count(page = 0) {
    setBusy(true);
    try {
      setPreview(await previewAction(marketId, { version: 1, rules }, page));
    } catch {
      setPreview({ ok: false });
    } finally {
      setBusy(false);
    }
  }
  return (
    <EngagementForm action={action}>
      <input type="hidden" name="marketId" value={marketId} />
      {saved && (
        <>
          <input type="hidden" name="id" value={saved.id} />
          <input type="hidden" name="version" value={saved.version} />
        </>
      )}
      <input
        type="hidden"
        name="definition"
        value={JSON.stringify({ version: 1, rules })}
      />
      <label>
        {t("name")}
        <input
          className="input w-full"
          name="name"
          required
          maxLength={100}
          defaultValue={saved?.name}
        />
      </label>
      <p className="text-muted">{t("segmentHelp")}</p>
      {rules.map((r, i) => (
        <div
          key={i}
          className="rounded-token border border-black/10 p-4 grid gap-3 sm:grid-cols-2"
        >
          <label>
            {t("condition")}
            <select
              aria-label={t("condition")}
              className="input w-full"
              value={r.field}
              onChange={(e) =>
                change(i, initial(e.target.value as Rule["field"], marketId))
              }
            >
              {fields.map((f) => (
                <option key={f} value={f}>
                  {t(`fields.${f}`)}
                </option>
              ))}
            </select>
          </label>
          {"op" in r && (
            <label>
              {t("comparison")}
              <select
                className="input w-full"
                value={r.op}
                onChange={(e) =>
                  change(i, { ...r, op: e.target.value } as Rule)
                }
              >
                {(r.field === "lastOrder"
                  ? ["gte", "lte"]
                  : ["gte", "lte", "eq"]
                ).map((op) => (
                  <option key={op} value={op}>
                    {t(op)}
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
                  change(i, { ...r, channel: e.target.value } as Rule)
                }
              >
                {["email", "sms", "whatsapp", "telegram", "push"].map((c) => (
                  <option key={c} value={c}>
                    {t(`channels.${c}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t("conditionValue")}
            {r.field === "locale" ||
            r.field === "consent" ||
            r.field === "category" ? (
              <select
                aria-label={t("conditionValue")}
                className="input w-full"
                value={r.value}
                onChange={(e) =>
                  change(i, { ...r, value: e.target.value } as Rule)
                }
              >
                {r.field === "category" ? (
                  <>
                    <option value="">{t("choose")}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </>
                ) : (
                  (r.field === "locale"
                    ? ["fa", "tr", "en"]
                    : ["UNKNOWN", "OPTED_IN", "OPTED_OUT"]
                  ).map((v) => (
                    <option key={v} value={v}>
                      {t(r.field === "locale" ? `locales.${v}` : `states.${v}`)}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <input
                className="input w-full"
                type={
                  r.field === "lastOrder"
                    ? "date"
                    : r.field === "orders"
                      ? "number"
                      : "text"
                }
                maxLength={100}
                value={r.value}
                readOnly={r.field === "market"}
                onChange={(e) =>
                  change(i, {
                    ...r,
                    value:
                      r.field === "orders"
                        ? Number(e.target.value)
                        : e.target.value,
                  } as Rule)
                }
              />
            )}
          </label>
          <button
            className="button"
            type="button"
            onClick={() => {
              setRules((rs) => rs.filter((_, n) => n !== i));
              setPreview(null);
            }}
          >
            {t("remove")}
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          className="button"
          type="button"
          disabled={rules.length >= 12}
          onClick={() => {
            setRules([...rules, initial("orders", marketId)]);
            setPreview(null);
          }}
        >
          {t("addCondition")}
        </button>
        <button
          className="button"
          type="button"
          disabled={
            busy || !segmentSchema.safeParse({ version: 1, rules }).success
          }
          onClick={() => count()}
        >
          {busy ? t("loading") : t("preview")}
        </button>
        <button className="button" type="submit">
          {t("save")}
        </button>
      </div>
      {preview &&
        (preview.ok ? (
          <div
            className="rounded-token bg-background p-4 grid gap-2"
            role="status"
          >
            <p>{t("audience", { count: preview.count })}</p>
            <p>{t("previewPrivacy")}</p>
            {preview.rows.map((r) => (
              <bdi key={r.id} dir="ltr" className="break-all">
                {r.id} · {r.locale}
              </bdi>
            ))}
            {preview.count > (preview.page + 1) * 25 && (
              <button
                type="button"
                className="button"
                onClick={() => count(preview.page + 1)}
              >
                {t("next")}
              </button>
            )}
          </div>
        ) : (
          <p role="alert">{t("error")}</p>
        ))}
    </EngagementForm>
  );
}
