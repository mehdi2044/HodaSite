# Phase 07 — AI Gateway & AI Data Entry Assistant

## Goal
An internal AI gateway (provider-agnostic, cost-tracked) and the first user: the product data-entry assistant in admin. No AI on the storefront yet.

## Scope
1. **AI Gateway** (`src/modules/ai`): `AiProvider` interface (`complete`, `embed`, optional `vision`), implementations `openai`, `anthropic`, `gemini` (config from `Integration` + env secrets), task router (`cheap` / `smart` model per task type, admin-configurable), prompt registry with versions (`PromptVersion`), `AiUsage` log (tokens, cost estimate, feature, user, market), monthly budget with soft/hard cap + alert, response cache for non-personal tasks, retries/timeouts, kill switch per feature.
2. **Admin Settings → AI**: provider keys status (secrets via env), model per task, budget, feature toggles, usage dashboard.
3. **Data Entry Assistant** in product editor: from minimal input (title/photos/attributes) generate: title (3 languages), description (3), bullet specs, care instructions, SEO title/description/keywords (3), alt texts, suggested category/tags/attributes. Actions: "Generate", "Improve tone", "Shorten", "Translate missing languages", "Regenerate field". Everything lands in a **review panel** with per-field accept/edit/discard; nothing saved until admin clicks Apply. Style guide prompt editable in admin (brand voice, forbidden claims). Bulk mode: select N draft products → generate → review queue.
4. Vision (optional flag): describe product photo to prefill material/color/fit suggestions.
5. Guardrails: product text must not invent measurements or fabric composition not given; output JSON schema validated (Zod); prompt-injection defense (product content treated as data).

6. **AI Financial Analyst (read-only)** for Phase 06 data: monthly narrative summary + anomaly list from aggregated numbers only (no raw PII), behind feature flag.

## Acceptance criteria
- Owner enters "پالتو پشمی مردانه کرم" + 2 photos → assistant proposes full trilingual content in < 30s; nothing persists until Apply; usage row recorded with cost.
- Hard budget cap stops calls with a friendly admin message.
- Switching provider in admin (with keys present) works without code change.
