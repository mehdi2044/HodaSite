import Decimal from "decimal.js";
export function jsonLdText(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
export function schemaOffer(
  amount: string,
  currency: string,
  available: boolean,
  url?: string,
  sku?: string,
) {
  return {
    "@type": "Offer",
    priceCurrency: currency === "IRT" ? "IRR" : currency,
    price: new Decimal(amount).mul(currency === "IRT" ? 10 : 1).toFixed(),
    availability: `https://schema.org/${available ? "InStock" : "OutOfStock"}`,
    url,
    sku,
  };
}
export function productGraph(input: {
  name: string;
  description: string;
  images: string[];
  brand?: string;
  url?: string;
  category: { name: string; url?: string };
  offers: ReturnType<typeof schemaOffer>[];
  rating: { count: number; rating: number | null };
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: input.name,
        description: input.description,
        image: input.images,
        url: input.url,
        brand: input.brand
          ? { "@type": "Brand", name: input.brand }
          : undefined,
        offers: input.offers.length ? input.offers : undefined,
        ...(input.rating.count > 0 && input.rating.rating !== null
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: input.rating.rating.toFixed(2),
                reviewCount: input.rating.count,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: input.category.name,
            item: input.category.url,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: input.name,
            item: input.url,
          },
        ],
      },
    ],
  };
}
