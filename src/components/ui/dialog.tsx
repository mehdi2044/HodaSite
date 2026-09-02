"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "./button";

/** Modal dialog built on the native <dialog> element (backdrop + focus trap
 *  come for free). */
export function Dialog({
  trigger,
  title,
  children,
}: {
  trigger: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <span onClick={() => ref.current?.showModal()}>{trigger}</span>
      <dialog
        ref={ref}
        className="m-auto w-[min(28rem,90vw)] rounded-token bg-surface p-6 text-text backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <h2 className="mb-2 text-lg font-semibold">{title}</h2>
        <div className="text-sm text-muted">{children}</div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => ref.current?.close()}
          >
            بستن
          </Button>
        </div>
      </dialog>
    </>
  );
}
