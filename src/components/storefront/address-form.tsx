"use client";
import { useRef, useEffect } from "react";
import { CommerceForm } from "./commerce-form";
import {
  autosaveAddressAction,
  saveAddressAction,
} from "@/app/[locale]/commerce-actions";
export function AddressForm({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pending = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div
      onChange={(e) => {
        const form = (e.target as HTMLElement).closest("form");
        if (!form) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const data = new FormData(form);
          pending.current = pending.current.then(() =>
            autosaveAddressAction(data),
          );
        }, 700);
      }}
    >
      <CommerceForm
        action={async (data) => {
          if (timer.current) clearTimeout(timer.current);
          await pending.current;
          return saveAddressAction(locale, data);
        }}
      >
        {children}
      </CommerceForm>
    </div>
  );
}
