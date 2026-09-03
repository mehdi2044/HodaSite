#!/usr/bin/env bash
set -euo pipefail
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
