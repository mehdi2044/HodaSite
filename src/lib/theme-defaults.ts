import { MODA4_LIGHT, MODA4_DARK } from "../../scripts/moda4-theme";
export const COLOR_KEYS = [
  "primary",
  "background",
  "surface",
  "text",
  "muted",
  "success",
  "error",
  "warning",
  "sand",
  "sandDeep",
  "primaryText",
  "line",
  "kidsPink",
  "kidsMint",
  "kidsSky",
  "kidsButter",
  "kidsLilac",
  "kidsPeach",
  "kidsInk",
  "kidsAccent",
  "kidsButton",
  "kidsButtonInk",
  "roseBackground",
  "roseSoft",
  "roseAccent",
  "roseDeep",
  "slateBackground",
  "slateSoft",
  "slateAccent",
  "slateDeep",
  "sandBackground",
  "sandSoft",
  "sandAccent",
  "sandText",
  "primaryInk",
] as const;

export const DEFAULT_LIGHT_COLORS: Record<string, string> = {
  ...MODA4_LIGHT,
  primary: "#E8792A",
  background: "#FBF8F3",
  text: "#1A1A1A",
  muted: "#6B6B6B",
};
export const DEFAULT_DARK_COLORS: Record<string, string> = MODA4_DARK;

export const BUTTON_RADIUS: Record<string, string> = {
  pill: "999px",
  soft: "10px",
  sharp: "4px",
  crayon: "999px",
};

/** Only defaults for a NEW theme row; never overwrite a merchant's palette. */
export const MODA4_LIGHT_COLORS = {
  ...DEFAULT_LIGHT_COLORS,
  primary: "#FF6A1A",
  background: "#F7F4EF",
  text: "#141210",
  muted: "#6B645C",
};
