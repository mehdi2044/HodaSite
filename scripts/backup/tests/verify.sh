#!/usr/bin/env bash
# Run verify.sh with real archive checksums and controlled PostgreSQL outputs.
set -euo pipefail
VERIFY="$(cd "$(dirname "$0")/.." && pwd)/verify.sh"
WORK=$(mktemp -d)
trap 'rm -rf -- "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/archive"
export DATABASE_URL=postgresql://fixture/verify_test PATH="$WORK/bin:$PATH"
export TRACE="$WORK/trace"
cat > "$WORK/bin/psql" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
sql="${!#}"
case "$sql" in
  'create database '*) echo create >> "$TRACE";;
  'drop database '*) echo drop >> "$TRACE";;
  'select relname from pg_class '*) printf 'Market\nMedia\nProduct\nRole\nSiteSettings\nUser\nVariant\n_prisma_migrations\n';;
  'select migration_name '*) printf '20260902000000_phase00_foundation\n20260909090000_phase02_catalog\n';;
  'select count(*) from public."Product"'|'select count(*) from public."Variant"')
    if [[ "$SCENARIO" == query-error ]]; then exit 1; fi
    if [[ "$SCENARIO" == populated ]]; then echo 1; else echo 0; fi;;
  *'Variant" v left join'*) if [[ "$SCENARIO" == orphan ]]; then echo 1; else echo 0; fi;;
  'select count(*) from public.'*) echo 1;;
  *"conname='Variant_productId_fkey'"*) if [[ "$SCENARIO" == missing-fk ]]; then echo 0; else echo 1; fi;;
  'select count(*) from pg_constraint '*) echo 0;;
  *) echo "Unexpected SQL: $sql" >&2; exit 1;;
esac
SH
cat > "$WORK/bin/pg_restore" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == --list ]]; then
  for table in Market Media Product Role SiteSettings User Variant _prisma_migrations; do
    if [[ "$SCENARIO" == partial && "$table" == Product ]]; then continue; fi
    printf '1234; 0 16384 TABLE DATA public %s fixture\n' "$table"
  done
else
  echo restore >> "$TRACE"
  [[ "$SCENARIO" != bad-dump ]] || { echo "cannot restore fixture dump" >&2; exit 1; }
fi
SH
chmod +x "$WORK/bin/"*
archive="$WORK/archive"
fixture() {
  printf 'fixture dump\n' > "$archive/db.dump"
  printf '{"migrations":["20260902000000_phase00_foundation","20260909090000_phase02_catalog"],"withMedia":false,"mediaFileCount":0}\n' > "$archive/manifest.json"
  (cd "$archive" && sha256sum db.dump manifest.json > checksums.sha256)
}
run_case() {
  local expected=$2 message=$3 rc=0
  export SCENARIO=$1
  : > "$TRACE"
  bash "$VERIFY" "$archive" > "$WORK/output" 2>&1 || rc=$?
  if [[ "$rc" != "$expected" ]] || ! grep -Fq "$message" "$WORK/output"; then
    cat "$WORK/output"
    echo "$SCENARIO: expected exit $expected and $message, got $rc" >&2
    exit 1
  fi
  echo "verify $SCENARIO: OK"
}
fixture
run_case empty 0 '[verify] Product: 0'
run_case populated 0 '[verify] Product: 1'
run_case partial 5 'missing table data in dump: Product'
run_case missing-fk 6 'missing or invalid foreign key Variant_productId_fkey'
run_case orphan 6 'Variant without Product'
run_case query-error 5 'cannot read required table Product'
run_case bad-dump 1 'cannot restore fixture dump'
grep -qx drop "$TRACE"

printf 'tampered\n' >> "$archive/db.dump"
run_case corrupted 3 'checksum failed'
[[ ! -s "$TRACE" ]]
fixture
(cd "$archive" && sha256sum manifest.json > checksums.sha256)
run_case omitted-checksum 3 'checksum members do not match archive'
[[ ! -s "$TRACE" ]]
fixture
printf '{"migrations":["20260902000000_phase00_foundation"]}\n' > "$archive/manifest.json"
(cd "$archive" && sha256sum db.dump manifest.json > checksums.sha256)
run_case missing-migration 2 'migration set mismatch'
fixture
printf '{"migrations":["20260902000000_phase00_foundation","20260909090000_phase02_catalog"],"withMedia":true,"mediaFileCount":1}\n' > "$archive/manifest.json"
(cd "$archive" && sha256sum db.dump manifest.json > checksums.sha256)
run_case missing-media 4 'archive is missing'

fixture
printf '{}\n' >> "$archive/manifest.json"
(cd "$archive" && sha256sum db.dump manifest.json > checksums.sha256)
run_case multiple-manifests 2 'invalid backup manifest'
[[ ! -s "$TRACE" ]]
