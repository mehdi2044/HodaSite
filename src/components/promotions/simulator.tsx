"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Iso } from "@/components/storefront/iso";
import { simulateAction } from "@/app/admin/(dashboard)/promotions/actions";
import { MAX_COUPON_INPUT_LENGTH } from "@/modules/promotions/coupon-contracts";
type Reply = Awaited<ReturnType<typeof simulateAction>>;
export function PromotionSimulator({
  marketId,
  programId,
  carts,
  names,
}: {
  marketId: string;
  programId: string;
  carts: { id: string; label: string }[];
  names: Record<string, string>;
}) {
  const t = useTranslations("promotionAdmin");
  const [result, setResult] = useState<Reply | null>(null),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <form
      className="card grid gap-4 min-w-0"
      onChange={() => {
        setResult(null);
        setFailed(false);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setResult(null);
        setFailed(false);
        try {
          setResult(
            await simulateAction({
              marketId,
              cartId: String(f.get("cartId")),
              couponCodes: String(f.get("couponCodes") ?? "")
                .split(/[\s,]+/)
                .filter(Boolean),
              ...(f.get("preview") === "on"
                ? { previewProgramId: programId }
                : {}),
            }),
          );
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{t("simulator")}</h2>
      <p>{t("estimateHelp")}</p>
      <fieldset disabled={busy} className="grid gap-4">
        <label>
          {t("sampleCart")}
          <select className="input w-full" name="cartId" required>
            <option value="">{t("choose")}</option>
            {carts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {!carts.length && <p>{t("noCarts")}</p>}
        <label>
          {t("couponCodes")}
          <input
            className="input w-full"
            dir="ltr"
            name="couponCodes"
            maxLength={MAX_COUPON_INPUT_LENGTH}
          />
        </label>
        <label className="flex items-start gap-3 min-h-11">
          <input type="checkbox" name="preview" defaultChecked />
          {t("previewDraft")}
        </label>
        <button
          className="button justify-self-start"
          disabled={!carts.length}
          type="submit"
        >
          {t("simulate")}
        </button>
      </fieldset>
      {busy && <p role="status">{t("working")}</p>}
      {failed && <p role="alert">{t("simulationFailed")}</p>}
      {result &&
        (result.ok ? (
          <div
            className="grid gap-4"
            role="status"
            data-testid="simulation-result"
          >
            <p>{t("estimateOnly")}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {(
                [
                  "subtotal",
                  "merchandiseDiscount",
                  "shippingDiscount",
                  "discountTotal",
                ] as const
              ).map((k) => (
                <div className="rounded-token bg-background p-3" key={k}>
                  <p>{t(k)}</p>
                  <strong>
                    <Iso>{`${result.data.result[k]} ${result.data.result.currency}`}</Iso>
                  </strong>
                </div>
              ))}
            </div>
            {result.data.result.explanations.map((e) => (
              <article
                className="rounded-token border p-4 grid gap-2"
                key={e.promotionId}
              >
                <strong>{names[e.promotionId] ?? t("program")}</strong>
                <p>{t(`reasons.${e.reason}`)}</p>
                {e.conflictWith && (
                  <p>
                    {t("conflictWith", {
                      name: names[e.conflictWith] ?? t("program"),
                    })}
                  </p>
                )}
                <ul>
                  {e.conditions.map((c) => (
                    <li key={c.index}>
                      {t(`fields.${c.field}`)}:{" "}
                      {t(c.matched ? "matched" : "unmatched")}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p role="alert">{t(`errors.${result.code}`)}</p>
        ))}
    </form>
  );
}
