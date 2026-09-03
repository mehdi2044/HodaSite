#!/usr/bin/env bash
# Verify a backup (D36). Usage: verify.sh <backup-dir>   |   verify.sh --live  (checks the live DB after restore)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
: "${DATABASE_URL:?}"
if [[ "${1:-}" == "--live" ]]; then TARGET="$DATABASE_URL"; SRC=""; validate_media_dir "${MEDIA_DIR:-/data/media}" "$TARGET" 25 || exit 9; else
  SRC="${1:?}"; ADMIN_URL="${DATABASE_URL%/*}/postgres"; SCRATCH="restore_check_$(date +%s)"
  psql "$ADMIN_URL" -qc "create database $SCRATCH"; trap 'psql "$ADMIN_URL" -qc "drop database if exists $SCRATCH"' EXIT
  TARGET="${DATABASE_URL%/*}/$SCRATCH"
  pg_restore --no-owner --no-privileges --exit-on-error -d "$TARGET" "$SRC/db.dump"
  # migration SET in manifest must equal the set inside the dump
  jq -r '.migrations[]?' "$SRC/manifest.json" | sort > /tmp/v_m1; psql "$TARGET" -Atc 'select migration_name from _prisma_migrations where finished_at is not null' | sort > /tmp/v_m2
  diff -q /tmp/v_m1 /tmp/v_m2 >/dev/null || { echo "[verify] migration set mismatch between manifest and dump"; exit 2; }
  ( cd "$SRC" && sha256sum -c --quiet checksums.sha256 ) || { echo "[verify] checksum failed"; exit 3; }
  if [[ -f "$SRC/media.tar.zst" ]]; then
    exp=$(jq -r '.mediaFileCount // empty' "$SRC/manifest.json"); got=$(zstd -dc "$SRC/media.tar.zst" | tar -tf - | grep -vc '/$' || true)
    [[ -z "$exp" || "$exp" == "$got" ]] || { echo "[verify] media count mismatch $got != $exp"; exit 4; }
    # really extract to a temp dir and validate content + DB↔file consistency (same helper restore uses before swap)
    MT=$(mktemp -d); trap 'rm -rf "$MT"; psql "$ADMIN_URL" -qc "drop database if exists $SCRATCH"' EXIT
    check_tar_archive "$SRC/media.tar.zst" "${RESTORE_MAX_FILES:-200000}" "${RESTORE_MAX_UNCOMPRESSED_BYTES:-53687091200}" || exit 8
    zstd -dc "$SRC/media.tar.zst" | tar -C "$MT" --no-same-owner -xf -
    validate_media_dir "$MT" "$TARGET" 25 || exit 9
  fi
fi
q(){ psql "$TARGET" -Atc "$1"; }
# Market + User exist from Phase 00; Product/Variant arrive in Phase 02, so they
# are only enforced once present (a missing table before its phase is fine, an
# empty one after is not).
require_nonempty(){ local n; n=$(q "select count(*) from \"$1\"" 2>/dev/null) || { echo "[verify] core table $1 missing"; exit 5; }; echo "[verify] $1: $n"; [[ "$n" -gt 0 ]] || { echo "[verify] empty core table $1"; exit 5; }; }
check_if_present(){ local n; n=$(q "select count(*) from \"$1\"" 2>/dev/null) || { echo "[verify] $1: not present yet (later phase)"; return 0; }; echo "[verify] $1: $n"; [[ "$n" -gt 0 ]] || { echo "[verify] empty core table $1"; exit 5; }; }
require_nonempty Market
require_nonempty User
check_if_present Product
check_if_present Variant
# FK / orphan checks (tables may not exist before Phase 04 → ignore missing)
chk(){ r=$(q "$1" 2>/dev/null || echo 0); [[ "$r" == "0" ]] || { echo "[verify] integrity failed: $2 ($r)"; exit 6; }; }
chk 'select count(*) from "Variant" v left join "Product" p on p.id=v."productId" where p.id is null' "Variant without Product"
chk 'select count(*) from "OrderItem" i left join "Order" o on o.id=i."orderId" where o.id is null' "OrderItem without Order"
chk 'select count(*) from "Payment" p left join "Order" o on o.id=p."orderId" where o.id is null' "Payment without Order"
chk 'select count(*) from "StockItem" s left join "Variant" v on v.id=s."variantId" where v.id is null' "StockItem without Variant"
# sample order loads with relations (if any orders exist)
oid=$(q 'select id from "Order" order by "createdAt" desc limit 1' 2>/dev/null || true)
if [[ -n "$oid" ]]; then items=$(q "select count(*) from \"OrderItem\" where \"orderId\"='$oid'"); [[ "$items" -gt 0 ]] || { echo "[verify] sample order has no items"; exit 7; }; fi
echo "[verify] OK"
