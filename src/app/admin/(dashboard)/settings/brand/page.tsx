import { db } from "@/lib/db";
import { getSiteSettings, getThemeSettings } from "@/modules/settings";
import { normalizeBrand } from "@/lib/brand";
import { saveBrand } from "./actions";
import { Card, CardTitle, CardDescription, Input } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { MediaPicker } from "@/components/admin/media-picker";
import { getTranslations } from "next-intl/server";

export default async function Brand() {
  const legacy = await getTranslations("foundationAdmin");

  const t = await getTranslations("media");
  const [site, theme] = await Promise.all([
    getSiteSettings(),
    getThemeSettings(),
  ]);
  // Accepts Phase 00's legacy flat shape too (backward-compat safety net
  // alongside the data migration — PR #4 review, P1).
  const { name, tagline } = normalizeBrand(site?.brand);

  const mediaIds = [
    theme?.logoMediaId,
    theme?.logoDarkMediaId,
    theme?.faviconMediaId,
    theme?.emailLogoMediaId,
  ].filter((id): id is string => Boolean(id));
  const media = mediaIds.length
    ? await db.media.findMany({ where: { id: { in: mediaIds } } })
    : [];
  const urlOf = (id?: string | null) => media.find((m) => m.id === id)?.url;

  return (
    <>
      <h1 className="text-2xl font-semibold">{legacy("brand")}</h1>
      <Card className="mt-4 grid max-w-lg gap-6">
        <SettingsForm action={saveBrand} submitLabel={legacy("save")}>
          <CardTitle>{legacy("brandNames")}</CardTitle>
          <CardDescription> {legacy("brandHelp")} </CardDescription>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("nameLocale", { locale })}
              <Input
                name={`name${cap(locale)}`}
                defaultValue={name[locale]}
                required
              />
            </label>
          ))}
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("taglineLocale", { locale })}
              <Input
                name={`tagline${cap(locale)}`}
                defaultValue={tagline[locale]}
              />
            </label>
          ))}

          <CardTitle className="mt-4">{legacy("logo")}</CardTitle>
          <MediaPicker
            name="logoMediaId"
            label={t("brandLogoLight")}
            defaultMediaId={theme?.logoMediaId}
            defaultUrl={urlOf(theme?.logoMediaId)}
          />
          <MediaPicker
            name="logoDarkMediaId"
            label={t("brandLogoDark")}
            defaultMediaId={theme?.logoDarkMediaId}
            defaultUrl={urlOf(theme?.logoDarkMediaId)}
          />
          <MediaPicker
            name="faviconMediaId"
            label={t("favicon")}
            defaultMediaId={theme?.faviconMediaId}
            defaultUrl={urlOf(theme?.faviconMediaId)}
          />
          <MediaPicker
            name="emailLogoMediaId"
            label={t("emailLogo")}
            defaultMediaId={theme?.emailLogoMediaId}
            defaultUrl={urlOf(theme?.emailLogoMediaId)}
          />
        </SettingsForm>
      </Card>
    </>
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
