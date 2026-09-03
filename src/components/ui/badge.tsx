import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "error" | "warning";

const TONES: Record<Tone, string> = {
  neutral: "bg-black/10 text-text",
  success: "bg-success/15 text-success",
  error: "bg-error/15 text-error",
  warning: "bg-warning/15 text-warning",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
