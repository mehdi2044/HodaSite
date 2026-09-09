"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Select } from "@/components/ui";

type Row = { size: string; chest: string; waist: string; hip: string };
const initial: Row[] = [
  { size: "S", chest: "88", waist: "70", hip: "94" },
  { size: "M", chest: "94", waist: "76", hip: "100" },
  { size: "L", chest: "100", waist: "82", hip: "106" },
];
export function SizeGuideEditor({
  initialUnit = "cm",
  initialTable,
}: {
  initialUnit?: "cm" | "in";
  initialTable?: unknown;
}) {
  const t = useTranslations("catalogAdmin");
  const existing = initialTable as { rows?: string[][] } | undefined;
  const [unit, setUnit] = useState<"cm" | "in">(initialUnit);
  const [rows, setRows] = useState<Row[]>(
    existing?.rows?.map((row) => ({
      size: row[0] ?? "",
      chest: row[1] ?? "",
      waist: row[2] ?? "",
      hip: row[3] ?? "",
    })) ?? initial,
  );
  function changeUnit(next: "cm" | "in") {
    if (next === unit) return;
    const factor = next === "in" ? 1 / 2.54 : 2.54;
    setRows(
      rows.map((row) => ({
        ...row,
        ...Object.fromEntries(
          (["chest", "waist", "hip"] as const).map((key) => [
            key,
            row[key]
              ? String(Math.round(Number(row[key]) * factor * 10) / 10)
              : "",
          ]),
        ),
      })),
    );
    setUnit(next);
  }
  const table = {
    columns: ["size", "chest", "waist", "hip"],
    rows: rows.map((row) => [row.size, row.chest, row.waist, row.hip]),
  };
  return (
    <fieldset className="grid gap-3 md:col-span-2">
      <legend>{t("sizeConversion")}</legend>
      <label>
        {t("unit")}
        <Select
          name="unit"
          value={unit}
          onChange={(event) => changeUnit(event.target.value as "cm" | "in")}
        >
          <option value="cm">{t("centimeter")}</option>
          <option value="in">{t("inch")}</option>
        </Select>
      </label>
      <input type="hidden" name="tableI18n" value={JSON.stringify(table)} />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>{t("size")}</th>
              <th>{t("chest")}</th>
              <th>{t("waist")}</th>
              <th>{t("hip")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {(["size", "chest", "waist", "hip"] as const).map((key) => (
                  <td key={key} className="p-1">
                    <Input
                      aria-label={`${key}-${index}`}
                      value={row[key]}
                      onChange={(event) =>
                        setRows(
                          rows.map((item, i) =>
                            i === index
                              ? { ...item, [key]: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                ))}
                <td>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    {t("remove")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() =>
          setRows([...rows, { size: "", chest: "", waist: "", hip: "" }])
        }
      >
        {t("addRow")}
      </Button>
    </fieldset>
  );
}
