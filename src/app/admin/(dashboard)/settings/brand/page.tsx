import { db } from "@/lib/db";
import { getSiteSettings, getThemeSettings } from "@/modules/settings";
import { saveBrand } from "./actions";
import { Card, CardTitle, CardDescription, Input } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { MediaUploadField } from "@/components/admin/media-upload-field";

export default async function Brand() {
  const [site, theme] = await Promise.all([
    getSiteSettings(),
    getThemeSettings(),
  ]);
  const brand = (site?.brand ?? {}) as {
    name?: Record<string, string>;
    tagline?: Record<string, string>;
  };
  const name = brand.name ?? {};
  const tagline = brand.tagline ?? {};

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
      <h1 className="text-2xl font-semibold">هویت برند</h1>
      <Card className="mt-4 grid max-w-lg gap-6">
        <SettingsForm action={saveBrand} submitLabel="ذخیره">
          <CardTitle>نام و شعار سایت</CardTitle>
          <CardDescription>
            سه‌زبانه — روی فروشگاه و عنوان صفحات نمایش داده می‌شود.
          </CardDescription>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              نام سایت ({locale})
              <Input
                name={`name${cap(locale)}`}
                defaultValue={name[locale]}
                required
              />
            </label>
          ))}
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              شعار ({locale})
              <Input
                name={`tagline${cap(locale)}`}
                defaultValue={tagline[locale]}
              />
            </label>
          ))}

          <CardTitle className="mt-4">لوگو</CardTitle>
          <MediaUploadField
            name="logoMediaId"
            label="لوگو (روشن)"
            defaultMediaId={theme?.logoMediaId}
            defaultUrl={urlOf(theme?.logoMediaId)}
          />
          <MediaUploadField
            name="logoDarkMediaId"
            label="لوگو (تیره)"
            defaultMediaId={theme?.logoDarkMediaId}
            defaultUrl={urlOf(theme?.logoDarkMediaId)}
          />
          <MediaUploadField
            name="faviconMediaId"
            label="فاویکون"
            defaultMediaId={theme?.faviconMediaId}
            defaultUrl={urlOf(theme?.faviconMediaId)}
          />
          <MediaUploadField
            name="emailLogoMediaId"
            label="لوگوی ایمیل"
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
