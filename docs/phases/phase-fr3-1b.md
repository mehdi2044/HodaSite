# FR3.1b — fitting room mobile dock, attachment and receipt

Implemented against docs v1.2 / D-numbers touched: D26, D31, D70, D77, D80, D81.

- The mobile dock retains the D77 dark treatment in two rows with seven accessible destinations. The Product link resolves from the last selected or edited product in the current market. Without a selection it opens the fitting gallery; it does not query an arbitrary product.
- Attachment suggestions use the Cutout slot/anchor, media ratio and model landmarks. Only already approved pre-editor accessory placements use automatic legacy alignment. Merchant placements are preserved. The editor shows suggestions before confirmation and makes missing or stale calibration explicit.
- An expandable receipt row loads the real color/size options by product. Replacing a row revalidates the full selection and updates its quote, Cutout and Variant together. Existing server validation and atomic cart still govern purchase.
- Test at 360, 390 and 430 in FA/TR/EN. Verify a real two-color Cutout, a size change, cart Variant IDs and subtotal, and the existing authorized Cutouts editor. No new schema, AI execution or FR3.2 implementation.
