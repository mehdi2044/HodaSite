# Hero hydration stability — FR3.1b acceptance follow-up

Implemented against docs v1.2 / D-numbers touched: D26, D31, D70, D77, D81.

The M4-01 height calculation previously acquired the page offset and bottom navigation height from the hydrated guard. On stacked layouts, this changed the viewport position of the price buttons after the server had shown a larger Hero. Keep the leading homepage Hero within a CSS viewport budget that accounts for the actual chrome in flow. Preserve the existing collision guard, content, theme, in-slide purchase and desktop composition.

Acceptance: same price hit target before and after hydration; a physical touch spanning that boundary opens the intended sheet. FA/TR/EN support touch, pointer and keyboard at mobile and desktop widths. Recheck the tablet market suggestion, all 33 storefront regressions, fitting room and Fidelity. No FR3.2 execution or paid API.
