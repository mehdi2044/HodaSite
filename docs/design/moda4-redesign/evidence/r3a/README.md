# R3a production application evidence

Application source **31d265956aa8ec84b4744dc94bae3f7601213983**, build UTC2026-10-14T17:58:12.356Z. Exact observed values are in [observations.json](observations.json). Synthetic scratch data only; no owner data/login or physical-device result. Native captures are unedited and may contain the fixed navigation overlay. The synthetic two-piece transaction proves references/price/cart behavior, not exact artwork-to-merchant garment matching or complete MODA4 acceptance.

The already-open authenticated operator storefront reflected publication in1665ms and a live catalog price change in3984ms. Both were asserted≤5000ms; no manual reload on the preview-publication path. Actual password+MFA, private/no-store/read-only draft/nonce behavior, save/reload, real size choice and atomic cart, historical read-only preview/content rollback and broken-image fallback passed. Current-head CI and actual Local+S3 restore of new metadata remain independently required.

| View | Capture |
|---|---|
| FA390 CSS px, entire scene/price list | [FA scene](r3-scene-fa-390-full.png) |
| TR390 CSS px, entire scene/price list | [TR scene](r3-scene-tr-390-full.png) |
| EN390 CSS px, entire scene/price list | [EN scene](r3-scene-en-390-full.png) |
| EN1440 CSS px storefront | [Desktop](r3-scene-en-1440.png) |
| Private EN390px historical preview | [Readonly preview](r3-private-history-en-390.png) |

[Admin walkthrough](../../R3A_ADMIN_GUIDE_FA.md) and [Windows Codex handoff](../../LOCAL_CODEX_PROMPT_FA.md). R3b full homepage/campaigns and R4 cutout/COMPOSITE, owner visual acceptance and actual Windows remain open. Online R0 BLOCKED_ENV; no cloud localhost is offered as an owner URL. No merge authorization.
