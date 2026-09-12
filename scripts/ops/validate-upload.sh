#!/usr/bin/env bash
# Quarantine validation has no maintenance side effects and never touches live data.
set -euo pipefail
source "$(dirname "$0")/../backup/lib.sh"
SRC=${1:?}; DEST=${2:?}
check_zip_archive "$SRC" "${RESTORE_MAX_FILES:-200000}" "${RESTORE_MAX_UNCOMPRESSED_BYTES:-53687091200}"
# The panel accepts only the four generated root members, never arbitrary names,
# links, duplicate entries, nested archives, or extra database command files.
python3 - "$SRC" <<'PY'
import stat, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    names=z.namelist()
    allowed={'db.dump','manifest.json','checksums.sha256','media.tar.zst'}
    assert len(names)==len(set(names)) and set(names)<=allowed
    assert {'db.dump','manifest.json','checksums.sha256'}<=set(names)
    assert all(not stat.S_ISLNK(i.external_attr >> 16) for i in z.infolist())
PY
mkdir -p "$DEST"
unzip -q -n "$SRC" -d "$DEST"
[[ $(jq -r .projectId "$DEST/manifest.json") == "${PROJECT_ID:?}" ]]
python3 - "$DEST" <<'PY'
import hashlib, pathlib, re, sys
p=pathlib.Path(sys.argv[1]); records={}
for line in (p/'checksums.sha256').read_text().splitlines():
    m=re.fullmatch(r'([a-f0-9]{64}) [ *](db.dump|manifest.json|media.tar.zst)',line)
    assert m and m[2] not in records
    records[m[2]]=m[1]
assert set(records)=={x.name for x in p.iterdir() if x.name!='checksums.sha256'}
for name,digest in records.items():
    with (p/name).open('rb') as f: assert hashlib.file_digest(f,'sha256').hexdigest()==digest
PY
jq -r '.migrations[]?' "$DEST/manifest.json" | sort > "$DEST/migrations.tmp"
ls "${APP_SRC:-/app}/prisma/migrations" | grep -v migration_lock | sort > "$DEST/code.tmp"
[[ -z $(comm -23 "$DEST/migrations.tmp" "$DEST/code.tmp") ]]
rm "$DEST/migrations.tmp" "$DEST/code.tmp"
bash "$(dirname "$0")/../backup/verify.sh" "$DEST"
