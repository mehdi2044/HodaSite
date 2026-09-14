"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Select, Input } from "@/components/ui";
import {
  applyAi,
  discardAi,
} from "@/app/admin/(dashboard)/settings/ai/actions";
import { attributesSchema, type Proposal } from "@/modules/ai/proposals";
// Keep this page's review session mounted across action-triggered server refreshes.
// A full page reload starts a new session from the current private review queue.
export function AiReviewQueue({
  drafts,
  categories,
}: {
  drafts: { id: string; productId: string | null; proposal: Proposal }[];
  categories: { id: string; label: string }[];
}) {
  const [items] = useState(drafts);
  const t = useTranslations("aiAdmin");
  return (
    <div className="grid gap-6">
      {items.length === 0 && <p>{t("empty")}</p>}
      {items.map((d) => (
        <article key={d.id} className="grid gap-2">
          <a
            className="underline"
            href={`/admin/catalog/products/${d.productId}`}
          >
            {t("openProduct")}
          </a>
          <AiReview
            draftId={d.id}
            proposal={d.proposal}
            categories={categories}
          />
        </article>
      ))}
    </div>
  );
}
export function AiReview({
  draftId,
  proposal,
  onApply,
  categories = [],
}: {
  categories?: { id: string; label: string }[];
  draftId: string;
  proposal: Proposal;
  onApply?: (fields: Proposal["fields"]) => void;
}) {
  const t = useTranslations("aiAdmin"),
    [fields, setFields] = useState(proposal.fields),
    [selected, setSelected] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [pendingFields, setPendingFields] = useState<Proposal["fields"] | null>(
    null,
  );
  return (
    <section
      className="grid min-w-0 gap-4 rounded-token border border-black/10 bg-surface p-4"
      aria-label={t("review")}
    >
      <h3 className="font-semibold">{t("review")}</h3>
      <p className="text-sm text-muted">
        {onApply ? t("localReviewHelp") : t("reviewHelp")}
      </p>
      {fields.map((f) => (
        <div
          key={f.key}
          className="grid min-w-0 gap-2 border-b border-black/10 pb-4"
        >
          <label className="flex gap-2">
            <input
              type="checkbox"
              disabled={busy || done || !!pendingFields}
              checked={selected.includes(f.key)}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked
                    ? [...old, f.key]
                    : old.filter((x) => x !== f.key),
                )
              }
            />
            {t("accept")} ·{" "}
            <bdi>
              {t.has(`fields.${f.key.split(".")[0]}`)
                ? t(`fields.${f.key.split(".")[0]}`)
                : f.key.split(".")[0]}{" "}
              {f.key.split(".").at(-1)}
            </bdi>
          </label>
          {f.key === "categoryId" ? (
            <Select
              aria-label={f.key}
              disabled={busy || done || !!pendingFields}
              value={f.value}
              onChange={(e) =>
                setFields((old) =>
                  old.map((x) =>
                    x.key === f.key ? { ...x, value: e.target.value } : x,
                  ),
                )
              }
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          ) : f.key === "attributes" ? (
            <AttributeReview
              value={f.value}
              disabled={busy || done || !!pendingFields}
              onChange={(value) =>
                setFields((old) =>
                  old.map((x) => (x.key === f.key ? { ...x, value } : x)),
                )
              }
            />
          ) : (
            <textarea
              aria-label={f.key}
              dir={f.key.endsWith(".fa") ? "rtl" : "auto"}
              className="input min-h-28 w-full"
              value={f.value}
              disabled={busy || done || !!pendingFields}
              onChange={(e) =>
                setFields((old) =>
                  old.map((x) =>
                    x.key === f.key ? { ...x, value: e.target.value } : x,
                  ),
                )
              }
            />
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || done || !!pendingFields}
            onClick={() => {
              setFields((old) => old.filter((x) => x.key !== f.key));
              setSelected((old) => old.filter((x) => x !== f.key));
            }}
          >
            {t("discardField")}
          </Button>
        </div>
      ))}
      {proposal.suggestions.length > 0 && (
        <div className="rounded-token bg-background p-3 text-sm">
          <strong>{t("suggestions")}</strong>
          <ul className="list-inside list-disc">
            {proposal.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || done || !!pendingFields}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t("confirm")}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!confirmed || !selected.length || busy || done}
          onClick={async () => {
            setBusy(true);
            try {
              const chosen =
                pendingFields ?? fields.filter((f) => selected.includes(f.key));
              if (onApply) {
                onApply(chosen);
                setDone(true);
                setMessage(t("localApplied"));
              } else {
                setPendingFields(chosen);
                const r = await applyAi({
                  draftId,
                  fields: chosen,
                  confirm: true,
                });
                setMessage(r.ok ? t("applied") : r.message);
                if (r.ok) {
                  setDone(true);
                  setPendingFields(null);
                } else if (r.code !== "UNKNOWN") setPendingFields(null);
              }
            } catch {
              setMessage(t(onApply ? "errors.INPUT" : "errors.UNKNOWN"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("working") : pendingFields ? t("retry") : t("apply")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || done || !!pendingFields}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await discardAi(draftId);
              if (r.ok) {
                setDone(true);
                setMessage(t("discarded"));
              } else setMessage(r.message);
            } catch {
              setMessage(t("errors.UNKNOWN"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("discard")}
        </Button>
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}

function AttributeReview({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("aiAdmin");
  const attrs = JSON.parse(value || "[]") as ReturnType<
    typeof attributesSchema.parse
  >;
  return (
    <div className="grid gap-3">
      {attrs.map((a, index) => (
        <div
          className="grid gap-2 rounded-token border border-black/10 p-3"
          key={index}
        >
          <label>
            {t("fields.attributes")}
            <Input
              value={a.key}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  JSON.stringify(
                    attrs.map((v, i) =>
                      i === index ? { ...v, key: e.target.value } : v,
                    ),
                  ),
                )
              }
            />
          </label>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale}>
              <bdi>
                {a.key} · {locale}
              </bdi>
              <Input
                value={a.valueI18n[locale]}
                dir={locale === "fa" ? "rtl" : "ltr"}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    JSON.stringify(
                      attrs.map((v, i) =>
                        i === index
                          ? {
                              ...v,
                              valueI18n: {
                                ...v.valueI18n,
                                [locale]: e.target.value,
                              },
                            }
                          : v,
                      ),
                    ),
                  )
                }
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
