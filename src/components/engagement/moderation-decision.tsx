"use client";
import { useRef } from "react";
import { useTranslations } from "next-intl";

export function ModerationDecision() {
  const decision = useRef<HTMLInputElement>(null);
  const t = useTranslations("engagement");
  return (
    <div className="flex gap-3">
      {/* Keep the decision in the form itself: streamed server children can
          lose the submitter's name/value during action hydration/replay. */}
      <input ref={decision} type="hidden" name="status" defaultValue="" />
      {(["APPROVED", "REJECTED"] as const).map((status) => (
        <button
          key={status}
          type="submit"
          value={status}
          className="button"
          onClick={() => {
            if (decision.current) decision.current.value = status;
          }}
        >
          {t(status === "APPROVED" ? "approve" : "reject")}
        </button>
      ))}
    </div>
  );
}
