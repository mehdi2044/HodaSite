import { getTranslations } from "next-intl/server";
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

export default async function EditMarket({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const legacy = await getTranslations("foundationAdmin");
  const NAMES: Record<string, string> = {
    IR: legacy("iran"),
    TR: legacy("turkey"),
    CA: legacy("canada"),
  };
  const LOCALE_LABELS: Record<string, string> = {
    fa: legacy("persian"),
    tr: legacy("turkish"),
    en: legacy("english"),
  };
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
        {" "}
        {legacy("market")} {NAMES[market.code] ?? market.code}
      </h1>
      <Card className="mt-4 max-w-lg">
        <SettingsForm action={saveMarket} submitLabel={legacy("save")}>
          <input type="hidden" name="marketId" value={market.id} />

          <CardTitle>{legacy("status")}</CardTitle>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={market.isActive}
            />{" "}
            {legacy("marketActive")}{" "}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="salesPaused"
              defaultChecked={market.salesPaused}
            />{" "}
            {legacy("pauseSales")}{" "}
          </label>

          <CardTitle className="mt-2">{legacy("languages")}</CardTitle>
          <CardDescription> {legacy("languagesHelp")} </CardDescription>
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
            {" "}
            {legacy("defaultLocale")}{" "}
            <Select name="defaultLocale" defaultValue={market.defaultLocale}>
              <option value="fa">{legacy("persian")}</option>
              <option value="tr">{legacy("turkish")}</option>
              <option value="en">{legacy("english")}</option>
            </Select>
          </label>

          <CardTitle className="mt-2">{legacy("support")}</CardTitle>
          <label className="grid gap-1">
            {" "}
            {legacy("phone")}{" "}
            <Input
              name="phone"
              dir="ltr"
              defaultValue={supportChannels.phone}
            />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("whatsapp")}{" "}
            <Input
              name="whatsapp"
              dir="ltr"
              defaultValue={supportChannels.whatsapp}
            />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("telegram")}{" "}
            <Input
              name="telegram"
              dir="ltr"
              defaultValue={supportChannels.telegram}
            />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("email")}{" "}
            <Input
              name="email"
              dir="ltr"
              defaultValue={supportChannels.email}
            />
          </label>

          <CardTitle className="mt-2"> {legacy("announcement")} </CardTitle>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="announcementEnabled"
              defaultChecked={announcementBar.enabled}
            />{" "}
            {legacy("visible")}{" "}
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("optionalLink")}{" "}
            <Input
              name="announcementLink"
              dir="ltr"
              defaultValue={announcementBar.link}
            />
          </label>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("textLocale", { locale })}
              <Input
                name={`announcement${cap(locale)}`}
                defaultValue={announcementBar.text?.[locale]}
              />
            </label>
          ))}

          <CardTitle className="mt-2">{legacy("seo")}</CardTitle>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("titleLocale", { locale })}
              <Input
                name={`seoTitle${cap(locale)}`}
                defaultValue={seo.title?.[locale]}
              />
            </label>
          ))}
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("descriptionLocale", { locale })}
              <Input
                name={`seoDescription${cap(locale)}`}
                defaultValue={seo.description?.[locale]}
              />
            </label>
          ))}

          <CardTitle className="mt-2"> {legacy("pricingReadOnly")} </CardTitle>
          <p className="text-sm text-muted">
            {legacy("pricingSummary", {
              markup: market.markupPercent.toString(),
              mode: roundingRule?.mode ?? "-",
              increment: roundingRule?.increment ?? "-",
              hold: market.holdHours,
              deadline: market.paymentDeadlineHours,
            })}
          </p>
        </SettingsForm>
      </Card>
    </>
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
