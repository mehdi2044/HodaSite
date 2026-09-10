"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { publicTrackingAction } from "@/app/[locale]/tracking/actions";
import type { TrackingView } from "@/modules/shipping/tracking";
import { TrackingTimeline } from "./tracking-timeline";
export function PublicTracking() {
  const t = useTranslations("shipping");
  // React resets uncontrolled action forms after success. Search criteria must
  // remain editable for another lookup, including a rejected email correction.
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState(
    async (
      _: { tracking: TrackingView | null; searched: boolean },
      form: FormData,
    ) => ({ ...(await publicTrackingAction(form)), searched: true }),
    { tracking: null, searched: false },
  );
  return (
    <div className="grid gap-7">
      <form action={action} className="card grid gap-4 max-w-xl">
        <p>{t("publicHint")}</p>
        <label>
          {t("orderNumber")}
          <input
            className="input w-full"
            name="number"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            required
            maxLength={64}
            autoComplete="off"
            dir="ltr"
          />
        </label>
        <label>
          {t("email")}
          <input
            className="input w-full"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            dir="ltr"
          />
        </label>
        <button className="button" disabled={pending}>
          {t("findTracking")}
        </button>
      </form>
      {state.searched && !state.tracking && <p role="alert">{t("notFound")}</p>}
      {state.tracking && <TrackingTimeline value={state.tracking} />}
    </div>
  );
}
