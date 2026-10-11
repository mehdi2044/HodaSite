const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** One canonical form is used when indexing and when querying (D20). */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[أإٱ]/g, "ا")
    .replace(/[ً-ٰٟۖ-ۭ]/g, "")
    .replace(/[‌‍⁠﻿]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildProductSearchText(
  parts: Array<string | null | undefined>,
) {
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}
