# Phase 01b — Media Library (upload, processing queue, variants, picker)

> Second sub-phase of Phase 01 (roadmap v1.2, D45). Phase numbering and Checkpoint 1 (after Phase 02) unchanged. Parent spec: `docs/phases/phase-01.md` §4 (Media Library). Anything from §5–§10 there belongs to 01c and must **not** be implemented now.

## Goal
Mahdi can upload many images at once from `/admin/media`, see them appear instantly with a placeholder, and have every image automatically converted to modern formats and responsive sizes **in the background** — never blocking the upload. Every place in admin that needs an image (logos today; products, pages, banners later) uses one shared **media picker**. The storefront gets one `<ResponsiveImage>` helper so no page ever ships an unoptimized original.

## Scope

### 1. Data model (additive migration only)
Extend `Media` (exists since Phase 00):
- `status`: `PROCESSING | READY | FAILED` (default `READY` for legacy rows — data migration sets existing rows to `READY`).
- `folderId` (nullable FK → new `MediaFolder {id, name, parentId?, createdAt}`), `tags String[]`, `blurDataUrl String?`, `processingError String?`, `dominantColor String?`.
- `variants` JSON gets a documented shape: `{ [format in 'webp'|'avif']: { [width: '320'|'640'|'960'|'1280'|'1920']: { key, url, bytes } } }`. Document the shape in `docs/04_DATABASE_AND_BACKUP.md`.
- Indexes: `(deletedAt, createdAt)`, `(folderId)`, GIN on `tags`.
- Soft delete only (`deletedAt`); a `media-purge` job physically removes files + variants **30 days** after soft delete (retention configurable in settings, default 30). Purge never runs while maintenance is on.

### 2. Image processing as a job (V-5, D21)
- `ImageProcessingQueue` interface in `src/modules/media/queue.ts`: `enqueue(mediaId)`, `enqueueRetry(mediaId)`. Default driver = existing DB-backed `Job` table (`type = 'media-optimize'`). **No Redis/BullMQ**; swapping the driver later must not touch call sites.
- Worker (`src/modules/media/optimize.ts`, run by the existing cron/job runner): `sharp` → EXIF strip + auto-rotate → webp + avif at widths 320/640/960/1280/1920 (never upscale beyond original) → 16px blur placeholder (`blurDataUrl`) → dominant color → update `Media` (`status = READY`, `variants`, `width/height`). On failure: `status = FAILED`, `processingError`, up to 3 attempts with backoff; then stays FAILED with a visible "retry" in UI.
- Upload (`/api/uploads`, exists) now: validate (sniffed MIME allow-list, ≤ 10 MB images / ≤ 5 MB pdf, dimensions ≤ 8000px), store original, create `Media{status: PROCESSING}`, enqueue, return `202` with the media row **immediately**. Existing callers (brand logos) keep working: they store `mediaId` and render the original until READY.
- Worker must be idempotent and safe to re-run (rewriting variants overwrites the same keys). Worker respects the maintenance write-gate (skips while on).
- `pnpm` dependency `sharp` — pin it, and make sure the Docker image builds it correctly (`linux/amd64`, libvips). CI `docker-runtime` must upload a real image, run the job, and assert variants exist.

### 3. Admin `/admin/media`
- Grid with thumbnails (webp 320 when ready, blur placeholder while PROCESSING, error badge if FAILED with retry button).
- Drag & drop **multi-upload** with per-file progress, cancel, and clear error messages (type, size, dimensions) — all copy from `messages/*.json`.
- Folders (one level of nesting is enough) + tags; search by name/tag; filter by folder, kind, status; sort by date/name/size.
- Detail drawer: preview, filename, dimensions, size, formats/sizes available, **alt text per locale (fa/tr/en)**, tags, folder, "copy URL", replace file (creates new Media, keeps id references pointing to the new one — decide and document), soft delete, restore from trash (trash view lists soft-deleted with days remaining).
- Bulk actions: move to folder, add tag, delete.
- `assertCan('media.write' | 'media.delete')`; `media.upload` already exists. AuditLog for delete/restore/replace.

### 4. Shared `MediaPicker` component
- `src/components/admin/media-picker.tsx`: modal with the same grid/search/upload; returns `mediaId`. Single and multi-select modes.
- Replace the four single-file inputs in Settings → Brand (logo, dark logo, favicon, email logo) with the picker. This is the **only** 01a UI touched.
- Design it for reuse: Phase 02 (product images), 01c (page/hero images) must be able to drop it in without changes.

### 5. Storefront `<ResponsiveImage>`
- `src/components/storefront/responsive-image.tsx`: takes `mediaId`/media row + `sizes` + `alt` (resolved per locale from `altI18n`); renders `<picture>` with avif → webp → original fallback, `srcset` from variants, `width/height` to avoid layout shift, blur placeholder via `background` while loading. `priority` prop for above-the-fold.
- `/media/*` streaming route (exists) serves variant keys too, with `Cache-Control: public, max-age=31536000, immutable` for variant keys (content-addressed by hash in key) and short cache for originals.
- Storefront must never render an original when a variant exists (lint rule or unit test that greps storefront for raw `<img src="/media/`).

### 6. Backlog items folded in (from PR #4 review)
- **B2**: `/api/system/maintenance/state` and `/api/system/markets` get a 5-second in-memory cache in the route handler (invalidated by `revalidateTag`), and the `?ip=` bypass answer is only computed when the request carries header `x-internal-secret = MAINTENANCE_SECRET` (middleware adds it); public callers get `bypass: false`. Regression tests.
- Storage: verify `S3Storage` works with **MinIO** in `docker-compose.dev.yml` (service `minio`, bucket auto-created) so the S3 path is tested locally and in CI, not only `LocalStorage`. This is the pre-CP1 S3 proof required by D46; the real R2/S3 target is chosen on staging.

## Out of scope (do not implement)
Menus, Pages/CMS, homepage builder, translations editor, notification templates, storefront visual design (01c); product images (Phase 02); video processing; CDN integration.

## Acceptance criteria
1. Upload 10 images at once → all appear in the grid within 1 s with placeholders; within 60 s all are READY with 5 widths × 2 formats (e2e in CI `docker-runtime` with real sharp).
2. Kill the worker mid-job, restart → the job resumes; no duplicate variants; media never stuck in PROCESSING for > 3 attempts (integration).
3. A corrupt/oversized/wrong-MIME file is rejected with a localized message; a valid image with a `.exe` name is accepted and stored with the sniffed extension (unit + e2e).
4. Brand logo chosen via picker → storefront header renders `<picture>` with avif/webp `srcset` and correct `width/height`; Lighthouse "properly sized images" passes on `/fa` at 390px (e2e).
5. Soft-deleted media disappears from grid and picker, appears in trash, restores; purge job removes files only after retention (integration with clock injection).
6. `S3Storage` + MinIO passes the same upload/variant/stream tests as `LocalStorage` (CI matrix).
7. Backup → restore cycle still green, and restored media files include variants (`docker-runtime`).
8. B2 regressions: public `?ip=` never returns `bypass: true`; cached state endpoint reflects an admin toggle within 5 s.
9. `pnpm lint && pnpm typecheck && pnpm test` green; e2e green in CI; fresh `down -v && up --build` seeds ≥ 12 demo images in 3 folders with alt text in 3 languages.

## Deliverables
Code + additive migrations + seed with demo images (royalty-free, no brand logos); tests as above; `docs/PROGRESS.md` row **01b** + Persian manual test steps; `docs/04_DATABASE_AND_BACKUP.md` (Media/variants/purge); `docs/06_ADMIN_AND_DESIGN.md` §A rows tagged `01b`; ADR note if `sharp` packaging needed a decision; PR titled `Phase 01b: Media Library`.
