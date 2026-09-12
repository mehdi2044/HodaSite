"use client";
import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";

// Pending feedback stays inside a link's client transition: a global loading.tsx
// would flush HTTP 200 before product authorization/notFound can return 404.
export function LinkPending() {
  const { pending } = useLinkStatus();
  const t = useTranslations("shopping");
  return pending ? (
    <span className="shop-link-pending" role="status">
      {t("loading")}
    </span>
  ) : null;
}
