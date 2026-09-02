# Phase 10 — AI Shopping Agent (text), Semantic Search, Recommendations

## Goal
A trilingual shopping assistant grounded in real catalog data via tools; semantic search as a second layer; rule-based → ML-ready recommendations.

## Scope
1. **Agent runtime** on Phase 07 gateway: conversation store, streaming responses, tool calling with a strict allowlist: `search_products`, `get_product`, `get_availability`, `get_price`, `quote_shipping`, `get_size_guide`, `add_to_cart` (requires explicit user confirmation UI), `remove_from_cart`, `get_cart`, `start_checkout` (redirect only). No DB access outside tools. **D25 verbatim: no direct database writes; all mutations through authorized tools; checkout/payment/refund/discount require explicit confirmation and permission** — each tool runs `assertCan()` against the acting session, and write tools additionally require a UI confirmation step whose result is recorded in the conversation. Market/locale/currency injected as context. Answers must cite product ids; if data missing, say so — **never fabricate price/stock**.
2. **Storefront chat widget** (mobile sheet + desktop panel), suggested prompts per market, product cards inside chat, "add to cart" confirm step, handoff link to human support (market channels). Rate limits per session/IP, cost cap per day, abuse filter, kill switch.
3. **Semantic search**: `pgvector` embeddings for products (title/desc/attributes per locale), hybrid ranking (FTS + vector), used by search page as second stage and by `search_products` tool; zero-result analytics.
4. **Recommendations**: "Similar items", "Complete the look" (curated + embedding fallback), "Customers also bought" (co-purchase), "Recommended for you" (recent views/categories/sizes); business rules: exclude out-of-stock/low-margin unless allowed; placements configurable in admin.
5. **Style DNA (light)**: per-customer preference vector from views/purchases/sizes (consent-based) used by agent and recommendations.
6. **Evals**: eval dataset (fa/tr/en) of 60 prompts with expected tool calls; CI job runs evals nightly with a cheap model; report in admin AI page.

## Acceptance criteria
- "پیراهن مشکی مردانه XL زیر ۲۵۰۰ لیر" → results only from tools, in TR market currency; ask for an out-of-stock item → agent says not available, offers alternatives.
- Add to cart via chat requires confirmation; cart state matches.
- Semantic search finds "کت بارانی" for query "trench coat" in fa market after embeddings.
- Daily cost cap enforced; usage visible.
