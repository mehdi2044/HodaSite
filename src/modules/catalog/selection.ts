/** One initial real variant for gallery, amount and purchase controls. */
export function initialProductVariant<
  T extends {
    id: string;
    colorId: string;
    isActive: boolean;
    stockItems: { onHand: number; reserved: number }[];
  },
>(variants: T[], colorId?: string): T | undefined {
  const active = variants.filter((variant) => variant.isActive);
  const choices =
    colorId && active.some((variant) => variant.colorId === colorId)
      ? active.filter((variant) => variant.colorId === colorId)
      : active;
  return (
    choices.find(
      (variant) =>
        variant.stockItems.reduce(
          (sum, stock) => sum + stock.onHand - stock.reserved,
          0,
        ) > 0,
    ) ?? choices[0]
  );
}
