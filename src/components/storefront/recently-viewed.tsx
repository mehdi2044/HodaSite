"use client";
import { useEffect } from "react";

export function RecentlyViewed({ productId }: { productId: string }) {
  useEffect(() => {
    try {
      const old = JSON.parse(
        localStorage.getItem("recently-viewed") || "[]",
      ) as string[];
      localStorage.setItem(
        "recently-viewed",
        JSON.stringify(
          [productId, ...old.filter((id) => id !== productId)].slice(0, 12),
        ),
      );
    } catch {
      /* Storage may be unavailable. */
    }
  }, [productId]);
  return null;
}
