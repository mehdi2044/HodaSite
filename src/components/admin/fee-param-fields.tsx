"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Select } from "@/components/ui";
import type { FeeMethod } from "@/modules/fees";

type Row = { upto: string; amount: string; percent: string };

function rowsFrom(params: Record<string, unknown>, method: FeeMethod): Row[] {
  const rows = Array.isArray(params.brackets) ? params.brackets : [];
  if (rows.length === 0) return [{ upto: "", amount: "", percent: "" }];
  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      upto: String(
        row[method === "WEIGHT_BRACKET" ? "uptoKg" : "uptoAmount"] ?? "",
      ),
      amount: String(row.amount ?? ""),
      percent: String(row.percent ?? ""),
    };
  });
}

export function FeeParamFields({
  initialMethod,
  initialParams,
}: {
  initialMethod: FeeMethod;
  initialParams: Record<string, unknown>;
}) {
  const t = useTranslations("phase03Admin");
  const [method, setMethod] = useState<FeeMethod>(initialMethod);
  const [amount, setAmount] = useState(String(initialParams.amount ?? ""));
  const [percent, setPercent] = useState(String(initialParams.percent ?? ""));
  const [of, setOf] = useState(String(initialParams.of ?? "subtotal"));
  const [perKg, setPerKg] = useState(String(initialParams.perKg ?? ""));
  const [minKg, setMinKg] = useState(String(initialParams.minKg ?? ""));
  const [extraPerKg, setExtraPerKg] = useState(
    String(initialParams.extraPerKg ?? ""),
  );
  const [rows, setRows] = useState(() =>
    rowsFrom(initialParams, initialMethod),
  );

  const params = useMemo(() => {
    if (method === "FIXED" || method === "PER_ITEM") return { amount };
    if (method === "PERCENT") return { percent, of };
    if (method === "PER_KG") return { perKg, ...(minKg ? { minKg } : {}) };
    if (method === "WEIGHT_BRACKET")
      return {
        brackets: rows.map((row) => ({ uptoKg: row.upto, amount: row.amount })),
        extraPerKg,
      };
    return {
      brackets: rows.map((row) => ({
        uptoAmount: row.upto,
        ...(row.percent ? { percent: row.percent } : { amount: row.amount }),
      })),
    };
  }, [amount, extraPerKg, method, minKg, of, perKg, percent, rows]);

  const updateRow = (index: number, field: keyof Row, value: string) =>
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );

  return (
    <div className="grid gap-3 md:col-span-3 md:grid-cols-3">
      <Select
        name="method"
        value={method}
        onChange={(event) => {
          const next = event.target.value as FeeMethod;
          setMethod(next);
          if (next === "WEIGHT_BRACKET" || next === "VALUE_BRACKET")
            setRows(rowsFrom(initialParams, next));
        }}
      >
        <option value="FIXED">FIXED</option>
        <option value="PERCENT">PERCENT</option>
        <option value="PER_KG">PER_KG</option>
        <option value="WEIGHT_BRACKET">WEIGHT_BRACKET</option>
        <option value="VALUE_BRACKET">VALUE_BRACKET</option>
        <option value="PER_ITEM">PER_ITEM</option>
      </Select>
      {(method === "FIXED" || method === "PER_ITEM") && (
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={t("amount")}
          inputMode="decimal"
          required
        />
      )}
      {method === "PERCENT" && (
        <>
          <Input
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            placeholder={t("percent")}
            inputMode="decimal"
            required
          />
          <Select value={of} onChange={(event) => setOf(event.target.value)}>
            <option value="subtotal">{t("subtotal")}</option>
            <option value="subtotal_plus_shipping">
              {t("subtotalShipping")}
            </option>
            <option value="subtotal_plus_shipping_customs">
              {t("subtotalShippingCustoms")}
            </option>
          </Select>
        </>
      )}
      {method === "PER_KG" && (
        <>
          <Input
            value={perKg}
            onChange={(event) => setPerKg(event.target.value)}
            placeholder={t("perKg")}
            inputMode="decimal"
            required
          />
          <Input
            value={minKg}
            onChange={(event) => setMinKg(event.target.value)}
            placeholder={t("minKg")}
            inputMode="decimal"
          />
        </>
      )}
      {(method === "WEIGHT_BRACKET" || method === "VALUE_BRACKET") && (
        <div className="grid gap-2 md:col-span-3">
          {rows.map((row, index) => (
            <div className="grid gap-2 md:grid-cols-4" key={index}>
              <Input
                value={row.upto}
                onChange={(event) =>
                  updateRow(index, "upto", event.target.value)
                }
                placeholder={
                  method === "WEIGHT_BRACKET" ? t("uptoKg") : t("uptoAmount")
                }
                inputMode="decimal"
                required
              />
              <Input
                value={row.amount}
                onChange={(event) =>
                  updateRow(index, "amount", event.target.value)
                }
                placeholder={t("amount")}
                inputMode="decimal"
                required={!row.percent}
              />
              {method === "VALUE_BRACKET" && (
                <Input
                  value={row.percent}
                  onChange={(event) =>
                    updateRow(index, "percent", event.target.value)
                  }
                  placeholder={t("percentAlternative")}
                  inputMode="decimal"
                />
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setRows((current) =>
                    current.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
                disabled={rows.length === 1}
              >
                {t("removeBracket")}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setRows((current) => [
                ...current,
                { upto: "", amount: "", percent: "" },
              ])
            }
          >
            {t("addBracket")}
          </Button>
          {method === "WEIGHT_BRACKET" && (
            <Input
              value={extraPerKg}
              onChange={(event) => setExtraPerKg(event.target.value)}
              placeholder={t("extraPerKg")}
              inputMode="decimal"
              required
            />
          )}
        </div>
      )}
      <input type="hidden" name="params" value={JSON.stringify(params)} />
    </div>
  );
}
