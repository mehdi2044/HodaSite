# FR3.1 — D77 fitting room finish

Implemented against docs v1.2 / D-numbers touched: D26, D31, D70, D77, D80, D81.

This phase includes the owner's requested attachment alignment, model/view
editor, fitting navigation, and selection receipt. FR3.2 is a design document.

- Four supplied mannequin assets have separate normalized attachment points.
  The existing demo accessory profiles are calibrated for the exact demo
  assets. Saved operator geometry is authoritative for merchant profiles.
- The existing Cutout editor saves front geometry and optional left/right
  placement overrides in the same validated JSON contract. Missing model
  placement is shown as unavailable. Optional vertical masks and layer order
  apply in the fitting room. Side views are rotations of the existing artwork.
- The D77 dock is visible on the fitting page and on destinations opened from
  it. Canonical category/product destinations come from the active catalog.
  Mobile also keeps the existing market-specific cart shortcut.
- The white selection receipt uses current variant data and a Decimal display
  total. Cart and wardrobe use their existing authorized server mutations.
  Real view displays its unavailable state while the new service is pending.

Visual acceptance is based on D77, desktop and mobile screenshots of four
models, the receipt and the dock. The browser must also verify actual cart
variants and the model/view editor. Owner and independent review are pending.
