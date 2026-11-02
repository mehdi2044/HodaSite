import { Iso } from "./iso";
import {
  formatCartAmount,
  formatStorefrontAmount,
} from "@/modules/catalog/format";
export function DiscountLines({
  lines,
  currency,
  locale,
  cartDisplay = false,
}: {
  lines: readonly { title: string; amount: string }[];
  currency: string;
  locale?: string;
  cartDisplay?: boolean;
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
            ? (cartDisplay ? formatCartAmount : formatStorefrontAmount)(
                line.amount,
                currency,
                locale,
              )
            : `${line.amount} ${currency}`}
        </Iso>
      </dd>
    </div>
  ));
}
