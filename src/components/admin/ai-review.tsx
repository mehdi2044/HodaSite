"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import {
  applyAi,
  discardAi,
} from "@/app/admin/(dashboard)/settings/ai/actions";
import type { Proposal } from "@/modules/ai/proposals";
export function AiReview({
  draftId,
  proposal,
  onApply,
}: {
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
              disabled={busy || done}
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
          <textarea
            aria-label={f.key}
            dir={f.key.endsWith(".fa") ? "rtl" : "auto"}
            className="input min-h-28 w-full"
            value={f.value}
            disabled={busy || done}
            onChange={(e) =>
              setFields((old) =>
                old.map((x) =>
                  x.key === f.key ? { ...x, value: e.target.value } : x,
                ),
              )
            }
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || done}
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
          disabled={busy || done}
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
              const chosen = fields.filter((f) => selected.includes(f.key));
              if (onApply) {
                onApply(chosen);
                setDone(true);
                setMessage(t("localApplied"));
              } else {
                const r = await applyAi({
                  draftId,
                  fields: chosen,
                  confirm: true,
                });
                setMessage(r.ok ? t("applied") : r.message);
                if (r.ok) setDone(true);
              }
            } catch {
              setMessage(t("errors.UNKNOWN"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("working") : t("apply")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || done}
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
