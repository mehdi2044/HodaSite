import { getTranslations } from "next-intl/server";
import {
  currentServicePolicy,
  SERVICE_KEYS,
} from "@/modules/content/service-policy";
import { resolveContentTarget } from "@/modules/content/moda4-targets";
import { localizedValue } from "@/modules/content/homepage";
import { formatStorefrontAmount } from "@/modules/catalog/format";
export async function ServicePolicySummary({
  marketId,
  locale,
  keys = [...SERVICE_KEYS],
  compact = false,
}: {
  marketId: string;
  locale: "fa" | "tr" | "en";
  keys?: (typeof SERVICE_KEYS)[number][];
  compact?: boolean;
}) {
  const data = await currentServicePolicy(marketId);
  if (!data) return null;
  const t = await getTranslations("modaHomepage"),
    policy = data.policy;
  const faq = policy?.faqPageId
    ? await resolveContentTarget(
        { kind: "page", id: policy.faqPageId },
        marketId,
        locale,
      )
    : null;
  return (
    <section
      data-testid="market-service-policy"
      data-policy-market={data.code}
      className={compact ? "moda-policy-compact" : "moda-services-policy"}
    >
      {keys.map((key) => {
        const copy = policy?.[key];
        return (
          <article key={key}>
            {!compact && (
              <h3>
                {(copy && localizedValue(copy.title, locale)) ||
                  t(`service_${key}`)}
              </h3>
            )}
            <p>
              {(copy && localizedValue(copy.body, locale)) ||
                (key === "returns"
                  ? t(
                      data.returns?.enabled
                        ? "returnsDays"
                        : "returnsUnavailable",
                      { days: data.returns?.days ?? 0 },
                    )
                  : t(`serviceBody_${key}`))}
            </p>
            {key === "shipping" &&
              data.rules.map((rule) => (
                <p key={rule.id} className="moda-shipping-rule">
                  <span>
                    {localizedValue(
                      rule.label as Record<"fa" | "tr" | "en", string>,
                      locale,
                    )}
                  </span>
                  {["USD", "TRY", "CAD", "IRT"].includes(rule.currency) && (
                    <>
                      {rule.minAmount && (
                        <span>
                          {" "}
                          ·{" "}
                          {t("ruleFrom", {
                            amount: formatStorefrontAmount(
                              rule.minAmount,
                              rule.currency,
                              locale,
                            ),
                          })}
                        </span>
                      )}
                      {rule.maxAmount && (
                        <span>
                          {" "}
                          ·{" "}
                          {t("ruleUntil", {
                            amount: formatStorefrontAmount(
                              rule.maxAmount,
                              rule.currency,
                              locale,
                            ),
                          })}
                        </span>
                      )}
                    </>
                  )}
                  <span>
                    {" "}
                    · {t(rule.absorbed ? "ruleAbsorbed" : "ruleAtCheckout")}
                  </span>
                  {rule.conditional && <span> · {t("ruleConditional")}</span>}
                </p>
              ))}
            {key === "returns" && copy && (
              <p>
                {t(
                  data.returns?.enabled ? "returnsDays" : "returnsUnavailable",
                  { days: data.returns?.days ?? 0 },
                )}
              </p>
            )}
          </article>
        );
      })}
      {faq && (
        <a href={faq} className="underline min-h-11 inline-flex items-center">
          {t("serviceDetails")}
        </a>
      )}
    </section>
  );
}
