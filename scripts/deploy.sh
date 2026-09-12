#!/usr/bin/env bash
# Host-side existing-installation deployment (D23/D43); no socket inside ops.
# First installation uses compose directly because there is no prior database.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
WAIT=180 NEXT_APP= NEXT_OPS=
while (($#)); do
  case "$1" in
    --app-image) NEXT_APP=${2:?}; shift 2;;
    --ops-image) NEXT_OPS=${2:?}; shift 2;;
    --wait-seconds) WAIT=${2:?}; shift 2;;
    *) echo 'Usage: scripts/deploy.sh [--app-image sha256:ID --ops-image sha256:ID] [--wait-seconds 20..600]' >&2; exit 2;;
  esac
done
[[ $WAIT =~ ^[0-9]+$ ]] && ((WAIT >= 20 && WAIT <= 600)) || exit 2
[[ -z $NEXT_APP && -z $NEXT_OPS || -n $NEXT_APP && -n $NEXT_OPS ]] || exit 2
valid_image() { [[ $1 =~ ^sha256:[a-f0-9]{64}$ ]]; }
if [[ -n $NEXT_APP ]]; then valid_image "$NEXT_APP" && valid_image "$NEXT_OPS" || exit 2; fi
mkdir -p .deploy/releases
exec 9>.deploy/host.lock
flock -n 9 || { echo 'Another deployment is active.' >&2; exit 3; }
REVISION=$(git rev-parse --verify HEAD)
git diff --quiet && git diff --cached --quiet || { echo 'Deploy requires a clean tracked checkout.' >&2; exit 2; }
ID="$(date -u +%Y%m%dT%H%M%S)-${REVISION:0:12}"
RELEASE="$ROOT/.deploy/releases/$ID"
mkdir "$RELEASE"
BASE=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.yml")
image_for() {
  local container image
  container=$("${BASE[@]}" ps -aq "$1")
  [[ -n $container && $container != *$'\n'* ]] || return 1
  image=$(docker inspect --format '{{.Image}}' "$container")
  valid_image "$image" || return 1
  printf '%s' "$image"
}
OLD_APP=$(image_for app) && OLD_OPS=$(image_for ops) || {
  echo 'A prior app and ops container are required; use the setup guide for first installation.' >&2; exit 4;
}
docker image tag "$OLD_APP" "hoda-app:previous-$ID"
docker image tag "$OLD_OPS" "hoda-ops:previous-$ID"
write_override() {
  printf 'services:\n  app:\n    image: %s\n  ops:\n    image: %s\n  migrate:\n    image: %s\n' "$2" "$3" "$3" > "$1"
}
write_override "$RELEASE/previous.yml" "$OLD_APP" "$OLD_OPS"
OLD=("${BASE[@]}" -f "$RELEASE/previous.yml")
# A build failure cannot change the running stack.
if [[ -z $NEXT_APP ]]; then
  docker build --target runner -t "hoda-app:$REVISION" .
  docker build --target ops -t "hoda-ops:$REVISION" .
  NEXT_APP=$(docker image inspect --format '{{.Id}}' "hoda-app:$REVISION")
  NEXT_OPS=$(docker image inspect --format '{{.Id}}' "hoda-ops:$REVISION")
fi
valid_image "$NEXT_APP" && valid_image "$NEXT_OPS" || exit 2
docker image inspect "$NEXT_APP" "$NEXT_OPS" >/dev/null
write_override "$RELEASE/next.yml" "$NEXT_APP" "$NEXT_OPS"
NEXT=("${BASE[@]}" -f "$RELEASE/next.yml")
printf '%s\n' "$REVISION" > "$RELEASE/revision"
printf 'PREPARED\n' > "$RELEASE/status"
control() {
  local -n compose=$1
  "${compose[@]}" run --rm --no-deps -T --entrypoint node ops --input-type=module - "$2" \
    < "$ROOT/scripts/deploy/maintenance.mjs"
}
BACKUP_KEY= CHANGED=0 OPENED=0 WORKERS=0
APP_CONFIG=$("${OLD[@]}" exec -T app node --input-type=module - fingerprint < "$ROOT/scripts/deploy/maintenance.mjs")
OPS_CONFIG=$(control OLD fingerprint)
[[ $APP_CONFIG =~ ^[a-f0-9]{64}$ && $APP_CONFIG == "$OPS_CONFIG" ]] || {
  echo 'Database/storage configuration changed since the running release. Use a separate migration procedure.' >&2; exit 6;
}
recover() {
  local rc=$?
  trap - EXIT INT TERM
  if ((rc == 0)); then return; fi
  if ((OPENED == 1)); then
    if ((WORKERS == 1)); then printf 'WORKER_START_FAILED\n' > "$RELEASE/status"; else printf 'REOPEN_UNCONFIRMED\n' > "$RELEASE/status"; fi
    echo 'Reopening may have reached the server; keep the new release and its data. Inspect maintenance and retry worker startup; automatic restore is forbidden.' >&2
    exit "$rc"
  fi
  if ((CHANGED == 0)); then
    printf 'ABORTED_BEFORE_MIGRATION\n' > "$RELEASE/status"
    echo "Deployment stopped before migrations; inspect $RELEASE/status. Workers remain stopped after an ambiguous safety failure." >&2
    return "$rc"
  fi
  printf 'ROLLING_BACK\n' > "$RELEASE/status"
  echo 'Deployment failed; recovering pinned previous images and safety backup.' >&2
  "${NEXT[@]}" stop app ops cron >/dev/null || true
  if "${OLD[@]}" up -d --no-build --no-deps app && control OLD on &&
    "${OLD[@]}" run --rm --no-deps -T --entrypoint bash ops -c \
      'exec flock -n "${BACKUP_ROOT:-/backups}/.ops.lock" bash /app/scripts/backup/restore.sh "${BACKUP_ROOT:-/backups}/$1" --yes' _ "$BACKUP_KEY" &&
    "${OLD[@]}" up -d --wait --wait-timeout "$WAIT" --no-build --no-deps app &&
    control OLD health && control OLD off &&
    "${OLD[@]}" up -d --no-build --no-deps ops cron; then
    cp "$RELEASE/previous.yml" "$ROOT/.deploy/active.yml.tmp"
    mv "$ROOT/.deploy/active.yml.tmp" "$ROOT/.deploy/active.yml"
    printf 'ROLLED_BACK\n' > "$RELEASE/status"
    echo 'Previous release and data restored. The requested deployment failed.' >&2
    exit 42
  fi
  control OLD on >/dev/null 2>&1 || true
  printf 'ROLLBACK_FAILED\n' > "$RELEASE/status"
  echo "Recovery failed; workers remain stopped. Retained images and backup key: $RELEASE" >&2
  exit 43
}
trap recover EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${OLD[@]}" stop ops cron
# Supply controller on stdin so older generation-aware ops images work too.
control OLD on
control OLD drain
BACKUP_KEY=$("${OLD[@]}" run --rm --no-deps -T --entrypoint bash ops -s -- "deploy-$ID" \
  < "$ROOT/scripts/deploy/backup.sh")
[[ $BACKUP_KEY =~ ^20[0-9]{2}-[0-9]{2}-[0-9]{2}_[0-9_]+_deploy-[a-zA-Z0-9_-]+$ ]] || exit 5
printf '%s\n' "$BACKUP_KEY" > "$RELEASE/backup-key"
printf 'BACKED_UP\n' > "$RELEASE/status"
CHANGED=1
"${NEXT[@]}" run --rm --no-deps -T migrate
"${NEXT[@]}" up -d --wait --wait-timeout "$WAIT" --no-build --no-deps app
control NEXT health
cp "$RELEASE/next.yml" "$ROOT/.deploy/active.yml.tmp"
mv "$ROOT/.deploy/active.yml.tmp" "$ROOT/.deploy/active.yml"
# The off request can reach the server even when its response is lost.
# Cross the no-restore boundary BEFORE sending it to protect new orders.
OPENED=1
CHANGED=0
control NEXT off
WORKERS=1
"${NEXT[@]}" up -d --no-build --no-deps ops cron
printf 'SUCCEEDED\n' > "$RELEASE/status"
echo "Deployment succeeded: $REVISION. Previous images and safety backup retained."
