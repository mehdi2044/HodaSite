#!/usr/bin/env bash
# Runs INSIDE the ops container. Proves the backup guards actually reject bad
# input in the real image (not just that the code is present).
set -euo pipefail
cd /app

: "${BACKUP_ROOT:?}"; : "${APP_URL:?}"; : "${MAINTENANCE_SECRET:?}"

echo "== the shipped guard test suite, in the real ops image =="
bash scripts/backup/tests/run.sh

echo "== a zip containing ../evil is rejected =="
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT; cd "$W"
python3 - <<'PY'
import zipfile
with zipfile.ZipFile("evil.zip", "w") as z:
    z.writestr("../evil", "no")
PY
source /app/scripts/backup/lib.sh
! check_zip_archive evil.zip 10 1000 || { echo "traversal zip was NOT rejected"; exit 1; }
echo "  traversal zip rejected"

echo "== a media archive containing a symlink is rejected =="
mkdir m && printf ok > "m/a file.jpg" && ln -s /etc/passwd m/link
tar -C m -cf - . | zstd -q -o media.tar.zst
! check_tar_archive media.tar.zst 10 1000 || { echo "symlink tar was NOT rejected"; exit 1; }
echo "  symlink tar rejected"
cd /app

echo "== a tampered manifest.json fails the checksum during restore =="
DIR=$(ls -dt "$BACKUP_ROOT"/*_ci | head -1)
T=/tmp/tampered; rm -rf "$T"; cp -r "$DIR" "$T"
echo '{"projectId":"hoda-ci","migrations":[]}' > "$T/manifest.json"
if scripts/backup/restore.sh "$T" --yes --db-only > /tmp/tamper.log 2>&1; then
  echo "tampered manifest was ACCEPTED"; cat /tmp/tamper.log; exit 1
fi
grep -qi checksum /tmp/tamper.log || { echo "restore failed for the wrong reason:"; cat /tmp/tamper.log; exit 1; }
echo "  tampered manifest rejected at checksum"

# restore.sh turns maintenance on when it aborts — clear it for teardown
curl -fsS -X POST "$APP_URL/api/system/maintenance" \
  -H "x-maintenance-secret: $MAINTENANCE_SECRET" -d "state=off" >/dev/null || true

echo "OPS NEGATIVE GUARDS OK"
