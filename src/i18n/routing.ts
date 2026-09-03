import { defineRouting } from "next-intl/routing";

// Phase 00 §2: locales fa / tr / en, default fa, always URL-prefixed
// (/fa, /tr, /en). The admin panel lives outside this routing.
export const routing = defineRouting({
  locales: ["fa", "tr", "en"],
  defaultLocale: "fa",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
