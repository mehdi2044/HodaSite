/** Price and selection responses belong to the page's verified context. */
export type FittingMarketContext = {
  marketId: string;
  currency: string;
  locale: string;
};

export function sameFittingMarket(
  page: FittingMarketContext,
  response: FittingMarketContext,
) {
  return (
    page.marketId === response.marketId &&
    page.currency === response.currency &&
    page.locale === response.locale
  );
}
