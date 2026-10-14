import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-text hover:opacity-90",
  secondary: "bg-surface text-text border border-black/10 hover:bg-black/5",
  ghost: "bg-transparent text-text hover:bg-black/5",
  destructive: "bg-error text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-11 px-3 text-sm",
  md: "min-h-11 px-6",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      data-variant={variant}
      data-size={size}
      className={cn(
        "moda-button",
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-button,999px)] font-medium transition",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
