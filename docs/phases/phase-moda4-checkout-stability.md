# MODA4 — checkout, pool and footer stability

Implemented against docs v1.2 / D-numbers touched: D04, D07, D08, D24, D31, D38, D70, D72, D73, D82.

Owner-authorized bug investigation and limited correction, based on local c902e557f8bd7f04550a9e8e4452f4380dfdcd41. Preserve all existing previews, databases, media and volumes, including 3283/3296/3315/3330/3346/3362. Use this independent worktree, new proven-empty database destinations and copied media/dependencies. Restore only through ops without a Docker socket. No push, PR, merge, main change, public deployment or new feature.

Record baseline failures before changing code. Separate pool acquisition, database lock waiting, transaction execution and fixture work using correlated timestamps and PostgreSQL activity. Diagnose repeated PrismaClient creation, pending promises and cleanup, optimistic version guards and fixture interference. Compare identical source/data/resources in controlled runs. Never raise test deadlines, weaken assertions, increase pool/server connection limits or change production settings to obtain a pass.

Keep financial state atomic and Decimal-based. Verify stale-price rollback and coupon races preserve orders, stock, reservations, promotion usage and customer credit, with no duplicate order or redemption. A transaction-client plumbing correction retains the existing transaction boundaries, isolation and fixed lock order; any actual architecture change requires an ADR before implementation.

Trace the actual cookie/footer failure across navigation and reload, including readiness, DOM replacement, storage and click delivery. Do not change consent persistence or approved design without demonstrated application error. Preserve Kids World artwork, animation, reduced motion, footer presentation and mobile navigation.

Final evidence: independent checkout tests, real concurrency and rollback regressions, nine footer locale/width combinations, two full Vitest runs on new databases, purchase/checkout Playwright, Kids World and reduced motion, production build/lint/typecheck, source/build/live identity and preservation proof. Record SHA and pass/fail/skip counts for every run; retain initial failures. Historical React #418 and Connection closed remain open without new proof. Publish sanitized results in Issue 41 and stop for Mehdi; automated/self review is not D70 acceptance.
