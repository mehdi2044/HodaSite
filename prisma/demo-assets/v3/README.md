# MODA4 fresh-demo cutouts

These WebP files are unchanged copies of the owner-selected supplied raster assets in `docs/design/moda4-redesign/assets/cutouts/` (PR65). No new generation, image editing, background-removal service or paid provider call is performed.

`moda4-homepage-seed.ts` uses them only when the database has no settings, homepage, catalog or orders at the start of bootstrap. It creates dedicated v3 demo products/variants/profiles before the existing demo inventory/lot/movement bootstrap; it does not replace existing v2 or merchant identities. Alpha is actually decoded, validation binds real current Media/model fingerprints, and geometry remains editable. These are explicitly fictional demo garments and approximate layered styling, not owner-approved production photography or AI fitting results. Existing databases do not acquire this composition from re-running seed.
