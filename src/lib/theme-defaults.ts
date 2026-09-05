export const COLOR_KEYS = [
  "primary",
  "background",
  "surface",
  "text",
  "muted",
  "success",
  "error",
  "warning",
] as const;

export const DEFAULT_LIGHT_COLORS: Record<string, string> = {
  primary: "#E8792A",
  background: "#FBF8F3",
  surface: "#FFFFFF",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  success: "#2E7D4F",
  error: "#C0392B",
  warning: "#B7791F",
};

export const DEFAULT_DARK_COLORS: Record<string, string> = {
  primary: "#F0955A",
  background: "#171310",
  surface: "#221C17",
  text: "#F5F1EA",
  muted: "#B5AA9C",
  success: "#4FAF77",
  error: "#E06655",
  warning: "#D9A441",
};

export const BUTTON_RADIUS: Record<string, string> = {
  pill: "999px",
  soft: "10px",
  sharp: "4px",
};
