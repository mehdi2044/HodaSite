"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { financialOperation } from "@/app/admin/(dashboard)/finance/operations/actions";
export function FinanceOperationForm({
  kind,
  marketId,
  requestKey,
  children,
}: {
  kind: string;
  marketId: string;
  requestKey: string;
  children: ReactNode;
}) {
  const t = useTranslations("financeOps"),
    router = useRouter();
  const [key] = useState(requestKey),
    [pending, setPending] = useState(false),
    [locked, setLocked] = useState<Record<string, unknown> | null>(null),
    [code, setCode] = useState("");
  async function send(data: FormData) {
    if (pending) return;
    setPending(true);
    setCode("");
    if (["pending", "failed"].includes(String(data.get("attachmentState")))) {
      setCode("VALIDATION");
      setPending(false);
      return;
    }
    data.delete("attachmentState");
    const fields = Object.fromEntries(data.entries());
    const raw: Record<string, unknown> = { ...fields };
    if (!locked) {
      delete raw.confirm;
      if (!["receive", "approve"].includes(kind)) raw.marketId = marketId;
      if (
        [
          "config",
          "alerts",
          "opening",
          "costMethod",
          "purchase",
          "expense",
          "capital",
          "receive",
          "approve",
        ].includes(kind)
      )
        raw.confirm = data.get("confirm") === "on";
      if (["purchase", "expense", "capital", "opening"].includes(kind)) {
        raw.requestKey = key;
        raw.snapshot = Object.fromEntries(
          ["currency", "rateTry", "rateUsd", "fxAsOf", "effectiveAt"].map(
            (k) => [k, String(data.get(k))],
          ),
        );
        for (const k of [
          "currency",
          "rateTry",
          "rateUsd",
          "fxAsOf",
          "effectiveAt",
        ])
          delete raw[k];
        for (const k of ["fxAsOf", "effectiveAt"]) {
          try {
            (raw.snapshot as Record<string, string>)[k] = new Date(
              String(data.get(k)) + "Z",
            ).toISOString();
          } catch {
            setCode("VALIDATION");
            setPending(false);
            return;
          }
        }
      }
      if (["supplier", "partner"].includes(kind)) raw.requestKey = key;
      if (kind === "purchase") {
        raw.items = data.getAll("variantId").map((v, i) => ({
          variantId: String(v),
          quantity: Number(data.getAll("quantity")[i]),
          purchaseTotal: String(data.getAll("purchaseTotal")[i]),
          weight: String(data.getAll("weight")[i]),
        }));
        for (const k of ["variantId", "quantity", "purchaseTotal", "weight"])
          delete raw[k];
      }
      if (kind === "expense") {
        raw.isGlobal = data.get("isGlobal") === "on";
        raw.recurrenceMonths = Number(data.get("recurrenceMonths") || 0);
        if (!raw.attachmentId) delete raw.attachmentId;
        if (!raw.recurringSourceId) delete raw.recurringSourceId;
      }
      if (kind === "capital" && !raw.purchaseOrderId)
        delete raw.purchaseOrderId;
      if (kind === "config") {
        raw.enabled = data.get("enabled") === "on";
        raw.slowDays = Number(data.get("slowDays"));
      }
    }
    const request = locked ?? raw;
    try {
      const result = await financialOperation(kind, request);
      if (result.ok) {
        setCode("DONE");
        setLocked(request);
        router.refresh();
      } else {
        setCode(result.code);
        if (result.code === "UNKNOWN") setLocked(request);
      }
    } catch {
      setCode("UNKNOWN");
      setLocked(request);
    } finally {
      setPending(false);
    }
  }
  return (
    <form action={send} className="grid min-w-0 gap-3">
      <fieldset disabled={pending || !!locked} className="grid min-w-0 gap-3">
        {children}
      </fieldset>
      {code && (
        <p
          role="status"
          className={code === "DONE" ? "text-success" : "text-error"}
        >
          {t(
            code === "DONE"
              ? "saved"
              : code === "UNKNOWN"
                ? "unknown"
                : "invalid",
          )}
        </p>
      )}
      <button
        className="button"
        type="submit"
        disabled={pending || code === "DONE"}
      >
        {t(pending ? "working" : locked ? "retry" : "submit")}
      </button>
    </form>
  );
}
export function PurchaseLines({
  variants,
}: {
  variants: { id: string; sku: string }[];
}) {
  const t = useTranslations("financeOps"),
    [rows, setRows] = useState([0]);
  return (
    <div className="grid gap-3">
      {rows.map((id) => (
        <div key={id} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
          <label>
            {t("variant")}
            <select name="variantId" required className="input w-full">
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.sku}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("quantity")}
            <input
              name="quantity"
              type="number"
              min="1"
              max="1000000"
              defaultValue="1"
              required
              className="input w-full"
            />
          </label>
          <label>
            {t("purchaseTotal")}
            <input
              name="purchaseTotal"
              inputMode="decimal"
              required
              className="input w-full"
            />
          </label>
          <label>
            {t("weight")}
            <input
              name="weight"
              inputMode="decimal"
              defaultValue="1"
              required
              className="input w-full"
            />
          </label>
          {rows.length > 1 && (
            <button
              type="button"
              className="button"
              onClick={() => setRows(rows.filter((r) => r !== id))}
            >
              {t("remove")}
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={rows.length >= 100}
        onClick={() => setRows([...rows, Math.max(...rows) + 1])}
      >
        {t("addLine")}
      </button>
    </div>
  );
}

export function FinanceRates({
  effectiveAt,
  fxAsOf,
  initialCurrency = "TRY",
}: {
  effectiveAt: string;
  fxAsOf: string;
  initialCurrency?: string;
}) {
  const t = useTranslations("financeOps"),
    [currency, setCurrency] = useState(initialCurrency);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label>
        {t("currency")}
        <select
          name="currency"
          className="input"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {["TRY", "USD", "CAD", "IRT"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        {t("rateTry")}
        <input
          key={`tr:${currency}`}
          className="input"
          name="rateTry"
          defaultValue={currency === "TRY" ? "1" : ""}
          readOnly={currency === "TRY"}
          required
          inputMode="decimal"
        />
      </label>
      <label>
        {t("rateUsd")}
        <input
          key={`usd:${currency}`}
          className="input"
          name="rateUsd"
          defaultValue={currency === "USD" ? "1" : ""}
          readOnly={currency === "USD"}
          required
          inputMode="decimal"
        />
      </label>
      <label>
        {t("fxAsOf")}
        <input
          className="input"
          name="fxAsOf"
          type="datetime-local"
          defaultValue={fxAsOf}
          required
        />
      </label>
      <label>
        {t("effectiveAt")}
        <input
          className="input"
          name="effectiveAt"
          type="datetime-local"
          defaultValue={effectiveAt}
          required
        />
      </label>
      <p className="muted sm:col-span-2">{t("ratesHelp")}</p>
    </div>
  );
}
