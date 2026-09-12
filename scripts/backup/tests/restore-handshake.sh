#!/usr/bin/env bash
# Execute the real restore control flow with process boundaries replaced by
# fixtures. This proves a failed drain cannot reach backup/pg_restore/migrate.
set -euo pipefail
SOURCE=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/scripts" "$T/archive" "$T/app/prisma/migrations"
cp "$SOURCE/restore.sh" "$SOURCE/lib.sh" "$SOURCE/maintenance.sh" "$T/scripts/"
touch "$T/app/prisma/migrations/migration_lock.toml"
printf 'fixture dump' > "$T/archive/db.dump"
printf '{"projectId":"test-project","migrations":[]}' > "$T/archive/manifest.json"
(cd "$T/archive" && sha256sum db.dump manifest.json > checksums.sha256)
cat > "$T/bin/curl" <<'SH'
#!/usr/bin/env bash
printf 'curl\n' >> "$TRACE"
case "$*" in
  *state=off*)
    [[ "$SCENARIO" != off-fails ]] || exit 22
    printf '{"state":"off","inFlight":0}';;
  *state=on*) printf '{"state":"on","inFlight":0}';;
  *)
    if [[ "$SCENARIO" == busy ]]; then printf '{"state":"on","inFlight":1}'
    elif [[ "$SCENARIO" == drain-fails ]]; then exit 22
    else printf '{"state":"on","inFlight":0}'; fi;;
esac
SH
cat > "$T/bin/sleep" <<'SH'
#!/usr/bin/env bash
exit 0
SH
for tool in pg_restore psql npx; do
  cat > "$T/bin/$tool" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "${0##*/}" >> "$TRACE"
SH
done
cat > "$T/scripts/backup.sh" <<'SH'
#!/usr/bin/env bash
printf 'backup\n' >> "$TRACE"
SH
cat > "$T/scripts/verify.sh" <<'SH'
#!/usr/bin/env bash
printf 'verify\n' >> "$TRACE"
[[ "$SCENARIO" != verify-fails ]]
SH
chmod +x "$T/bin/"* "$T/scripts/"*.sh
export PATH="$T/bin:$PATH" TRACE="$T/trace" APP_SRC="$T/app"
export DATABASE_URL=fixture APP_URL=http://app:3000 MAINTENANCE_SECRET=test-only PROJECT_ID=test-project MEDIA_DIR="$T/media"
run_case() {
  local expected=$2 rc=0
  export SCENARIO=$1
  : > "$TRACE"
  bash "$T/scripts/restore.sh" "$T/archive" --yes --db-only > "$T/output" 2>&1 || rc=$?
  if [[ $rc != "$expected" ]]; then cat "$T/output"; echo "$SCENARIO: expected $expected, got $rc"; exit 1; fi
}
for scenario in busy drain-fails; do
  run_case "$scenario" 21
  ! grep -Eq '^(backup|pg_restore|npx|verify)$' "$TRACE"
done
run_case off-fails 41
grep -q '^pg_restore$' "$TRACE"
! grep -q 'completed successfully' "$T/output"
run_case verify-fails 40
! grep -q 'completed successfully' "$T/output"
run_case success 0
grep -q 'completed successfully' "$T/output"
[[ $(grep -E '^(backup|pg_restore|npx|verify)$' "$TRACE") == $'backup\npg_restore\nnpx\nverify' ]]
printf 'tampered' >> "$T/archive/db.dump"
run_case invalid 15
# Archive rejection happens before maintenance and before a live DB mutation.
[[ ! -s "$TRACE" ]]
echo 'restore control-flow guards: OK'
