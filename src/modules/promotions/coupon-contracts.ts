import { z } from "zod";

export const MAX_COUPON_CODES = 100;
export const MAX_COUPON_CODE_LENGTH = 64;
// Include the comma-space separators used when the storefront renders saved codes.
export const MAX_COUPON_INPUT_LENGTH =
  MAX_COUPON_CODES * MAX_COUPON_CODE_LENGTH + (MAX_COUPON_CODES - 1) * 2;

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(4)
  .max(MAX_COUPON_CODE_LENGTH)
  .regex(/^[A-Z0-9][A-Z0-9_-]+$/);
export const couponCodesSchema = z
  .array(couponCodeSchema)
  .max(MAX_COUPON_CODES)
  .refine((v) => new Set(v).size === v.length, "Duplicate coupon codes")
  .transform((v) => v.sort());
export const couponCodesInputSchema = z
  .string()
  .max(MAX_COUPON_INPUT_LENGTH)
  .transform((v) => v.split(/[\s,]+/).filter(Boolean))
  .pipe(couponCodesSchema);
