#!/usr/bin/env bash
# Verify a backup (D36). Usage: verify.sh <backup-dir> or verify.sh --live.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
: "${DATABASE_URL:?}"

WORK=$(mktemp -d)
SCRATCH=
cleanup() {
  rm -rf -- "$WORK"
  if [[ -n "$SCRATCH" ]]; then
    psql "$ADMIN_URL" -X -v ON_ERROR_STOP=1 -qc "drop database $SCRATCH"
  fi
}
trap cleanup EXIT
q() { psql "$TARGET" -X -v ON_ERROR_STOP=1 -Atc "$1"; }
fail() { echo "[verify] $2" >&2; exit "$1"; }

if [[ "${1:-}" == "--live" ]]; then
  TARGET="$DATABASE_URL"
  LIVE_MEDIA="${MEDIA_DIR:-/data/media}"
  if [[ "${STORAGE_PROVIDER:-local}" == s3 ]]; then
    LIVE_MEDIA="$WORK/media"
    snapshot_s3_media "$LIVE_MEDIA"
  fi
  validate_media_dir "$LIVE_MEDIA" "$TARGET" 25 || exit 9
else
  SRC="${1:?backup path required}"
  # sha256sum alone accepts lists that omit files or repeat entries.
  files=(db.dump manifest.json)
  if [[ -e "$SRC/media.tar.zst" || -L "$SRC/media.tar.zst" ]]; then files+=(media.tar.zst); fi
  for name in "${files[@]}" checksums.sha256; do
    [[ -f "$SRC/$name" && ! -L "$SRC/$name" ]] || fail 3 "missing or invalid archive member: $name"
  done
  checksum_line='^[a-f0-9]{64} [ *](db\.dump|manifest\.json|media\.tar\.zst)$'
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ $checksum_line ]] || fail 3 "invalid checksum entry"
    printf '%s\n' "${BASH_REMATCH[1]}"
  done < "$SRC/checksums.sha256" > "$WORK/checksum-members"
  diff -q <(printf '%s\n' "${files[@]}" | LC_ALL=C sort) \
    <(LC_ALL=C sort "$WORK/checksum-members") >/dev/null || fail 3 "checksum members do not match archive"
  (cd "$SRC" && sha256sum --check --strict --quiet checksums.sha256) || fail 3 "checksum failed"

  jq -es 'length == 1 and (.[0] | type == "object"
    and (.migrations | type == "array" and length > 0 and all(.[]; type == "string" and test("^[A-Za-z0-9_]+$")))
    and (if has("withMedia") then (.withMedia | type == "boolean") else true end)
    and (if has("mediaFileCount") then (.mediaFileCount | type == "number" and . >= 0 and floor == .) else true end))' \
    "$SRC/manifest.json" >/dev/null || fail 2 "invalid backup manifest"
  jq -r '.migrations[]' "$SRC/manifest.json" | LC_ALL=C sort > "$WORK/manifest-migrations"

  ADMIN_URL="${DATABASE_URL%/*}/postgres"
  name="restore_check_$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
  psql "$ADMIN_URL" -X -v ON_ERROR_STOP=1 -qc "create database $name"
  SCRATCH=$name
  TARGET="${DATABASE_URL%/*}/$SCRATCH"
  pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -d "$TARGET" "$SRC/db.dump"

  # A schema-only table looks empty after restore. A full pg_dump includes a
  # TABLE DATA entry even when that table has zero rows.
  pg_restore --list "$SRC/db.dump" > "$WORK/toc"
  awk '/^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public [A-Za-z_][A-Za-z0-9_]* / {print $7}' \
    "$WORK/toc" | LC_ALL=C sort -u > "$WORK/data-tables"
  q "select relname from pg_class where relnamespace='public'::regnamespace and relkind='r'" \
    | LC_ALL=C sort > "$WORK/restored-tables"
  missing=$(LC_ALL=C comm -23 "$WORK/restored-tables" "$WORK/data-tables")
  [[ -z "$missing" ]] || fail 5 "missing table data in dump: $missing"

  expected_media=$(jq -r '.mediaFileCount // empty' "$SRC/manifest.json")
  if [[ -f "$SRC/media.tar.zst" ]]; then
    check_tar_archive "$SRC/media.tar.zst" "${RESTORE_MAX_FILES:-200000}" "${RESTORE_MAX_UNCOMPRESSED_BYTES:-53687091200}" || exit 8
    MT="$WORK/media"
    mkdir "$MT"
    zstd -dc -- "$SRC/media.tar.zst" | tar -C "$MT" --no-same-owner --no-same-permissions -xf -
    got=$(find "$MT" -type f -printf '.' | wc -c)
    [[ -z "$expected_media" || "$expected_media" == "$got" ]] || fail 4 "media file count mismatch ($got != $expected_media)"
    validate_media_dir "$MT" "$TARGET" 25 || exit 9
  elif [[ -n "$expected_media" && "$expected_media" != 0 ]]; then
    fail 4 "manifest declares media files but the archive is missing"
  elif [[ "$(jq -r '.withMedia // false' "$SRC/manifest.json")" == true ]]; then
    # Older backups omitted the tar when there was no local media directory.
    count=$(q 'select count(*) from "Media" where "deletedAt" is null') || exit 9
    [[ "$expected_media" == 0 && "$count" == 0 ]] || fail 4 "media archive is missing"
  fi
fi

q 'select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null' \
  | LC_ALL=C sort > "$WORK/db-migrations"
[[ -s "$WORK/db-migrations" ]] || fail 2 "database has no applied migrations"
if [[ -f "$WORK/manifest-migrations" ]]; then
  diff -q "$WORK/manifest-migrations" "$WORK/db-migrations" >/dev/null \
    || fail 2 "migration set mismatch between manifest and dump"
fi

check_table() {
  local table=$1 count
  count=$(q "select count(*) from public.\"$table\"") || fail 5 "cannot read required table $table"
  [[ "$count" =~ ^[0-9]+$ ]] || fail 5 "invalid row count for $table"
  echo "[verify] $table: $count"
  [[ "${2:-}" != required || "$count" != 0 ]] || fail 5 "empty core table $table"
}
check_table Market required
check_table User required
check_table Media
check_table SiteSettings
check_table Role
migrated() { grep -Fxq "$1" "$WORK/db-migrations"; }
check_orphans() {
  local count
  count=$(q "$1") || fail 6 "cannot verify $2"
  [[ "$count" == 0 ]] || fail 6 "integrity failed: $2 ($count)"
}

require_fk() {
  local count
  count=$(q "select count(*) from pg_constraint
    where conrelid='public.\"$1\"'::regclass and confrelid='public.\"$2\"'::regclass
      and contype='f' and conname='$3' and convalidated") || fail 6 "cannot verify foreign key $3"
  [[ "$count" == 1 ]] || fail 6 "missing or invalid foreign key $3"
}

check_orphans "select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='f' and not convalidated" "unvalidated foreign keys"
if migrated 20260909090000_phase02_catalog; then
  check_table Product
  check_table Variant
  require_fk Variant Product Variant_productId_fkey
  check_orphans 'select count(*) from public."Variant" v left join public."Product" p on p.id=v."productId" where p.id is null' "Variant without Product"
fi
if migrated 20260909220000_phase03_pricing_inventory; then
  require_fk StockItem Variant StockItem_variantId_fkey
  check_orphans 'select count(*) from public."StockItem" s left join public."Variant" v on v.id=s."variantId" where v.id is null' "StockItem without Variant"
fi
if migrated 20260910130000_phase04_commerce; then
  require_fk OrderItem Order OrderItem_orderId_fkey
  require_fk Payment Order Payment_orderId_fkey
  check_orphans 'select count(*) from public."OrderItem" i left join public."Order" o on o.id=i."orderId" where o.id is null' "OrderItem without Order"
  check_orphans 'select count(*) from public."Payment" p left join public."Order" o on o.id=p."orderId" where o.id is null' "Payment without Order"
  sample=$(q 'select coalesce((select exists(select 1 from public."OrderItem" i where i."orderId"=o.id) from public."Order" o order by o."createdAt" desc, o.id limit 1), true)') \
    || fail 7 "cannot verify sample order"
  [[ "$sample" == t ]] || fail 7 "sample order has no items"
fi
if migrated 20260912010000_phase05_backup_panel; then check_table OpsTask; fi
echo "[verify] OK"
