import { Iso } from "./iso";
import { formatStorefrontAmount } from "@/modules/catalog/format";
export function DiscountLines({
  lines,
  currency,
  locale,
}: {
  lines: readonly { title: string; amount: string }[];
  currency: string;
  locale?: string;
}) {
  return lines.map((line, index) => (
    <div
      key={index}
      className="flex justify-between gap-3 text-success"
      data-testid="discount-line"
    >
      <dt className="min-w-0 break-words">{line.title}</dt>
      <dd className="shrink-0">
        <Iso>
          −
          {locale
            ? formatStorefrontAmount(line.amount, currency, locale)
            : `${line.amount} ${currency}`}
        </Iso>
      </dd>
    </div>
  ));
}
