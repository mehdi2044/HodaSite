// Browser-safe form conversion. Money remains text; only counts become numbers.
import { z } from "zod";
import type { PromotionRevision, PromotionSelector } from "./contracts";
export const emptySelector: PromotionSelector = {
  productIds: [],
  categoryIds: [],
  collectionIds: [],
  excludedProductIds: [],
  excludedCategoryIds: [],
  excludedCollectionIds: [],
};
export function initialConfig(
  now: string,
): Omit<PromotionRevision, "id" | "revision" | "marketId" | "currency"> {
  return {
    enabled: false,
    status: "DRAFT",
    startsAt: now,
    endsAt: null,
    priority: 0,
    group: "default",
    stacking: "EXCLUSIVE_GROUP",
    excludes: [],
    couponRequired: false,
    totalUsageCap: null,
    perCustomerCap: null,
    budget: null,
    definition: {
      version: 1,
      conditions: [],
      selector: emptySelector,
      effect: { type: "percent", percent: "10" },
      maxDiscount: null,
    },
  };
}
export const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const integer = (f: FormData, k: string) =>
  text(f, k) === "" ? null : z.coerce.number().int().parse(text(f, k));
export function utc(f: FormData, k: string) {
  const value = text(f, k);
  return value ? new Date(value + "Z").toISOString() : null;
}
export function editorInput(
  f: FormData,
  marketId: string,
  saved: { id: string; version: number } | undefined,
  definition: PromotionRevision["definition"],
  key: string,
) {
  const effectType = text(f, "effect");
  const effect =
    effectType === "percent"
      ? { type: effectType, percent: text(f, "percent") }
      : effectType === "fixed"
        ? { type: effectType, amount: text(f, "amount") }
        : effectType === "buyXGetY"
          ? { type: effectType, buy: integer(f, "buy"), get: integer(f, "get") }
          : effectType === "spendXGetY"
            ? {
                type: effectType,
                spend: text(f, "spend"),
                amount: text(f, "amount"),
                maxSets: integer(f, "maxSets"),
              }
            : { type: effectType };
  const copy = (k: string) =>
    Object.fromEntries(
      ["fa", "tr", "en"].map((l) => [l, text(f, `${k}.${l}`)]),
    );
  return {
    marketId,
    ...(saved ? { id: saved.id } : {}),
    expectedVersion: saved?.version ?? 0,
    mutationKey: key,
    confirmed: f.get("confirmed") === "on",
    name: text(f, "name"),
    description: text(f, "description"),
    category: text(f, "category"),
    ownerNotes: text(f, "ownerNotes"),
    titleI18n: copy("titleI18n"),
    descriptionI18n: copy("descriptionI18n"),
    config: {
      enabled: f.get("enabled") === "on",
      status: text(f, "status"),
      startsAt: utc(f, "startsAt"),
      endsAt: utc(f, "endsAt"),
      priority: integer(f, "priority"),
      group: text(f, "group"),
      stacking: text(f, "stacking"),
      excludes: f.getAll("excludes").map(String),
      couponRequired: f.get("couponRequired") === "on",
      totalUsageCap: integer(f, "totalUsageCap"),
      perCustomerCap: integer(f, "perCustomerCap"),
      budget: text(f, "budget") || null,
      definition: {
        ...definition,
        effect,
        maxDiscount: text(f, "maxDiscount") || null,
      },
    },
  };
}
