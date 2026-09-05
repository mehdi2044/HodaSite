import { getSiteSettings } from "@/modules/settings";
import { saveMaintenance } from "./actions";
import {
  Card,
  CardTitle,
  CardDescription,
  Input,
  Select,
} from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";

function toLocalInput(iso?: string) {
  if (!iso) return "";
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm", no timezone.
  return iso.slice(0, 16);
}

export default async function MaintenanceSettings() {
  const site = await getSiteSettings();
  const maintenance = (site?.maintenance ?? { state: "off" }) as {
    state?: string;
    message?: Record<string, string>;
    allowlistIps?: string[];
    startsAt?: string;
    endsAt?: string;
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">حالت تعمیرات</h1>
      <Card className="mt-4 max-w-lg">
        <SettingsForm action={saveMaintenance} submitLabel="ذخیره">
          <CardTitle>وضعیت</CardTitle>
          <CardDescription>
            وقتی روشن باشد، فروشگاه (به‌جز ادمین و آی‌پی‌های مجاز) صفحهٔ تعمیرات
            (۵۰۳) می‌بیند.
          </CardDescription>
          <label className="grid gap-1">
            حالت
            <Select name="state" defaultValue={maintenance.state ?? "off"}>
              <option value="off">خاموش</option>
              <option value="on">روشن</option>
              <option value="scheduled">زمان‌بندی‌شده</option>
            </Select>
          </label>

          <CardTitle className="mt-2">پیام</CardTitle>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              پیام ({locale})
              <Input
                name={`message${cap(locale)}`}
                defaultValue={maintenance.message?.[locale]}
              />
            </label>
          ))}

          <label className="grid gap-1">
            آی‌پی‌های مجاز
            <CardDescription>
              هر خط یک IP یا CIDR (مثل ۱۹۲.۱۶۸.۱.۱ یا ۱۰.۰.۰.۰/۲۴) — این‌ها
              صفحهٔ تعمیرات را نمی‌بینند.
            </CardDescription>
            <textarea
              name="allowlistIps"
              defaultValue={(maintenance.allowlistIps ?? []).join("\n")}
              rows={4}
              dir="ltr"
              className="rounded-[10px] border border-black/15 p-3 font-mono text-sm"
            />
          </label>

          <CardTitle className="mt-2">
            زمان‌بندی (فقط برای حالت «زمان‌بندی‌شده»)
          </CardTitle>
          <label className="grid gap-1">
            شروع
            <Input
              name="startsAt"
              type="datetime-local"
              defaultValue={toLocalInput(maintenance.startsAt)}
            />
          </label>
          <label className="grid gap-1">
            پایان
            <Input
              name="endsAt"
              type="datetime-local"
              defaultValue={toLocalInput(maintenance.endsAt)}
            />
          </label>
        </SettingsForm>
      </Card>
    </>
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
