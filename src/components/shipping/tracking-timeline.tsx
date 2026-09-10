"use client";
import { useLocale, useTranslations } from "next-intl";
import type { TrackingView } from "@/modules/shipping/tracking";
export function TrackingTimeline({ value }: { value: TrackingView }) {
  const t = useTranslations("shipping"),
    locale = useLocale();
  return (
    <section className="grid gap-4" data-testid="tracking-timeline">
      <h2 className="text-xl font-semibold">{t("tracking")}</h2>
      {!value.shipments.length && <p>{t("noShipments")}</p>}
      {value.shipments.map((s, i) => (
        <article key={s.id} className="card grid gap-4">
          <h3 className="font-semibold">
            {t("parcelIndex", { n: i + 1 })} ·{" "}
            {s.nameI18n[locale] ?? s.nameI18n.en}
          </h3>
          <p>{t(s.status)}</p>
          <ol className="grid gap-5 border-s-2 border-primary ps-4">
            {s.legs.map((l) => (
              <li key={l.id} className="grid gap-2">
                <h4 className="font-semibold">
                  {l.labelI18n[locale] ?? l.labelI18n.en}
                </h4>
                <p>
                  {t(l.status)} · {l.carrierName} {l.service}
                </p>
                {l.trackingNumber && (
                  <p>
                    {t("trackingNumber")}:{" "}
                    <bdi dir="ltr">{l.trackingNumber}</bdi>
                  </p>
                )}
                {l.trackingUrl && (
                  <a
                    className="underline"
                    href={l.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("carrierLink")}
                  </a>
                )}
                {(["shippedAt", "eta", "deliveredAt"] as const).map(
                  (k) =>
                    l[k] && (
                      <p key={k}>
                        {t(k)}:{" "}
                        <time dateTime={l[k]!}>
                          {new Date(l[k]!).toLocaleString(locale, {
                            timeZone: "UTC",
                          })}{" "}
                          UTC
                        </time>
                      </p>
                    ),
                )}
                {l.events.map((e) => (
                  <p key={e.id} className="text-sm text-muted">
                    <time dateTime={e.at}>
                      {new Date(e.at).toLocaleString(locale, {
                        timeZone: "UTC",
                      })}{" "}
                      UTC
                    </time>{" "}
                    · {t(e.status)} {e.description}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </section>
  );
}
