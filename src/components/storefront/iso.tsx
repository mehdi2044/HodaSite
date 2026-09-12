import type { ReactNode } from "react";
export function Iso({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}
