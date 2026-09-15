import { getTranslations } from "next-intl/server";
import { getSiteSettings } from "@/modules/settings";
import { saveLegal } from "./actions";
import { Card, CardTitle, Input } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function LegalSettings() {
  const legacy = await getTranslations("foundationAdmin");

  const site = await getSiteSettings();
  const legal = (site?.legal ?? {}) as {
    companyName?: string;
    registrationNo?: string;
    taxNo?: string;
    footerLine?: Record<string, string>;
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">{legacy("legal")}</h1>
      <Card className="mt-4 max-w-lg">
        <SettingsForm action={saveLegal} submitLabel={legacy("save")}>
          <CardTitle>{legacy("company")}</CardTitle>
          <label className="grid gap-1">
            {" "}
            {legacy("companyName")}{" "}
            <Input name="companyName" defaultValue={legal.companyName} />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("registration")}{" "}
            <Input
              name="registrationNo"
              dir="ltr"
              defaultValue={legal.registrationNo}
            />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("taxNumber")}{" "}
            <Input name="taxNo" dir="ltr" defaultValue={legal.taxNo} />
          </label>
          <CardTitle className="mt-2">{legacy("footerLine")}</CardTitle>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("textLocale", { locale })}
              <Input
                name={`footerLine${cap(locale)}`}
                defaultValue={legal.footerLine?.[locale]}
              />
            </label>
          ))}
        </SettingsForm>
      </Card>
    </>
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
