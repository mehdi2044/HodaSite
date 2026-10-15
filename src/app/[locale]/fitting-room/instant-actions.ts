"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getRequestContext } from "@/lib/request-context";
import { MaintenanceError } from "@/lib/mutation-gate";
import { FittingError } from "@/modules/fitting/contracts";
import {
  resolveInstantSelection,
  instantCatalog,
  saveInstantLook,
  mutateInstantLook,
  addInstantItems,
  instantLooks,
} from "@/modules/fitting/instant";
const localeSchema = z.enum(["fa", "tr", "en"]);
async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof FittingError
          ? e.code
          : e instanceof z.ZodError
            ? "INVALID_SELECTION"
            : e instanceof MaintenanceError
              ? "MAINTENANCE"
              : "REQUEST_UNKNOWN",
    };
  }
}
export async function previewInstant(locale: string, input: unknown) {
  return safe(async () => {
    const l = localeSchema.parse(locale),
      { market } = await getRequestContext(l);
    return resolveInstantSelection(market.id, input);
  });
}
export async function loadInstantCatalog(locale: string, input: unknown) {
  return safe(async () => {
    const l = localeSchema.parse(locale),
      { market } = await getRequestContext(l);
    const v = z
      .object({
        query: z.string().max(100).default(""),
        productId: z.string().min(1).max(100).optional(),
        after: z.string().min(1).max(100).optional(),
        afterProduct: z.string().min(1).max(100).optional(),
        variantIds: z
          .array(z.string().min(1).max(100))
          .min(1)
          .max(4)
          .optional(),
      })
      .strict()
      .parse(input);
    return instantCatalog(market.id, l, v.query, v);
  });
}
export async function saveInstant(locale: string, input: unknown) {
  return safe(async () => {
    const l = localeSchema.parse(locale);
    const result = await saveInstantLook(l, input);
    revalidatePath(`/${l}/account`);
    revalidatePath(`/${l}/fitting-room`);
    return result;
  });
}
export async function changeInstant(locale: string, input: unknown) {
  return safe(async () => {
    const l = localeSchema.parse(locale);
    const result = await mutateInstantLook(l, input);
    revalidatePath(`/${l}/account`);
    revalidatePath(`/${l}/fitting-room`);
    return result;
  });
}
export async function buyInstant(locale: string, input: unknown) {
  return safe(async () => {
    const l = localeSchema.parse(locale);
    await addInstantItems(l, input);
    revalidatePath(`/${l}/cart`);
    return {};
  });
}
export async function loadInstantWardrobe(locale: string, input: unknown) {
  return safe(async () => {
    const l = localeSchema.parse(locale);
    const v = z
      .object({
        archived: z.boolean(),
        after: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
      })
      .strict()
      .parse(input);
    return instantLooks(l, v.archived, v.after);
  });
}
