import { getSiteSettings } from "@/modules/settings";
import { saveSocial } from "./actions";
import { SOCIAL_KEYS } from "./social-keys";
import { Card, CardTitle, CardDescription, Input } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";

const LABELS: Record<string, string> = {
  instagram: "اینستاگرام",
  telegram: "تلگرام",
  whatsapp: "واتساپ",
  x: "X (توییتر)",
  tiktok: "تیک‌تاک",
  youtube: "یوتیوب",
  linkedin: "لینکدین",
};

export default async function SocialSettings() {
  const site = await getSiteSettings();
  const social = (site?.social ?? {}) as Record<string, string>;

  return (
    <>
      <h1 className="text-2xl font-semibold">شبکه‌های اجتماعی</h1>
      <Card className="mt-4 max-w-lg">
        <SettingsForm action={saveSocial} submitLabel="ذخیره">
          <CardTitle>لینک‌ها</CardTitle>
          <CardDescription>
            خالی بگذارید تا آن شبکه در فوتر نمایش داده نشود.
          </CardDescription>
          {SOCIAL_KEYS.map((key) => (
            <label key={key} className="grid gap-1">
              {LABELS[key]}
              <Input
                name={key}
                type="url"
                dir="ltr"
                defaultValue={social[key] ?? ""}
                placeholder="https://…"
              />
            </label>
          ))}
        </SettingsForm>
      </Card>
    </>
  );
}
