"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
export function ExpenseAttachment({ marketId }: { marketId: string }) {
  const t = useTranslations("financeOps"),
    [id, setId] = useState(""),
    [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <div className="grid gap-2">
      <label>
        {t("attachment")}
        <input
          type="file"
          accept="application/pdf"
          disabled={pending || !!id}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPending(true);
            setFailed(false);
            try {
              const form = new FormData();
              form.set("file", file);
              const result = await fetch(
                `/api/admin/finance/attachments?marketId=${encodeURIComponent(marketId)}`,
                { method: "POST", body: form },
              );
              if (!result.ok) throw new Error();
              const value = (await result.json()) as { id: string };
              setId(value.id);
            } catch {
              setFailed(true);
            } finally {
              setPending(false);
            }
          }}
        />
      </label>
      <input type="hidden" name="attachmentId" value={id} />
      {pending && <p role="status">{t("working")}</p>}
      {failed && <p role="alert">{t("invalid")}</p>}
      {id && (
        <a className="underline" href={`/api/admin/finance/attachments/${id}`}>
          {t("attachment")}
        </a>
      )}
    </div>
  );
}
