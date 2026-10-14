"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PublicCampaign } from "@/modules/content/campaigns";
export function ModaCampaign({
  campaign,
  content,
  popup,
  popupKey,
  countdown,
  preview = false,
}: {
  campaign: PublicCampaign;
  content: ReactNode;
  popup?: { enabled: boolean; delaySeconds: number; frequencyHours: number };
  popupKey: string;
  countdown: boolean;
  preview?: boolean;
}) {
  const t = useTranslations("modaHomepage"),
    dialog = useRef<HTMLDialogElement>(null);
  const [remaining, setRemaining] = useState<number | null>(null),
    [ended, setEnded] = useState(campaign.state === "ENDED");
  useEffect(() => {
    const server = Date.parse(campaign.now),
      beginning = performance.now();
    const tick = () => {
      const now = server + performance.now() - beginning;
      const target =
        campaign.state === "UPCOMING"
          ? Date.parse(campaign.startsAt)
          : campaign.endsAt
            ? Date.parse(campaign.endsAt)
            : null;
      setRemaining(
        target === null ? null : Math.max(0, Math.ceil((target - now) / 1000)),
      );
      setEnded(
        campaign.state === "ENDED" ||
          (campaign.endsAt !== null && now >= Date.parse(campaign.endsAt)),
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [campaign.now, campaign.startsAt, campaign.endsAt, campaign.state]);
  useEffect(() => {
    if (!popup?.enabled || preview || campaign.state !== "ACTIVE" || ended)
      return;
    let last = 0;
    try {
      const raw = localStorage.getItem(popupKey);
      last = raw ? Number(raw) : 0;
    } catch {
      /* Optional UI preference; no request or tracking fallback. */
    }
    if (
      Number.isFinite(last) &&
      last > 0 &&
      Date.now() - last < popup.frequencyHours * 3600000
    )
      return;
    const timer = setTimeout(() => {
      if (
        document.hidden ||
        !dialog.current?.isConnected ||
        dialog.current.open
      )
        return;
      try {
        localStorage.setItem(popupKey, String(Date.now()));
      } catch {
        /* This mounted dialog is still shown only once. */
      }
      dialog.current.showModal();
    }, popup.delaySeconds * 1000);
    return () => clearTimeout(timer);
  }, [
    popup?.enabled,
    popup?.delaySeconds,
    popup?.frequencyHours,
    popupKey,
    preview,
    campaign.state,
    ended,
  ]);
  useEffect(() => {
    if (ended && dialog.current?.open) dialog.current.close();
  }, [ended]);
  if (ended || campaign.state === "EXHAUSTED")
    return preview ? (
      <p role="status">
        {t(campaign.state === "EXHAUSTED" ? "exhausted" : "ended")}
      </p>
    ) : null;
  return (
    <section className="moda-campaign" data-campaign-state={campaign.state}>
      {campaign.state === "UPCOMING" && <p>{t("upcoming")}</p>}
      {content}
      {campaign.conditional && (
        <p className="moda-campaign-conditions">{t("conditional")}</p>
      )}
      <p className="moda-campaign-conditions">{t("quoteAuthority")}</p>
      {countdown && remaining !== null && (
        <p className="moda-countdown" role="timer" aria-label={t("remaining")}>
          <bdi>
            {new Intl.NumberFormat().format(Math.floor(remaining / 86400))}{" "}
            {t("days")} ·{" "}
            {String(Math.floor(remaining / 3600) % 24).padStart(2, "0")}:
            {String(Math.floor(remaining / 60) % 60).padStart(2, "0")}:
            {String(remaining % 60).padStart(2, "0")}
          </bdi>
        </p>
      )}
      {popup?.enabled && !preview && (
        <dialog
          ref={dialog}
          className="moda-campaign-popup"
          aria-label={t("campaign")}
        >
          <button
            type="button"
            className="button button-outline"
            onClick={() => dialog.current?.close()}
            aria-label={t("close")}
          >
            {t("close")}
          </button>
          {/* Avoid duplicate scene IDs/cart forms in an optional popup. */}
          <p>{t("campaignAvailable")}</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              dialog.current?.close();
              dialog.current?.parentElement?.scrollIntoView({
                behavior: "instant",
                block: "start",
              });
            }}
          >
            {t("viewCampaign")}
          </button>
        </dialog>
      )}
    </section>
  );
}
