# MODA4 final P0 stability gate

The expanded inline-callback audit records 27 additional existing can/assertCan
calls that omitted their enclosing transaction. Pass that explicit client at
those exact guard positions, preserving user, permission and scope arguments,
including undefined scope for global checks. No guard is removed and no
permission is memoized. This is preventive correction of the same proven
reader escape; it does not retrospectively attribute historical runtime errors.
The audit covers 155 inline callbacks; indirect helpers/session validation still
require manual/dynamic review and are not certified by that syntax audit.
The backup queue's authorization reader is included, but backup scripts,
providers, schema, restore execution and ops boundaries remain unchanged.

The cart mutation and market-switch quote readers must use their current
transaction too. Keep native maxWait/timeout, five-connection pool, cart row
lock order, revision increments, scene/set idempotency, market ownership and
financial assertions unchanged. Cart validation uses lockPromotions=false;
it does not redeem benefits or reserve inventory. Require independent real
five-admitted cart-add and market-switch regressions plus invalid-batch
rollback, and repeat the actual slow-network browser scenario. Schema and
backup scripts are unchanged; recovery is a code-only revert in an isolated
copy, with no restore of an original database.

Follow-up reader correction: invoice regeneration must pass its existing
transaction to both after-order-lock permission checks. Retain prechecks,
native transaction/pool deadlines and all invoice/version/job assertions.
The controlled five-admitted baseline expires its five native transactions
with P2028, not the historical homepage P2024. A separate transaction-local
revocation probe must deny and roll back; it is not a claim of an exploitable
production revocation race.

Avoid the fitting barrel's cold initialization inside financial transactions:
quote reads the identical ledger configuration reader with the same client;
order/return rewards import their existing ledger exports directly. No lock,
money, reservation or reward policy changes. The controlled cold quote import
was 1031–1291 ms through the barrel versus 2–5 ms directly, with both original
coin-disable race cases passing in every comparison. This does not explain
every full-run timeout.

ESLint imports the same pinned TypeScript parser directly rather than loading
the unused aggregate plugin graph. Declare it as a direct development
dependency and keep the original structural test; add actual negative and
positive lint behavior coverage for all six money domains. Do not raise the
test deadline. Retain both failed aef56ed complete Windows attempts and the
75 cases skipped after its failed setup hook as unresolved acceptance evidence.

Implemented against docs v1.2 / D-numbers touched: D04, D07, D08, D23, D24, D31, D38, D41, D70, D72, D73, D82.

Owner-authorized investigation based on c57bbb749757bf12688efd14356b126a6f5c1ca1. Preserve every existing preview/database/volume, especially 3392, 3362, 3346, 3330, 3315, 3296 and 3283. Use a separate worktree and newly verified empty destinations; restore only in ops. No push, PR, merge, main change, public deployment or feature development.

Retain all failed runs. Distinguish the historical five runtime P2024 errors from the previously proven checkout pool starvation. Collect correlated HTTP/Flight/abort, Prisma queue metrics, SQL locks/transaction age, Node event-loop and browser navigation/long-task evidence. Instrumentation overhead must be disclosed. No pool/server capacity increase, hidden retry, deadline increase or weakened financial assertion.

Audit transaction readers beyond checkout. Passing the existing transaction client to existing permission and exchange-price readers retains permission evaluation, transaction boundaries/isolation/lock order and Decimal snapshots; it is not a change of authorization strategy or financial architecture. Demonstrate starvation before correction and verify concurrency, denial and rollback afterwards.

Investigate the English desktop consent reload with the original actions and deadline. Any public-read deduplication must be request-local, preserve market/language isolation and observe changes on the next request. Do not add a shared financial/authentication cache or change consent policy, storage, approved design or images.

Investigate the five Windows timeouts individually. Compare the same tests, dependency lock, fresh data, network and resource settings using private Node 20 and system Node 24 binaries. Static permission scanning must retain every AST-visible guard, including escaped identifiers. A test-only candidate filter may avoid unnecessary AST construction; keep full namespace assertions and the original deadline.

Focused tests precede production build, lint/typecheck, complete Vitest on fresh data, browser checkout/financial races, nine consent/footer combinations, Kids World/reduced motion and navigation stress. Record source SHA, any working diff, Build ID, pass/fail/skip and all limitations for each run. Local checks do not satisfy current-head remote CI or independent D70 review. Publish only sanitized evidence in Issue 41 and stop for Mehdi.

The original retained full-run data has 26 markets. The successful order-scope run started with three retained markets, versus at least 25 for its failed counterpart. Controlled replay retains the old data on a new database: one market-scope lookup performs 26 identical subject reads; the unchanged two-case scope file executes 575 user lookups. Remove this N+1 amplification by reading one fresh access subject locally per operation and applying the existing evaluator to every market. Do not filter inactive markets, alter scope/override precedence, remove later mutation rechecks or cache permissions between operations. Regression fixtures must roll back their extra markets instead of growing the shared dataset. The old timeout itself did not repeat in this replay; do not claim its entire historical timeline is proven.

Preserve the successful first complete 1c2e3af run and its immutable 3396 preview. Further corrections use a new worktree/build and fresh targets; never rebuild the artifact serving that comparison preview. Keep the diagnostic harness path/collection errors as invalid diagnostic runs, not application test failures or successful acceptance evidence.

Persisted-session follow-up: financeActor previously validated AdminSession
through the global client while holding a native transaction. A controlled
five-admitted test fails before correction; transaction-local revocation is
also invisible to that old reader. The new optional session reader propagates
the existing transaction through auth/getAdminSession/validAdminSession.
JWT transport, signature/session-version, expiry, active-user, MFA/enrollment,
revocation and permission evaluation remain unchanged; no auth strategy,
schema, money policy, timeout or capacity change. Native before2/2/0 and
after4/0/0 controls are retained separately from historical homepage P2024.
Actual-source focused checks: 335/0/0 in 22 files;
additional finance/security checks: 446/0/0 in 3 files.
These do not satisfy the final full-suite/browser/CI/independent D70 gates.
