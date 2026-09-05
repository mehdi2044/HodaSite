"use client";
import { useActionState, useState } from "react";
import { Button, Card, CardTitle, Input, Select } from "@/components/ui";
import { saveSocial } from "./actions";
import {
  SOCIAL_KEYS,
  MARKET_CODES,
  type SocialByMarket,
  type MarketCode,
} from "@/lib/social";

const MARKET_NAMES: Record<MarketCode, string> = {
  IR: "ایران",
  TR: "ترکیه",
  CA: "کانادا",
};
const LABELS: Record<string, string> = {
  instagram: "اینستاگرام",
  telegram: "تلگرام",
  whatsapp: "واتساپ",
  x: "X (توییتر)",
  tiktok: "تیک‌تاک",
  youtube: "یوتیوب",
  linkedin: "لینکدین",
};

export function SocialEditor({ initial }: { initial: SocialByMarket }) {
  const [state, formAction, pending] = useActionState(saveSocial, null);
  const [draft, setDraft] = useState<SocialByMarket>(initial);

  function setField(market: MarketCode, key: string, value: string) {
    setDraft((d) => ({ ...d, [market]: { ...d[market], [key]: value } }));
  }

  function copyFrom(target: MarketCode, source: MarketCode) {
    setDraft((d) => ({ ...d, [target]: { ...d[source] } }));
  }

  return (
    <form action={formAction} className="grid gap-6">
      {MARKET_CODES.map((market) => (
        <Card key={market} className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>بازار {MARKET_NAMES[market]}</CardTitle>
            <label className="flex items-center gap-2 text-sm">
              کپی از
              <Select
                defaultValue=""
                onChange={(e) => {
                  const source = e.target.value as MarketCode | "";
                  if (source) copyFrom(market, source);
                  e.target.value = "";
                }}
                className="w-auto"
              >
                <option value="" disabled>
                  انتخاب بازار…
                </option>
                {MARKET_CODES.filter((m) => m !== market).map((m) => (
                  <option key={m} value={m}>
                    {MARKET_NAMES[m]}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {SOCIAL_KEYS.map((key) => (
            <label key={key} className="grid gap-1">
              {LABELS[key]}
              <Input
                name={`${market}_${key}`}
                type="url"
                dir="ltr"
                value={draft[market]?.[key] ?? ""}
                onChange={(e) => setField(market, key, e.target.value)}
                placeholder="https://…"
              />
            </label>
          ))}
        </Card>
      ))}

      {state && !state.ok && (
        <p role="alert" style={{ color: "var(--error)" }}>
          {state.message}
        </p>
      )}
      {state?.ok && (
        <p role="status" style={{ color: "var(--success)" }}>
          ذخیره شد.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "در حال ذخیره…" : "ذخیره"}
      </Button>
    </form>
  );
}
