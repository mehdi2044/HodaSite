import { getTranslations } from "next-intl/server";
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
  const legacy = await getTranslations("foundationAdmin");

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
      <h1 className="text-2xl font-semibold">{legacy("maintenance")}</h1>
      <Card className="mt-4 max-w-lg">
        <SettingsForm action={saveMaintenance} submitLabel={legacy("save")}>
          <CardTitle>{legacy("status")}</CardTitle>
          <CardDescription> {legacy("maintenanceHelp")} </CardDescription>
          <label className="grid gap-1">
            {" "}
            {legacy("mode")}{" "}
            <Select name="state" defaultValue={maintenance.state ?? "off"}>
              <option value="off">{legacy("off")}</option>
              <option value="on">{legacy("on")}</option>
              <option value="scheduled">{legacy("scheduled")}</option>
            </Select>
          </label>

          <CardTitle className="mt-2">{legacy("message")}</CardTitle>
          {(["fa", "tr", "en"] as const).map((locale) => (
            <label key={locale} className="grid gap-1">
              {" "}
              {legacy("messageLocale", { locale })}
              <Input
                name={`message${cap(locale)}`}
                defaultValue={maintenance.message?.[locale]}
              />
            </label>
          ))}

          <label className="grid gap-1">
            {" "}
            {legacy("allowedIps")}{" "}
            <CardDescription> {legacy("allowedIpsHelp")} </CardDescription>
            <textarea
              name="allowlistIps"
              defaultValue={(maintenance.allowlistIps ?? []).join("\n")}
              rows={4}
              dir="ltr"
              className="rounded-[10px] border border-black/15 p-3 font-mono text-sm"
            />
          </label>

          <CardTitle className="mt-2"> {legacy("schedule")} </CardTitle>
          <label className="grid gap-1">
            {" "}
            {legacy("start")}{" "}
            <Input
              name="startsAt"
              type="datetime-local"
              defaultValue={toLocalInput(maintenance.startsAt)}
            />
          </label>
          <label className="grid gap-1">
            {" "}
            {legacy("end")}{" "}
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
