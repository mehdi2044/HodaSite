# M4-01 design QA

Implemented against docs v1.2 / D-numbers touched: D04, D09, D10, D25, D31, D70, D77, D78, D81.

This is Codex self-review of M4-01, not independent review or Mehdi's visual approval. M4-02 is excluded. The PR stays Draft. Current-head CI and D70 review gates must be assessed separately.

## Evidence and inspection

Reference: the supplied Claude v3 HTML and both package specifications, based on c0781c31adfa1db6938ddf77704bc72bf30a8854. Implementation evidence was captured from production build 706b2d54f5ec9ab040c48393b5fe4e1099ea06ca on Windows, using a freshly provisioned review database. Later test/report-only commits do not change the UI implementation.

I inspected all four [comparison boards](docs/design/moda4-redesign/m4-01-02/evidence/README_FA.md), covering 48 actual states, and the full-size FA/EN mobile pairs. Each pair puts Claude on the left and Codex on the right. Captures use equal CSS viewport, density 1 and loaded fonts. Original pairs retain their pixel dimensions; overview boards are proportionally reduced. White padding aligns unequal element heights. No generated replacement or stretched screenshot is used.

| CSS viewport | Claude hero capture | Codex hero capture |
| --- | --- | --- |
| 390 × 844 | 390 × 812 | 390 × 760 |
| 768 × 1024 | 768 × 937 | 768 × 940 |
| 1024 × 768 | 1024 × 742 | 1024 × 758 |
| 1440 × 900 | 1440 × 864 | 1440 × 880 |

## Findings and resolution history

| Priority | Observed finding | Resolution and evidence |
| --- | --- | --- |
| P1 | Three-decimal authored pin coordinates were rejected by native two-decimal step validation, blocking normal CMS saves. | Both scene editors and the new layout fields accept continuous geometry precision. Bounds and server validation remain. The browser now verifies that the seeded form has no invalid controls; real draft/save/reload/publication tests pass. |
| P2 | Generic button padding and stale seed copy caused a mobile CTA wrap and a missing secondary CTA. | Scoped Hero button geometry, correct reference copy and fresh-bootstrap-only seed changes. See the before-mobile image and the final mobile pairs. |
| P2 | Explicit resume appeared active while retained focus/hover kept the carousel stopped. | Resume advances from the retained frame with focus on its button. Pause and resize preserve elapsed time; reduced motion prevents further playback. |
| P2 | Legacy COMPOSITE contain content was rendered on a cover canvas, cropping the dressed mannequin. | Frame fit is respected without changing saved JSON. Actual before/after captures show the selected layers with reduced motion and no final photograph. |
| P2 | An offscreen admin measurement could wait indefinitely for iframe animation frames. | Eager image decode with a bound, font readiness and the visible parent's frame scheduling. Two complete private audit runs now finish and expose the intended warning. |

No open P1/P2 visual finding remains within M4-01. The following visible P3 differences are disclosed, rather than hidden by changing the sample: the real market/header and fixed mobile navigation reserve different space; actual purchase pins have 44px targets; explicit playback controls and the demo-image badge remain visible; subtitle leads use regular weight where the sample emphasizes them; live CAD/FX values and currency notation differ from the sample's fixed values. The existing crayon button treatment and branding tokens are retained.

## Functional and visual checks

- New Hero fidelity: FA/TR/EN, four viewport sizes and four slides, 48 states, zero H-01…H-07 findings. Both reference and app pass their 25 browser cases.
- Previous fidelity: 146/146, with the previous specification file unchanged. No threshold, assertion or acceptance item was removed.
- Real touch, mouse and Enter open the existing D81 form inside the hero, focus the selected piece and require actual size choices. Variable Decimal prices stay consistent with the purchase quote. Archived references cannot offer an invalid set.
- Private admin audit: healthy result first; deliberately invalid subject bounds then show H-01 in the permitted language/size matrix. Unit checks cover all seven warning classes. Audit does not publish content or grant additional scope.
- [Identity contact sheet](docs/design/moda4-redesign/m4-01-02/evidence/hero-garment-identities.jpg): inspected four final synthetic looks against nine catalog image references for style/color identity. IDs and file hashes are recorded alongside it. Existing server fingerprint checks and explicit PHOTO approval are preserved.
- Legacy textSide and optional layout/float contracts remain supported. Dead Hero CSS is removed; current Hero rules are scoped. The full 96-scenario browser acceptance is recorded as 93 passing in the full run and three successful final rechecks; trace is disabled for the measured rechecks, retaining the 5000ms publication/price limits.

The untouched FittingAd's MATCH_REQUIRED diagnosis and M4-02 remain documented separately. Native Windows standalone symlink EPERM, current-head CI, independent Claude/Vee review and Mehdi's approval are not claimed as visual passes or release authorization.

final result: passed
