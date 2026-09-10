import { provinces } from "./regions";
import { z } from "zod";
export const localeSchema = z.enum(["fa", "tr", "en"]);
export const addressSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    phone: z
      .string()
      .trim()
      .regex(/^[+\d\s().-]{5,30}$/),
    country: z.enum(["IR", "TR", "CA"]),
    province: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
    line1: z.string().trim().min(5).max(500),
    line2: z.string().trim().max(250).default(""),
    postalCode: z.string().trim().max(20).default(""),
    note: z.string().trim().max(2000).default(""),
    birthDate: z.string().max(10).default(""),
    gender: z.string().max(30).default(""),
  })
  .superRefine((a, ctx) => {
    if (a.country === "CA" && !provinces.CA.includes(a.province))
      ctx.addIssue({
        code: "custom",
        path: ["province"],
        message: "Invalid Canadian province",
      });
    if (
      a.birthDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(a.birthDate) ||
        !Number.isFinite(Date.parse(a.birthDate)) ||
        Date.parse(a.birthDate) > Date.now())
    )
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "Invalid birth date",
      });
    if (
      a.country === "CA" &&
      !/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i.test(a.postalCode)
    )
      ctx.addIssue({
        code: "custom",
        path: ["postalCode"],
        message: "Invalid Canadian postal code",
      });
  });
export type CheckoutAddress = z.infer<typeof addressSchema>;
export { CommerceError } from "@/modules/orders";
