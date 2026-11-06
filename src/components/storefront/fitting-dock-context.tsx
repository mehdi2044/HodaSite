"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const ProductLink = createContext<{
  href: string | null;
  select: (href: string | null) => void;
} | null>(null);

/** Shared by the fitting room and dock in this locale/market layout only. */
export function FittingDockProvider({ children }: { children: ReactNode }) {
  const [href, select] = useState<string | null>(null);
  return (
    <ProductLink.Provider value={{ href, select }}>
      {children}
    </ProductLink.Provider>
  );
}

export const useFittingDockProduct = () => useContext(ProductLink);
