"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { addCuratedLook } from "@/modules/editorial/commerce";
import {
  editorialId,
  locales,
  type EditorialLocale,
} from "@/modules/editorial/contracts";

export async function addCuratedLookAction(
  locale: EditorialLocale,
  id: string,
  revisionId: string,
  ids: string[],
) {
  try {
    if (!locales.includes(locale)) throw new ZodError([]);
    await addCuratedLook(
      locale,
      editorialId.parse(id),
      editorialId.parse(revisionId),
      ids,
    );
    revalidatePath(`/${locale}/cart`);
    revalidatePath(`/${locale}/checkout`);
    return { ok: true as const };
  } catch {
    // The existing cart quote can reject a live stock or pricing change.
    const t = await getTranslations("editorial");
    return { ok: false as const, message: t("purchaseError") };
  }
}
