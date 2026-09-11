#!/usr/bin/env bash
# Runs in ops, using the real bucket. Stop staging after upload but before verification/activation.
set -euo pipefail
source /app/scripts/backup/lib.sh
W=$(mktemp -d)
trap 'rm -rf -- "$W"' EXIT
before=$(s3_active_prefix)
[[ "$before" == _hoda_restore/* ]] || { echo 'run after a successful S3 restore'; exit 1; }
mkdir "$W/source"
printf 'interrupted-generation' > "$W/source/probe.txt"
cat > "$W/stage.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
source /app/scripts/backup/lib.sh
mc(){
  if [[ "$1" == mirror && "$2" == backupsource/* ]]; then
    # The upload has completed. Hold the real verification read so CI can kill
    # this entire process group at a precise pre-activation boundary.
    touch "$STAGE_MARKER"
    sleep 60
  fi
  command mc "$@"
}
publish_s3_media "$STAGE_SOURCE"
SCRIPT
# Use a named environment variable rather than exposing credentials in arguments.
STAGE_SOURCE="$W/source" STAGE_MARKER="$W/ready" setsid bash "$W/stage.sh" > "$W/stage.log" 2>&1 &
staging_pid=$!
ready=0
for _ in $(seq 1 100); do
  if [[ -f "$W/ready" ]]; then ready=1; break; fi
  if ! kill -0 "$staging_pid" 2>/dev/null; then break; fi
  sleep .1
done
kill -TERM -- "-$staging_pid" 2>/dev/null || true
wait "$staging_pid" 2>/dev/null || true
[[ "$ready" == 1 ]] || { cat "$W/stage.log"; echo 'staging boundary not reached'; exit 1; }
[[ "$(s3_active_prefix)" == "$before" ]] || { echo 'interrupted staging changed active generation'; exit 1; }
s3_backup_alias
mc cat "backupsource/$S3_BUCKET/${before}media/2026/09/smoke.png" > "$W/proof.png"
cmp "$W/proof.png" /data/media/media/2026/09/smoke.png
echo 'S3 interrupted staging: previous active objects and pointer intact'
