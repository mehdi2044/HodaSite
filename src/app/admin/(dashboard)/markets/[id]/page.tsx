import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { saveMarket } from "../actions";
import {
  Card,
  CardTitle,
  CardDescription,
  Input,
  Select,
} from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";

const NAMES: Record<string, string> = {
  IR: "ایران",
  TR: "ترکیه",
  CA: "کانادا",
};
const LOCALE_LABELS: Record<string, string> = {
  fa: "فارسی",
  tr: "Türkçe",
  en: "English",
};

export default async function EditMarket({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const market = await db.market.findUnique({ where: { id } });
  if (!market) notFound();

  const supportChannels = (market.supportChannels ?? {}) as Record<
    string,
    string
  >;
  const announcementBar = (market.announcementBar ?? {}) as {
    enabled?: boolean;
    link?: string;
    text?: Record<string, string>;
  };
  const seo = (market.seo ?? {}) as {
    title?: Record<string, string>;
    description?: Record<string, string>;
  };
  const roundingRule = market.roundingRule as {
    mode?: string;
    increment?: string;
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">
        بازار {NAMES[market.code] ?? market.code}
      </h1>
      <Card className="mt-4 max-w-lg">
        <SettingsForm action={saveMarket} submitLabel="ذخیره">
          <input type="hidden" name="marketId" value={market.id} />

          <CardTitle>وضعیت</CardTitle>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={market.isActive}
            />
            بازار فعال است
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="salesPaused"
              defaultChecked={market.salesPaused}
            />
            فروش موقتاً متوقف باشد
          </label>

          <CardTitle className="mt-2">زبان‌ها</CardTitle>
          <CardDescription>
            زبان‌های فعال این بازار و زبان پیش‌فرض آن.
          </CardDescription>
          <div className="flex flex-wrap gap-4">
            {(["fa", "tr", "en"] as const).map((locale) => (
              <label key={locale} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="enabledLocales"
                  value={locale}
                  defaultChecked={market.enabledLocales.includes(locale)}
                />
                {LOCALE_LABELS[locale]}
              </label>
            ))}
          </div>
          <label className="grid gap-1">
            زبان پیش‌فرض
            <Select name="defaultLocale" defaultValue={market.defaultLocale}>
              <option value="fa">فارسی</option>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </Select>
          </label>

          <CardTitle className="mt-2">کانال‌های پشتیبانی</CardTitle>
          <label className="grid gap-1">
            تلفن
            <Input
              name="phone"
              dir="ltr"
              defaultValue={supportChannels.phone}
            />
          </label>
          <label className="grid gap-1">
            واتساپ
            <Input
              name="whatsapp"
              dir="ltr"
              defaultValue={supportChannels.whatsapp}
            />
          </label>
          <label className="grid gap-1">
            تلگرام
            <Input
              name="telegram"
              dir="ltr"
              defaultValue={supportChannels.telegram}
            />
          </label>
          <label className="grid gap-1">
            ایمیل
            <Input
              name="email"
              dir="ltr"
              defaultValue={supportChannels.email}
            />
          </label>

          <CardTitle className="mt-2">
            پیام بالای سایت (Announcement bar)
          </CardTitle>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="announcementEnabled"
              defaultChecked={announcementBar.enabled}
            />
            نمایش داده شود
          </label>
          <label className="grid gap-1">
            لینک (اختیاری)
            <Input
              name="announcementLink"
              dir="ltr"
              defaultValue={announcementBar.link}
            />
          </label>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              متن ({locale})
              <Input
                name={`announcement${cap(locale)}`}
                defaultValue={announcementBar.text?.[locale]}
              />
            </label>
          ))}

          <CardTitle className="mt-2">SEO پیش‌فرض</CardTitle>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              عنوان ({locale})
              <Input
                name={`seoTitle${cap(locale)}`}
                defaultValue={seo.title?.[locale]}
              />
            </label>
          ))}
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              توضیح ({locale})
              <Input
                name={`seoDescription${cap(locale)}`}
                defaultValue={seo.description?.[locale]}
              />
            </label>
          ))}

          <CardTitle className="mt-2">
            قیمت‌گذاری (فقط نمایش — فاز ۰۳)
          </CardTitle>
          <p className="text-sm text-muted" dir="ltr">
            markup: {market.markupPercent.toString()}% · rounding:{" "}
            {roundingRule?.mode ?? "-"} / {roundingRule?.increment ?? "-"} ·
            hold: {market.holdHours}h · deadline: {market.paymentDeadlineHours}h
          </p>
        </SettingsForm>
      </Card>
    </>
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
