#!/usr/bin/env bash
set -euo pipefail
bash "$(dirname "$0")/maintenance.sh"
bash "$(dirname "$0")/restore-handshake.sh"
source "$(dirname "$0")/../lib.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
[[ "$(sanitize_label '../hello world')" == '.._hello_world' ]]
printf ok > "$T/good"; (cd "$T" && zip -q good.zip good); check_zip_archive "$T/good.zip" 10 1000
mkdir -p "$T/tar"; printf ok > "$T/tar/a file.jpg"; tar -C "$T/tar" -cf - . | zstd -q -o "$T/good.tar.zst"; check_tar_archive "$T/good.tar.zst" 10 1000
ln -s /etc/passwd "$T/tar/link"; tar -C "$T/tar" -cf - . | zstd -q -f -o "$T/link.tar.zst"; ! check_tar_archive "$T/link.tar.zst" 10 1000
python3 - "$T/evil.zip" <<'PY'
import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w') as z:z.writestr('../evil','no')
PY
! check_zip_archive "$T/evil.zip" 10 1000
echo 'backup guard tests: OK'

# Fail closed on corrupted operational state; no caller-controlled prefix/path.
export S3_PREFIX_FILE="$T/s3-prefix" S3_BUCKET=test-bucket
[[ "$(s3_active_prefix)" == "" ]]
printf '%s\n' '_hoda_restore/12345678-1234-1234-1234-123456789abc/' > "$S3_PREFIX_FILE"
[[ "$(s3_active_prefix)" == '_hoda_restore/12345678-1234-1234-1234-123456789abc/' ]]
printf '../bad\n' > "$S3_PREFIX_FILE"
! s3_active_prefix
# A failed upload may not activate or erase a generation.
printf '%s\n' '_hoda_restore/12345678-1234-1234-1234-123456789abc/' > "$S3_PREFIX_FILE"
s3_backup_alias(){ return 0; }
mc(){ return 1; }
! publish_s3_media "$T/tar"
[[ "$(s3_active_prefix)" == '_hoda_restore/12345678-1234-1234-1234-123456789abc/' ]]
echo 'S3 generation guard tests: OK'

node --test "$(dirname "$0")/../../ops/retention.test.mjs"
