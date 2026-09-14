"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Select } from "@/components/ui";
import { generateAi } from "@/app/admin/(dashboard)/settings/ai/actions";
import { AiReview } from "./ai-review";
import { fieldKeys, type Proposal } from "@/modules/ai/proposals";
export function ProductAi({
  productId,
  mediaIds,
  onApply,
}: {
  productId?: string;
  mediaIds: string[];
  onApply: (fields: Proposal["fields"], form: HTMLFormElement) => void;
}) {
  const t = useTranslations("aiAdmin"),
    root = useRef<HTMLElement>(null),
    [task, setTask] = useState("generate"),
    [field, setField] = useState(fieldKeys[0]),
    [vision, setVision] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [review, setReview] = useState<{
      draftId: string;
      proposal: Proposal;
    } | null>(null),
    [pending, setPending] = useState<Record<string, unknown> | null>(null);
  return (
    <section
      ref={root}
      className="grid gap-3 rounded-token border border-primary/20 bg-surface p-4"
    >
      <h2 className="text-lg font-semibold">{t("assistant")}</h2>
      <p className="text-sm text-muted">{t("assistantHelp")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          {t("task")}
          <Select
            value={task}
            disabled={busy || !!pending}
            onChange={(e) => setTask(e.target.value)}
          >
            {["generate", "improve", "shorten", "translate", "field"].map(
              (k) => (
                <option key={k} value={k}>
                  {t(`tasks.${k}`)}
                </option>
              ),
            )}
          </Select>
        </label>
        {task === "field" && (
          <label>
            {t("field")}
            <Select
              value={field}
              disabled={busy || !!pending}
              onChange={(e) => setField(e.target.value)}
            >
              {fieldKeys.map((k) => (
                <option key={k} value={k}>
                  {t(`fields.${k.split(".")[0]}`)} · {k.split(".")[1]}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={vision}
          disabled={busy || !!pending}
          onChange={(e) => setVision(e.target.checked)}
        />
        {t("visionInput")}
      </label>
      <Button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          let request = pending;
          try {
            if (!request) {
              const form = root.current?.closest("form");
              if (!form) throw Error("form");
              const fd = new FormData(form),
                facts: Record<string, unknown> = {};
              for (const p of [
                "title",
                "description",
                "care",
                "seoTitle",
                "seoDescription",
                "seoKeywords",
              ]) {
                facts[p] = Object.fromEntries(
                  ["fa", "tr", "en"].map((l) => [
                    l,
                    String(fd.get(p + l[0].toUpperCase() + l.slice(1)) ?? ""),
                  ]),
                );
              }
              for (const p of [
                "material",
                "fit",
                "season",
                "originCountry",
                "tags",
                "categoryId",
              ])
                facts[p] = String(fd.get(p) ?? "");
              facts.attributes = JSON.parse(
                String(fd.get("attributes") ?? "[]"),
              );
              request = {
                requestKey: crypto.randomUUID(),
                productId,
                task,
                field: task === "field" ? field : undefined,
                facts,
                mediaIds: mediaIds.slice(0, 2),
                vision,
              };
              setPending(request);
            }
            const r = await generateAi(request);
            if (r.ok) {
              setReview({ draftId: r.value.draftId, proposal: r.value.result });
              setMessage(t("cost", { amount: r.value.costUsd }));
              setPending(null);
            } else {
              setMessage(r.message);
              if (!["UNKNOWN", "PENDING_UNKNOWN"].includes(r.code))
                setPending(null);
            }
          } catch {
            setMessage(t("errors.UNKNOWN"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("working") : pending ? t("retry") : t("generate")}
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
      {review && (
        <AiReview
          key={review.draftId}
          draftId={review.draftId}
          proposal={review.proposal}
          onApply={(fields) => {
            const form = root.current?.closest("form");
            if (form) onApply(fields, form);
          }}
        />
      )}
    </section>
  );
}
