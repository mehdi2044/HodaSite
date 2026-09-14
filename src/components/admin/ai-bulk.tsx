"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { queueAi } from "@/app/admin/(dashboard)/settings/ai/actions";
export function AiBulk({
  products,
}: {
  products: { id: string; title: string }[];
}) {
  const t = useTranslations("aiAdmin"),
    [ids, setIds] = useState<string[]>([]),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="grid gap-3 rounded-token bg-surface p-4">
      <h2 className="font-semibold">{t("bulk")}</h2>
      <p className="text-sm text-muted">{t("bulkHelp")}</p>
      {products.map((p) => (
        <label key={p.id} className="flex gap-2">
          <input
            type="checkbox"
            disabled={
              busy || !!key || (!ids.includes(p.id) && ids.length >= 20)
            }
            checked={ids.includes(p.id)}
            onChange={(e) =>
              setIds((old) =>
                e.target.checked
                  ? [...old, p.id]
                  : old.filter((id) => id !== p.id),
              )
            }
          />
          {p.title}
        </label>
      ))}
      <Button
        type="button"
        disabled={busy || !ids.length}
        onClick={async () => {
          setBusy(true);
          const requestKey = key || crypto.randomUUID();
          setKey(requestKey);
          try {
            const r = await queueAi({
              productIds: ids,
              requestKey,
              confirm: true,
            });
            setMessage(r.ok ? t("queued", { count: r.value }) : r.message);
            if (r.ok) {
              setKey("");
              setIds([]);
            }
          } catch {
            setMessage(t("errors.UNKNOWN"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("working") : t("queueGenerate")}
      </Button>
      <p role="status">{message}</p>
    </section>
  );
}
