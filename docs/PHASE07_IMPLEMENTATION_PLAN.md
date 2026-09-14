# Phase 07 implementation plan

Implemented against docs v1.2 / D25, D31, D35, D50, D51. Development only; no publication, hosting or domain work.

1. Gateway: fixed-host OpenAI, Anthropic and Gemini adapters; keys from environment only. Admin chooses provider, cheap/smart task routes, model identifiers and USD price estimates. Disabled until explicitly configured. Completion returns validated JSON plus normalized token usage; embeddings expose supported capabilities, never fabricated vectors. Optional vision stays off until separately enabled.
2. Persistence and spending: additive PromptVersion, AiUsage, AiCache and AiDraft models; immutable prompt versions and terminal usage evidence. Serialize budget reservation across workers, include pending/unknown costs in the monthly cap, limit concurrent requests. Bound time and output; only a rejected rate-limit response is retryable automatically. Record cache hits and show cost estimates, soft alerts and hard refusals.
3. Product assistant: generate/improve/shorten/translate missing/regenerate one field. Product facts are JSON data under fixed instructions, with strict output validation and unsupported measurement/composition checks. Review each field, edit/accept/discard; explicit Apply changes approved content only. Prices, variants, stock and publication status are outside the AI patch. Detect concurrent edits rather than overwriting newer content.
4. Bulk drafts: select draft products, enqueue existing DB jobs under the acting user, recheck access on execution, store proposals in a private review queue. Retry a job using the same request key without repeated provider spending. No background publication.
5. Read-only financial analyst: explicitly enabled feature, authorized monthly aggregates, no customer/contact/payment-reference data or arbitrary query tools. Show narrative and anomalies as suggestions; finance records remain immutable.
6. UI: settings/status/usage and review surfaces in fa/tr/en, mobile 390px and RTL, understandable disabled/budget/network/conflict states. Existing manual product editing remains usable with no API key.
7. Verification: provider HTTP contract fixtures, budget concurrency and terminal-retry proofs, role/scope matrix and no-write/no-PII checks, field-level approval and edit-conflict browser tests, fresh migrations/seed, Docker and full backup/restore. Real-key provider latency and switching on the owner's laptop remain measurable acceptance checks; mocked tests are not represented as live API proof.

## Data safety discovered during integration review
The existing product save path deletes and recreates variants. Replace this with identity-preserving updates and safe deactivation of removed variants before attaching the assistant; existing order/stock references must remain valid. Add a regression covering a product with stock/order history. Never reset existing data as an installation step.

## API contract references consulted 2026-09-14
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [Gemini generation and token metadata](https://ai.google.dev/api/generate-content)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create)
- [Anthropic embedding capability](https://platform.claude.com/docs/en/build-with-claude/embeddings)
