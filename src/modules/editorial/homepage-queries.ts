import { cache } from "react";
import { publishedEntries } from "./queries";
import { weeklyLooks } from "./weekly";

// Render-local reuse only: no persistent cache, TTL or cross-request publication delay.
export const homepagePublishedLooks = cache(async (marketId: string) =>
  (await publishedEntries("LOOK", marketId)).flatMap((entry) =>
    entry.body.kind === "LOOK" && entry.visual
      ? [{ ...entry, body: entry.body, visual: entry.visual }]
      : [],
  ),
);
export const homepageWeeklyLooks = cache((marketId: string) =>
  weeklyLooks(marketId),
);
