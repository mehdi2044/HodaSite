"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@/components/ui";
import { analyzeAi } from "@/app/admin/(dashboard)/settings/ai/actions";
export function AiFinancial({
  marketId,
  locale,
}: {
  marketId?: string;
  locale: string;
}) {
  const t = useTranslations("aiAdmin"),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [result, setResult] = useState<{
      summary: string;
      anomalies: string[];
    } | null>(null);
  return (
    <section className="grid gap-4">
      <label>
        {t("month")}
        <Input
          type="month"
          value={month}
          disabled={busy || !!key}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      <Button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const requestKey = key || crypto.randomUUID();
          setKey(requestKey);
          try {
            const r = await analyzeAi({ marketId, locale, month, requestKey });
            if (r.ok) {
              setResult(r.value.result);
              setMessage(t("cost", { amount: r.value.costUsd }));
              setKey("");
            } else {
              setMessage(r.message);
              if (!["UNKNOWN", "PENDING_UNKNOWN"].includes(r.code)) setKey("");
            }
          } catch {
            setMessage(t("errors.UNKNOWN"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("working") : t("analyze")}
      </Button>
      <p role="status">{message}</p>
      {result && (
        <article className="grid gap-4 rounded-token bg-surface p-5">
          <p className="whitespace-pre-wrap">{result.summary}</p>
          <ul className="list-inside list-disc">
            {result.anomalies.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
