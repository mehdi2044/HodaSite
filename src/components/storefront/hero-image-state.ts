"use client";
import { createContext } from "react";
export const HeroImageValid = createContext(true);
export const HeroPriceSelection = createContext<
  ((prices: Record<string, string>) => void) | null
>(null);
