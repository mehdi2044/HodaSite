function skuPart(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10);
  return normalized || fallback;
}

export function generateSku(prefix: string, colorCode: string, size: string) {
  return [
    skuPart(prefix, "ITEM"),
    skuPart(colorCode, "CLR"),
    skuPart(size, "ONE"),
  ].join("-");
}
