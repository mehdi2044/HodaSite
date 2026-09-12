import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { getRuntimeMessages } from "@/modules/content/translations";
import { cookies } from "next/headers";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const preferred = (await cookies()).get("hoda.admin.locale")?.value;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : requested === undefined && hasLocale(routing.locales, preferred)
      ? preferred
      : routing.defaultLocale;

  return {
    locale,
    messages: await getRuntimeMessages(locale),
  };
});
