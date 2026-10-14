import Decimal from "decimal.js";
export type ScenePriceRange = { min: string; max: string };
export function scenePriceRange(
  values: readonly string[],
): ScenePriceRange | null {
  if (!values.length) return null;
  const prices = values.map((value) => new Decimal(value));
  return {
    min: Decimal.min(...prices).toString(),
    max: Decimal.max(...prices).toString(),
  };
}
