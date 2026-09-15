"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export function ModerationDecision() {
  const decision = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const t = useTranslations("engagement");
  useEffect(() => setReady(true), []);
  return (
    <div className="flex gap-3">
      {/* Keep the decision in the form itself: streamed server children can
          lose the submitter's name/value during action hydration/replay. */}
      <input ref={decision} type="hidden" name="status" defaultValue="" />
      {(["APPROVED", "REJECTED"] as const).map((status) => (
        <button
          key={status}
          type="submit"
          disabled={!ready}
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
