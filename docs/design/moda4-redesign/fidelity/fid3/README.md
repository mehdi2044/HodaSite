# FID-3 — category and kids comparison

Implemented against docs v1.2 / D-numbers touched: D26, D31, D70, D77, D78, D81.

Production application snapshot b315c5d (same presentation as this docs/test follow-up), native Chromium1440×900/390×844, freshly seeded PostgreSQL16. Reference146/146; app **128→136/146**, cumulative **136/136**. Complete report keeps all10 later-stage failures. No normative test changes. JPEG pairs are format conversions of native screenshots; source left, application right.

Ports the4-column/2-column grid,3:4 media, compact live URL facets and product metadata, pastel kids banner with actual validated catalog cutouts, Manrope split display, theme-editor palette tokens and different pastel card grounds. Real filters, variants, quick-add, wishlist and valid alpha/photo fallback remain. Kids rotation controls now open via the44px ↻ disclosure on each card; rotation/reduced-motion/keyboard handlers are unchanged.

The demo previously lacked its inherited Kids category setting. Only the proven-empty seed now creates it.15 focused theme-validation/real PostgreSQL theme/fresh-seed cases pass, including Category preservation and valid four-model references. Build/typecheck/lint pass. The stacked FID-4 source passes all4 unchanged R5 browser regressions (actual FA/TR/EN filters/history/variant price/cart/drawer and admin product badge persistence); the initial run before the inherited FID-2 privacy correction failed on a blocked reset link, not passed.

For manual review: open kids/women at390 and1440, compare banner/grid, open ↻ and use keyboard controls; choose actual color/size, apply/reset URL filters and add to the real cart. The live demo has more genuine seeded catalog records than the static prototype; records, current market prices and unavailable-photo disclosures are retained, never replaced by fake reference labels. This is a presentation submission for owner review, **not owner visual acceptance**. Current-head CI/independent review required. Required-check configuration403, owner Windows/hosted preview and physical phones remain unverified; no merge/main push/paid integration.
