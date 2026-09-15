import { getTranslations } from "next-intl/server";
import { getSiteSettings } from "@/modules/settings";
import { saveContact } from "./actions";
import { Card, CardTitle, Input } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function ContactSettings() {
  const legacy = await getTranslations("foundationAdmin");

  const site = await getSiteSettings();
  const contact = (site?.contact ?? {}) as {
    email?: string;
    phones?: Record<string, string>;
    address?: Record<string, string>;
    hours?: Record<string, string>;
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">{legacy("contact")}</h1>
      <Card className="mt-4 max-w-lg">
        <SettingsForm action={saveContact} submitLabel={legacy("save")}>
          <CardTitle>{legacy("emailPhone")}</CardTitle>
          <label className="grid gap-1">
            {" "}
            {legacy("email")}{" "}
            <Input name="email" type="email" defaultValue={contact.email} />
          </label>
          {(["IR", "TR", "CA"] as const).map((code) => (
            <label key={code} className="grid gap-1">
              {" "}
              {legacy("marketPhone", { market: code })}
              <Input
                name={`phone${code}`}
                defaultValue={contact.phones?.[code]}
                dir="ltr"
              />
            </label>
          ))}
          <CardTitle className="mt-2">{legacy("address")}</CardTitle>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("addressLocale", { locale })}
              <Input
                name={`address${cap(locale)}`}
                defaultValue={contact.address?.[locale]}
              />
            </label>
          ))}
          <CardTitle className="mt-2">{legacy("hours")}</CardTitle>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("hoursLocale", { locale })}
              <Input
                name={`hours${cap(locale)}`}
                defaultValue={contact.hours?.[locale]}
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
