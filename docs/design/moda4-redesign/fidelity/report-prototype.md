# MODA4 fidelity — approved prototype (self-test, D77 fonts)

146 / 146 checks pass.

| page | viewport | id | rule | result | detail |
|---|---|---|---|---|---|
| home | desktop | G1 | header [data-moda4=header] exists, height 64–84px | PASS | height 72px |
| home | desktop | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset), centred in header (±4%) | PASS | centre offset 0.0% |
| home | desktop | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 1100px |
| home | desktop | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| home | desktop | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| home | desktop | G6 | no horizontal overflow | PASS | scrollWidth 1440 |
| home | desktop | G7 | display headings [data-moda4-display] use Manrope (at least one on this page) | PASS | 7 visible |
| home | desktop | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| home | desktop | H1 | hero [data-moda4=hero] is full-bleed (edge to edge) | PASS | left 0 width 1440 of 1440 |
| home | desktop | H2 | hero height ≥ 50vw and ≥ 560px | PASS | height 828px |
| home | desktop | H3 | hero has ≥3 [data-moda4=hero-slide]; active image fills the hero and is top-anchored (no head crop) | PASS | 4 slides, image covers 100%, object-position 30% 0% |
| home | desktop | H4 | hero title [data-moda4=hero-title] is Manrope, ≥56px desktop / ≥40px mobile | PASS | Manrope 106.56px |
| home | desktop | H5 | hero progress bars [data-moda4=hero-progress] | PASS |  |
| home | desktop | H6 | home section order: hero → bands → worlds-prism → new-in → fitting-ad → shop-the-look → lookbook → kids-world → services | PASS | in order |
| home | desktop | H7 | two crossing marquee bands [data-moda4=band], both rotated | PASS | 2 bands, 2 rotated |
| home | desktop | H8 | worlds prism: preserve-3d, 4 faces [data-moda4=worlds-face] in 3:4 | PASS | transform-style preserve-3d, 4 faces, ratio 1.33 |
| home | desktop | H9 | new-in rail [data-moda4=new-in] with ≥4 product cards, media 3:4 | PASS | 8 cards, media ratio 1.33 |
| home | desktop | H10 | 3D fitting ad [data-moda4=fitting-ad] with rack and mannequin | PASS |  |
| home | desktop | H11 | shop-the-look [data-moda4=shop-the-look] is a full-bleed banner | PASS | width 1440 |
| home | desktop | H12 | lookbook ring: preserve-3d with ≥5 cards | PASS | preserve-3d, 6 cards |
| home | desktop | H13 | kids world: pastel gradient ground, Manrope display heading, turntable ≥4 items | PASS | bg linear-gradient(160deg, rgb(25…, heading Manrope, 6 items |
| home | desktop | H14 | services strip [data-moda4=services] | PASS |  |
| home | desktop | H15 | home page stays compact: no duplicated scenes (≤8,500px desktop / ≤9,500px mobile; prototype ≈6,800 / 7,700) | PASS | 6791px |
| home | desktop | H16 | no repeated full-size scenes: a visible photo ≥45% of the page wide appears at most twice | PASS | 2 large images, most repeated ×1 |
| women | desktop | G1 | header [data-moda4=header] exists, height 64–84px | PASS | height 72px |
| women | desktop | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset), centred in header (±4%) | PASS | centre offset 0.0% |
| women | desktop | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 1100px |
| women | desktop | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| women | desktop | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| women | desktop | G6 | no horizontal overflow | PASS | scrollWidth 1440 |
| women | desktop | G7 | display headings [data-moda4-display] use Manrope | PASS | 1 visible |
| women | desktop | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| women | desktop | C1 | category grid [data-moda4=plp-grid]: ≥4 cards, 4 per row, media 3:4 | PASS | 5 cards, 4 per row, media ratio 1.33 |
| kids | desktop | G1 | header [data-moda4=header] exists, height 64–84px | PASS | height 72px |
| kids | desktop | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset), centred in header (±4%) | PASS | centre offset 0.0% |
| kids | desktop | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 1100px |
| kids | desktop | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(255, 249, 245) |
| kids | desktop | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| kids | desktop | G6 | no horizontal overflow | PASS | scrollWidth 1440 |
| kids | desktop | G7 | display headings [data-moda4-display] use Manrope | PASS | 1 visible |
| kids | desktop | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| kids | desktop | C1 | category grid [data-moda4=plp-grid]: ≥4 cards, 4 per row, media 3:4 | PASS | 5 cards, 4 per row, media ratio 1.33 |
| kids | desktop | K1 | kids presentation: pastel header [data-moda4=kids-header] with gradient + Manrope heading | PASS | linear-gradient(120deg, rgb(253, 231, 23 |
| kids | desktop | K2 | kids cards show cut-outs on a pastel gradient | PASS | linear-gradient(160deg, rgb(255, 220, 20 |
| product | desktop | G1 | header [data-moda4=header] exists, height 64–84px | PASS | height 72px |
| product | desktop | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset), centred in header (±4%) | PASS | centre offset 0.0% |
| product | desktop | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 1100px |
| product | desktop | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| product | desktop | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| product | desktop | G6 | no horizontal overflow | PASS | scrollWidth 1440 |
| product | desktop | G7 | display headings [data-moda4-display] use Manrope | PASS | 1 visible |
| product | desktop | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| product | desktop | P1 | gallery [data-moda4=pdp-gallery] and buy box [data-moda4=pdp-buybox] side by side, buy box sticky | PASS | side-by-side true, position sticky |
| product | desktop | P2 | size buttons [data-moda4=pdp-sizes] ≥44px tall; add to bag is a crayon CTA | PASS | size button 50px, add crayon |
| fitting | desktop | G1 | header [data-moda4=header] exists, height 64–84px | PASS | height 72px |
| fitting | desktop | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset), centred in header (±4%) | PASS | centre offset 0.0% |
| fitting | desktop | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 1100px |
| fitting | desktop | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| fitting | desktop | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| fitting | desktop | G6 | no horizontal overflow | PASS | scrollWidth 1440 |
| fitting | desktop | G7 | display headings [data-moda4-display] use Manrope (at least one on this page) | PASS | 2 visible |
| fitting | desktop | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| fitting | desktop | F1 | try-on stage: 3D turntable (preserve-3d) with mannequin and ≥6 pickable items | PASS | stage true, turntable preserve-3d, mannequin true, 8 items |
| fitting | desktop | F2 | picking an item puts a new [data-moda4=tryon-layer] on the mannequin instantly | PASS | layers 2 → 2, new 1 |
| account | desktop | G1 | header [data-moda4=header] exists, height 64–84px | PASS | height 72px |
| account | desktop | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset), centred in header (±4%) | PASS | centre offset 0.0% |
| account | desktop | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 1100px |
| account | desktop | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| account | desktop | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| account | desktop | G6 | no horizontal overflow | PASS | scrollWidth 1440 |
| account | desktop | G7 | display headings [data-moda4-display] use Manrope | PASS | 1 visible |
| account | desktop | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| account | desktop | A1 | sign-in: [data-moda4=auth] split layout (image | form) on desktop with 3-step indicator | PASS | 3 steps, 2 columns |
| home | mobile | G1 | header [data-moda4=header] exists | PASS | height 60px |
| home | mobile | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset) | PASS | centre offset 5.9% |
| home | mobile | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 358px |
| home | mobile | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| home | mobile | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| home | mobile | G6 | no horizontal overflow | PASS | scrollWidth 390 |
| home | mobile | G7 | display headings [data-moda4-display] use Manrope (at least one on this page) | PASS | 7 visible |
| home | mobile | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| home | mobile | H1 | hero [data-moda4=hero] is full-bleed (edge to edge) | PASS | left 0 width 390 of 390 |
| home | mobile | H2 | hero height ≥ 600px | PASS | height 776px |
| home | mobile | H3 | hero has ≥3 [data-moda4=hero-slide]; active image fills the hero and is top-anchored (no head crop) | PASS | 4 slides, image covers 100%, object-position 50% 0% |
| home | mobile | H4 | hero title [data-moda4=hero-title] is Manrope, ≥56px desktop / ≥40px mobile | PASS | Manrope 56px |
| home | mobile | H5 | hero progress bars [data-moda4=hero-progress] | PASS |  |
| home | mobile | H6 | home section order: hero → bands → worlds-prism → new-in → fitting-ad → shop-the-look → lookbook → kids-world → services | PASS | in order |
| home | mobile | H7 | two crossing marquee bands [data-moda4=band], both rotated | PASS | 2 bands, 2 rotated |
| home | mobile | H8 | worlds prism: preserve-3d, 4 faces [data-moda4=worlds-face] in 3:4 | PASS | transform-style preserve-3d, 4 faces, ratio 1.33 |
| home | mobile | H9 | new-in rail [data-moda4=new-in] with ≥4 product cards, media 3:4 | PASS | 8 cards, media ratio 1.33 |
| home | mobile | H10 | 3D fitting ad [data-moda4=fitting-ad] with rack and mannequin | PASS |  |
| home | mobile | H11 | shop-the-look [data-moda4=shop-the-look] is a full-bleed banner | PASS | width 390 |
| home | mobile | H12 | lookbook ring: preserve-3d with ≥5 cards | PASS | preserve-3d, 6 cards |
| home | mobile | H13 | kids world: pastel gradient ground, Manrope display heading, turntable ≥4 items | PASS | bg linear-gradient(160deg, rgb(25…, heading Manrope, 6 items |
| home | mobile | H14 | services strip [data-moda4=services] | PASS |  |
| home | mobile | H15 | home page stays compact: no duplicated scenes (≤8,500px desktop / ≤9,500px mobile; prototype ≈6,800 / 7,700) | PASS | 7710px |
| home | mobile | H16 | no repeated full-size scenes: a visible photo ≥45% of the page wide appears at most twice | PASS | 2 large images, most repeated ×1 |
| women | mobile | G1 | header [data-moda4=header] exists | PASS | height 60px |
| women | mobile | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset) | PASS | centre offset 5.9% |
| women | mobile | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 358px |
| women | mobile | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| women | mobile | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| women | mobile | G6 | no horizontal overflow | PASS | scrollWidth 390 |
| women | mobile | G7 | display headings [data-moda4-display] use Manrope | PASS | 1 visible |
| women | mobile | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| women | mobile | C1 | category grid: ≥4 cards, 2 per row | PASS | 5 cards, 2 per row, media ratio 1.34 |
| kids | mobile | G1 | header [data-moda4=header] exists | PASS | height 60px |
| kids | mobile | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset) | PASS | centre offset 5.9% |
| kids | mobile | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 358px |
| kids | mobile | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(255, 249, 245) |
| kids | mobile | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| kids | mobile | G6 | no horizontal overflow | PASS | scrollWidth 390 |
| kids | mobile | G7 | display headings [data-moda4-display] use Manrope | PASS | 1 visible |
| kids | mobile | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| kids | mobile | C1 | category grid: ≥4 cards, 2 per row | PASS | 5 cards, 2 per row, media ratio 1.34 |
| kids | mobile | K1 | kids presentation: pastel header [data-moda4=kids-header] with gradient + Manrope heading | PASS | linear-gradient(120deg, rgb(253, 231, 23 |
| kids | mobile | K2 | kids cards show cut-outs on a pastel gradient | PASS | linear-gradient(160deg, rgb(255, 220, 20 |
| product | mobile | G1 | header [data-moda4=header] exists | PASS | height 60px |
| product | mobile | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset) | PASS | centre offset 5.9% |
| product | mobile | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 358px |
| product | mobile | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| product | mobile | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| product | mobile | G6 | no horizontal overflow | PASS | scrollWidth 390 |
| product | mobile | G7 | display headings [data-moda4-display] use Manrope | PASS | 1 visible |
| product | mobile | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| product | mobile | P1 | gallery [data-moda4=pdp-gallery] and buy box [data-moda4=pdp-buybox] | PASS | stacked on small screens |
| product | mobile | P2 | size buttons [data-moda4=pdp-sizes] ≥44px tall; add to bag is a crayon CTA | PASS | size button 50px, add crayon |
| fitting | mobile | G1 | header [data-moda4=header] exists | PASS | height 60px |
| fitting | mobile | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset) | PASS | centre offset 5.9% |
| fitting | mobile | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 358px |
| fitting | mobile | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| fitting | mobile | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| fitting | mobile | G6 | no horizontal overflow | PASS | scrollWidth 390 |
| fitting | mobile | G7 | display headings [data-moda4-display] use Manrope (at least one on this page) | PASS | 2 visible |
| fitting | mobile | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| fitting | mobile | F1 | try-on stage: 3D turntable (preserve-3d) with mannequin and ≥6 pickable items | PASS | stage true, turntable preserve-3d, mannequin true, 8 items |
| fitting | mobile | F2 | picking an item puts a new [data-moda4=tryon-layer] on the mannequin instantly | PASS | layers 2 → 2, new 1 |
| account | mobile | G1 | header [data-moda4=header] exists | PASS | height 60px |
| account | mobile | G2 | logo [data-moda4=logo] is the MODA4 logo (code-owned SVG or image asset) | PASS | centre offset 5.9% |
| account | mobile | G3 | footer [data-moda4=footer] with giant logo wordmark (≥50% width on desktop) | PASS | wordmark width 358px |
| account | mobile | G4 | page ground is paper #F7F4EF (or kids pastel variant) | PASS | rgb(247, 244, 239) |
| account | mobile | G5 | crayon buttons: [data-moda4-cta] ::before uses an SVG displacement filter | PASS | ::before filter=url("#crayon"); ::after border=dashed |
| account | mobile | G6 | no horizontal overflow | PASS | scrollWidth 390 |
| account | mobile | G7 | display headings [data-moda4-display] use Manrope | PASS | 1 visible |
| account | mobile | G8 | Manrope is actually loaded from self-hosted files (incl. Turkish glyphs) | PASS | loaded |
| account | mobile | A1 | sign-in: [data-moda4=auth] split layout (image | form) on desktop with 3-step indicator | PASS | 3 steps, 1 columns |
