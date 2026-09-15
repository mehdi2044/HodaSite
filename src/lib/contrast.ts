export function contrastRatio(a: string, b: string): number {
  const luminance = (color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return NaN;
    const channels = [1, 3, 5]
      .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function themeContrastFailures(colors: Record<string, string>) {
  return ["background", "surface"].flatMap((bg) =>
    ["text", "muted", "primary", "success", "error", "warning"].flatMap(
      (fg) => {
        const ratio = contrastRatio(colors[fg], colors[bg]);
        return !Number.isFinite(ratio) || ratio < 4.5
          ? [
              {
                foreground: fg,
                background: bg,
                ratio: Number.isFinite(ratio) ? ratio.toFixed(2) : "—",
              },
            ]
          : [];
      },
    ),
  );
}
