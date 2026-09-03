"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/** Slide-in panel anchored to the inline-end edge (RTL-aware). */
export function Sheet({
  trigger,
  title,
  children,
}: {
  trigger: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "fixed top-0 bottom-0 end-0 z-50 w-[min(22rem,90vw)] bg-surface p-6 shadow-xl transition-transform",
          open ? "translate-x-0" : "translate-x-full rtl:-translate-x-full",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            بستن
          </Button>
        </div>
        <div className="mt-4 text-sm text-muted">{children}</div>
      </aside>
    </>
  );
}
