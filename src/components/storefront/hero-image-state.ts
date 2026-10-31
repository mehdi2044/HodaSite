"use client";
import { createContext } from "react";
import type { SceneLayer } from "@/modules/content/scenes/resolve";
export type HeroSelectedLayers = Record<string, SceneLayer | undefined>;
export const HeroLayerSelection = createContext<
  ((layers: HeroSelectedLayers) => void) | null
>(null);
export const HeroImageValid = createContext(true);
export const HeroPriceSelection = createContext<
  ((prices: Record<string, string>) => void) | null
>(null);
