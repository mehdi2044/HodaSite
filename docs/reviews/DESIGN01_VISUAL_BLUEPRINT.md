# DESIGN-01.1 — visual blueprint and acceptance handoff

Implemented against docs v1.2 / D-numbers touched: D09, D10, D31, D40, D51, D70, D74 (isolated proposal; no architecture/schema change).

2026-10-14, Europe/Istanbul. Main baseline `8e0b953a6c9872119dd27840b6e99b6b50dd576c`; PR60 read-only visual source includes the approved Hero and current functional fixes. This branch does not incorporate or duplicate PR60 implementation commits. [Execution order #63](https://github.com/mehdi2044/HodaSite/issues/63), [full design requirements #62](https://github.com/mehdi2044/HodaSite/issues/62), [runnable preview instructions](../../previews/design-01/README.md).

## Proposal and page map

Home → department category/filter → product/color/size/gallery → demo bag; each banner leads to its explicit department, ShopLook hotspots lead to the matching fixture products. Banner editor changes the local visual model alongside the preview. The actual Next.js checkout and admin remain PR60's functional delivery; prototype checkout is clearly a terminal demonstration.

| Order / block              | Mobile 390                                                                                | Desktop 1440                                               | Content and admin contract after selection                                                         | Empty/error/loading                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Existing header/Hero       | Preserve approved image/copy/CTA baseline; current header reused in real implementation   | Same accepted baseline; no unapproved global replacement   | Existing Brand/Menu/Homepage Hero data; same READY image/CMS grants                                | Existing valid fallback; optional video later                               |
| Department discovery       | Tall portrait Women, two smaller Men/Kids, wide Accessories; all whole-card touch targets | Four staggered portrait planes, category-specific geometry | Category IDs/order/count/labels/media, any future roots; no count/depth business cap               | Omit invalid cover, retain labeled category link; localized empty           |
| Dual collection banners    | Two stacked independent images, copy and CTA                                              | Paired 1:1-ish editorial panels                            | Two localized Banner records, separate media/mobile variant/target, optional scope                 | Text/CTA survives missing media; no broken image                            |
| Selected arrivals          | Two cards visible in native rail; fifth reachable; group tabs                             | Five catalog cards                                         | source/manual order/count/layout; market visibility, real quote/stock from existing core           | Loading skeleton, no-results recovery and error/retry shown in category     |
| Campaign poster/video slot | Poster above short copy; CTA always visible; pause explicit                               | Split image/message, reserved dimensions                   | Media/poster/mobile variant, approved 5–8s muted clip if chosen; real Promotion ID/start/end/scope | Poster remains when video unavailable; reduced-motion never blocks purchase |
| Weekly editorial edit      | Short accessories collection, no fake “bestseller”/sale claims                            | Five cards, deliberately different rhythm from discovery   | manual/collection source; label reflects actual ranking source                                     | Hide empty row or recovery link; don't invent products                      |
| Complete the look          | Large look image and two named hotspots, then short explanation/CTA                       | Image + story side-by-side                                 | Existing ShopLook products/colors/media; real variant purchase in production                       | Ineligible products fail through existing atomic core                       |
| Services/footer            | Compact readable groups, expandable policy text                                           | Three calm columns; no stretched empty space               | Existing approved shipping/return/contact/legal/menu/social source; no invented promise            | Optional missing service hidden; one shared truth across FAQ/PDP/cart       |

Iranian Style's recorded discovery/banner structure and Victoria's Secret's recorded promotional rhythm inform this sequence, as documented in #62. No assets, logos, reference discount terms or text were copied. These external sites were not newly re-audited in this environment; the source is the owner's recorded brief plus real local captures.

## Proposed bounded tokens

| Token                 | Proposal                                                                      | Administrative control / boundary                                                     |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Base / surface / text | warm `#FBF8F3`, white, `#252623`                                              | Existing validated theme colors; preserve AA contrast                                 |
| Lower-page accent     | ink/olive `#2C342B`, campaign `#E5E3D7`, existing orange CTA context          | Owner selects; no production palette write                                            |
| Fonts                 | Vazirmatn FA, Inter TR/EN; accepted Hero unchanged                            | Existing self-hosted allowlist; no new font provider                                  |
| Type                  | body 14–16; card 12–14; section 23–36; PDP 28–46                              | Bounded presets proposed; current type fields incomplete                              |
| Space                 | mobile gutter20, desktop40; section52/75, gaps14/20/24                        | Named presets, not unrestricted CSS from business forms                               |
| Card / button         | image radius3–4; rounded main CTA; category and product layouts distinct      | Card/style choice dependent on owner selection                                        |
| Imagery               | card3:4; discovery staggered; look4:5; mobile campaign poster height reserved | Media roles/focal point/crop reused; new mobile source must be implemented explicitly |
| Motion                | maximum scale1.025, 8s gentle campaign breathing; pause; reduced-motion off   | bounded none/subtle setting proposed; heavy WebGL is not a dependency                 |

Popup remains optional/off; if selected later its frequency cap, close semantics and real server-bound expiry must be implemented against the existing Promotion engine. No timer in this prototype fabricates urgency. A single optional video slot has a real poster layout; no approved video file is claimed.

## Panel/data contract and lifecycle

Complete setting domains and existing route/permission/source/test mapping: [DESIGN01_SETTINGS_MATRIX](DESIGN01_SETTINGS_MATRIX.md), a read-only snapshot of the F audit from PR60. The editor prototype demonstrates banner copy/target/count/visibility only. All other controls are explicit implementation gaps in that matrix.

Proposed per-block contract after selection: stable identity/internal name/type/order/enabled; localized copy/CTA/alt; READY image/video and poster IDs, mobile media/crop; allowed layout/spacing/text placement; market/locale/device targeting; start/end in UTC with named timezone display; existing catalog source/manual IDs; optional existing Promotion reference. Content revisions are separate from immutable commerce records. Draft preview requires authorization, publication explicit permission, schedule idempotent server execution, optimistic version/conflict detection, audit and content-only rollback. Reuse existing Page/Promotion contracts where appropriate; new schema/security/provider/money contracts require ADR and data-impact verification before implementation. AuditLog alone is not content-version recovery.

Measurement proposal: impression/click of approved visual blocks, collection entry, add-to-bag and resulting synthetic/order conversion using only existing consent-enabled instrumentation. No tracking fires from this offline prototype and no new paid/A-B service is introduced. Event scope/schema and privacy are a design decision for implementation.

## Requirement and AC traceability

| ID        | Stage-one output / evidence                                                              | Remaining gate or implementation                                           |
| --------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| REQ-01/02 | Four-department discovery, dual/wide banners, five-card edits                            | Owner composition selection                                                |
| REQ-03    | Actual translated Hero snapshot, current PR60 captures; header is only a prototype frame | Reuse real header; no unapproved upper redesign                            |
| REQ-04    | FA/TR/EN, 390/768/1440, independent market-scope illustration                            | Real market quotes and physical PWA proven separately                      |
| REQ-05/06 | Distinct category/product geometry, quiet depth, pause/reduced-motion                    | Owner chooses tokens/intensity                                             |
| REQ-07/08 | Complete F matrix + local banner form and lifecycle contract                             | Real DB controls/publication/history in 01.2–01.5                          |
| REQ-09    | Actual runnable proposal + concrete choices below                                        | AWAITING_VISUAL_APPROVAL                                                   |
| REQ-10    | No backend access/commerce writes; #57/09B core reused in later implementation           | Current-head PR60 regression/D70 review separate                           |
| AC-01     | Category fixture navigation/all four groups; real taxonomy tested in PR60                | New selectable display/order fields later                                  |
| AC-02     | Layout blueprint and visibility/count local controls                                     | Real duplication/schedule/soft-recovery/revision later                     |
| AC-03     | Edit title/body/CTA/destination → live local banner                                      | READY/media/mobile/publish server integration later                        |
| AC-04     | Five fixture products per group, editable count                                          | Catalog/manual/real-market source integration later                        |
| AC-05     | Autumn banner form/layout and target                                                     | Real Promotion/time/mobile-media linkage later                             |
| AC-06     | No fabricated discount/timer; existing 09B is authoritative                              | Real before/active/expired UI+quote tests later                            |
| AC-07     | Popup off/not selected                                                                   | Close/frequency cap required if selected                                   |
| AC-08     | Services remain explicit approved-policy placeholders                                    | Shared shipping/FAQ/PDP/cart data reconciliation later                     |
| AC-09     | Browser local save/restore only, clearly labeled                                         | Authorized server drafts/schedule/history/content rollback later           |
| AC-10     | No real mutation tool or authorization claim                                             | Existing server grant matrices in PR60; new publication scope later        |
| AC-11     | Local size-required add → correct color/size/quantity bag; product zoom                  | Actual product/ShopLook/core checkout proofs in PR60                       |
| AC-12     | Category filter, empty/reset/loading/error/retry                                         | Production catalog filters/URL/backforward proof in PR60                   |
| AC-13     | Three-language responsive capture and keyboard proof; focus styles and 44px controls     | Owner/physical device/a11y acceptance still distinct                       |
| AC-14     | Poster fallback, pause and reduced-motion; bounded layouts                               | Real video network error/slow-source tests if video selected               |
| AC-15     | Local block visibility/pause illustrated                                                 | Existing fitting/coin server switches retained; new switches later         |
| AC-16     | Pure fixture reading and browser state; no seed/reset/owner write                        | Real additive preview proof and owner audit separate                       |
| AC-17     | Size/containment measured, performance target not claimed                                | LCP ≤2.5s needs recorded production-like measurement; physical PWA pending |
| AC-18     | Visual proposal delivered for selection                                                  | Owner has not yet approved it                                              |

## Exact owner decision

Approve or refine this actual DESIGN-01.1 direction: staggered category collage; dual banners before arrivals; five-card row with four group tabs; one campaign poster/video position; editorial accessories row; named look hotspots; green/cream lower-page palette and subtle pausable movement. The suggested default is **static banners/poster and no popup/heavy 3D** for the first implementation. Owner may request changes to order, image ratios, row count, palette or motion. Acceptance authorizes the selected subsequent design scope only when the owner also says to continue; it is not merge/release authority.

Dependencies retained: 01.2 Home → 01.3 Category/search/card → 01.4 Product/ShopLook/bag → 01.5 Admin/campaign → 01.6 Media/quality/final acceptance. #48/#49/#62, real Windows/Docker delivery, Android/iPhone/HTTPS/offsite and D70 remain open.

## Recorded verification and visual self-review

- Frozen main dependency baseline reused; local lint and TypeScript passed. `pnpm test:unit`: 100 files / 4,116 cases passed on this independent main-based branch.
- `DESIGN_CHROMIUM_PATH=/usr/bin/chromium pnpm exec tsx scripts/verify-design-preview.mts` passed: nine real captures at 390/768/1440 in FA/TR/EN, no horizontal overflow, all four groups with five products, independent mock market selector, category empty/loading/error recovery, native zoom/Escape, size-required add, correct selected-size/quantity bag, localized local edit/save/restore/visibility, pause/reduced-motion, actual baseline reference and no exposed `.env`/checkout API.
- Evidence: [observations](../../previews/design-01/evidence/observations.json); [FA mobile](../../previews/design-01/evidence/proposal-fa-390.png), [EN desktop](../../previews/design-01/evidence/proposal-en-1440.png), [FA product](../../previews/design-01/evidence/product-fa-390.png), [FA bag](../../previews/design-01/evidence/bag-fa-390.png), [FA banner editor with long Persian copy](../../previews/design-01/evidence/editor-fa-390.png). All three-language captures are retained in the evidence folder. The actual PR60 baseline references are separately named `hoda63-current-*`.
- Direct image self-review inspected the EN desktop complete sequence and FA mobile/editor, including real decoded artwork, category/product distinction and long-copy wrapping. This is self-review/system Chromium, not an independent human review, WebKit, physical phone or measured LCP result.
- Current PR60 delta `d382a4e970f8db43dffc2e553f9ca5ba22de079c` also adds shared catalog/settings unsaved-navigation warnings. The copied F matrix is a source-baseline audit; that small gap is now repaired there, while complete content lifecycle and global IA remain partial. No PR60 code has been copied into this branch.
