#!/usr/bin/env bash
# Runs inside previous ops. Only the validated generated key goes to stdout.
set -euo pipefail
label=${1:?}
[[ $label =~ ^deploy-[0-9]{8}T[0-9]{6}-[a-f0-9]{12}$ ]] || exit 2
root=${BACKUP_ROOT:-/backups}
exec 8>"$root/.ops.lock"
flock -n 8 || exit 3
grep -q 's3_active_prefix' /app/scripts/backup/lib.sh || { echo 'Upgrade to generation-aware ops before using automatic rollback.' >&2; exit 4; }
bash /app/scripts/backup/backup.sh --kind safety --label "$label" >&2
mapfile -d '' matches < <(find "$root" -mindepth 1 -maxdepth 1 -type d -name "*_$label" -print0)
[[ ${#matches[@]} == 1 ]] || exit 5
archive=${matches[0]}
bash /app/scripts/backup/verify.sh "$archive" >&2
basename "$archive"
