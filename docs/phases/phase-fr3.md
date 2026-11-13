# FR3 — D77 instant fitting gallery

Implemented against docs v1.2 / D-numbers touched: D26, D31, D70, D77, D80, D81.

Owner-authorized FR3 starts at 2f8385a40c3770d6bb33f6fe7b10d07cb3086010.
The approved Persian D77 source SHA256 is
6fcb211fb3e57a1afb309897d5289d21bc49eb2a59b58e4cbb372c3a925385fc.

The gallery renders real catalog and cutout media in an uncropped image area.
Slot filters use the shared slot contract and compose with the public catalog
search and cursor. The selection count uses the instant selection capacity.
Search and compatibility controls remain available in the gallery. The variant
picker displays catalog color and size and applies the selected variant through
the existing try-on action. The same action toggles the already active variant.
Selection and restore use server validation for the active market and model.

Acceptance covers all four models, three locales, widths 390/768/1024/1440,
keyboard/focus and touch, pagination, slot replacement, variant restoration,
unavailable selection, cart and the absence of paid session or coin effects.
The gallery is the FR3 scope. Composition card, subtotal and final action
presentation belong to FR4. Wardrobe, coin/paid presentation and subsequent
phase work are outside this implementation.
