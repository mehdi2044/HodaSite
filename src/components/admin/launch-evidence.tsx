import { getTranslations } from "next-intl/server";
import { EngagementForm } from "@/components/engagement/form";
import { MANUAL_GATES } from "@/modules/launch";
import { recordEvidenceAction } from "@/app/admin/(dashboard)/system/launch/actions";
export async function LaunchEvidenceForm({
  origin,
  revision,
}: {
  origin: string;
  revision: string;
}) {
  const t = await getTranslations("launchEvidence"),
    launch = await getTranslations("launch");
  return (
    <section className="card grid gap-4">
      <h2>{t("title")}</h2>
      <p>{t("hint")}</p>
      <EngagementForm action={recordEvidenceAction}>
        <label>
          {t("gate")}
          <select name="gate" className="input w-full">
            {MANUAL_GATES.map((gate) => (
              <option key={gate} value={gate}>
                {launch(`${gate}Title`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("environment")}
          <select name="environment" className="input w-full">
            {["local", "ci", "staging", "production"].map((env) => (
              <option key={env} value={env}>
                {t(env)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("origin")}
          <input
            className="input w-full"
            dir="ltr"
            name="origin"
            type="url"
            required
            defaultValue={origin}
            maxLength={2048}
          />
        </label>
        <label>
          {t("revision")}
          <input
            className="input w-full"
            dir="ltr"
            name="revision"
            required
            pattern="[0-9a-f]{40}"
            defaultValue={revision}
            maxLength={40}
          />
        </label>
        <label>
          {t("testedAt")}
          <input
            className="input w-full"
            name="testedAt"
            type="text"
            dir="ltr"
            placeholder="2026-09-15T12:00:00Z"
            required
          />
        </label>
        <label>
          {t("result")}
          <select name="result" className="input w-full">
            <option value="FAIL">{t("fail")}</option>
            <option value="PASS">{t("pass")}</option>
          </select>
        </label>
        <label>
          {t("reference")}
          <input
            className="input w-full"
            name="reference"
            minLength={8}
            maxLength={1000}
            required
          />
        </label>
        <label>
          {t("notes")}
          <textarea
            className="input w-full"
            name="notes"
            minLength={12}
            maxLength={3000}
            required
          />
        </label>
        <button className="button w-fit">{t("record")}</button>
      </EngagementForm>
    </section>
  );
}
