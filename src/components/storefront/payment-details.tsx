"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
export function PaymentDeadline({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState<number | null>(null),
    t = useTranslations("commerce");
  useEffect(() => {
    const tick = () =>
      setRemaining(
        Math.max(
          0,
          Math.floor((new Date(deadline).getTime() - Date.now()) / 1000),
        ),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return (
    <p className="rounded-token bg-bg p-4" role="timer">
      {t("deadline")}:{" "}
      <span dir="ltr">
        {remaining === null
          ? "…"
          : `${Math.floor(remaining / 3600)}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`}
      </span>
    </p>
  );
}
export function CopyBank({ value }: { value: string }) {
  const [done, setDone] = useState(false),
    t = useTranslations("commerce");
  return (
    <button
      type="button"
      className="rounded-token border px-3 py-2 text-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? t("copied") : t("copy")}
    </button>
  );
}
