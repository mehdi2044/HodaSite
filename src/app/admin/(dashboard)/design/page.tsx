import { getTranslations } from "next-intl/server";
import { DesignClient } from "./design-client";

export default async function Design() {
  const t = await getTranslations("AdminDesignBidi");

  return (
    <DesignClient
      bidi={{
        title: t("title"),
        descriptionBefore: t("descriptionBefore"),
        descriptionAfter: t("descriptionAfter"),
        sampleBefore: t("sampleBefore"),
        sampleAfter: t("sampleAfter"),
      }}
    />
  );
}
