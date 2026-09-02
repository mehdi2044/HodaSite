#!/usr/bin/env bash
# Unit tests for scripts/backup/lib.sh (no database needed; psql is stubbed). Run: bash scripts/backup/tests/run.sh
# CI (Phase 00) runs this on every PR. Max: keep every case green; add a case for every new guard.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; source "$HERE/../lib.sh"
T=$(mktemp -d); PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ✅ $1"; }; ko(){ FAIL=$((FAIL+1)); echo "  ❌ $1"; }
expect_ok(){ if "$@" >/dev/null 2>&1; then ok "$NAME"; else ko "$NAME (expected PASS)"; fi; }
expect_fail(){ if "$@" >/dev/null 2>&1; then ko "$NAME (expected REJECT)"; else ok "$NAME"; fi; }
command -v zstd >/dev/null || { echo "zstd binary required (ops image has it)"; exit 2; }
cd "$T"

echo "== zip: uncompressed size is parsed as a NUMBER (regression for v1.1.2 bug)"
mkdir z && echo hello > z/a.txt && head -c 100000 /dev/urandom > z/b.bin && (cd z && zip -q ../normal.zip a.txt b.bin)
n=$(zip_uncompressed_bytes normal.zip); NAME="zip size = $n (expect 100006)"; [[ "$n" == "100006" ]] && ok "$NAME" || ko "$NAME"
NAME="normal zip within limits → PASS";       expect_ok   check_zip_archive normal.zip 1000 200000
NAME="normal zip over byte cap → REJECT";     expect_fail check_zip_archive normal.zip 1000 50000
NAME="normal zip over entry cap → REJECT";    expect_fail check_zip_archive normal.zip 1 200000
# crafted zip with traversal entry (built with python so the ../ survives)
python3 - <<'PY'
import zipfile; z=zipfile.ZipFile('evil.zip','w'); z.writestr('../../etc/evil','x'); z.close()
PY
NAME="zip with ../ traversal → REJECT";       expect_fail check_zip_archive evil.zip 1000 200000
NAME="corrupt zip → REJECT";                  echo notazip > bad.zip; expect_fail check_zip_archive bad.zip 1000 200000

echo "== tar.zst: links, traversal, file cap, real uncompressed byte cap"
mkdir -p m/2026/09 && head -c 50000 /dev/urandom > "m/2026/09/a b.bin"
python3 - <<'PY'   # a real (valid) 2x2 PNG so `file` reports image/png
import zlib,struct
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
raw=b''.join(b'\x00'+b'\xff\x00\x00'*2 for _ in range(2))
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
open('m/2026/09/ok.png','wb').write(png)
PY
tar -C m -cf - . | zstd -q -o normal.tar.zst
exp=$(( 50000 + $(stat -c %s m/2026/09/ok.png) )); n=$(tar_uncompressed_bytes normal.tar.zst); NAME="tar size = $n (expect $exp)"; [[ "$n" == "$exp" ]] && ok "$NAME" || ko "$NAME"
NAME="normal tar (name with space) → PASS";   expect_ok   check_tar_archive normal.tar.zst 1000 100000
NAME="tar over byte cap → REJECT";            expect_fail check_tar_archive normal.tar.zst 1000 10000
NAME="tar over file cap → REJECT";            expect_fail check_tar_archive normal.tar.zst 1 100000
ln -s /etc/passwd m/link.png; tar -C m -cf - . | zstd -q -o link.tar.zst; rm m/link.png
NAME="tar with symlink → REJECT";             expect_fail check_tar_archive link.tar.zst 1000 100000
python3 - <<'PY'
import tarfile,io; t=tarfile.open('trav.tar','w'); d=b'x'; i=tarfile.TarInfo('../../etc/x'); i.size=1; t.addfile(i,io.BytesIO(d)); t.close()
PY
zstd -q trav.tar -o trav.tar.zst
NAME="tar with ../ traversal → REJECT";       expect_fail check_tar_archive trav.tar.zst 1000 100000

echo "== validate_media_dir: content + DB consistency, FAIL-CLOSED on DB errors"
mkdir -p bin; export PATH="$T/bin:$PATH"
printf '#!/bin/sh\nprintf "2026/09/ok.png\\n2026/09/a b.bin\\n"\n' > bin/psql; chmod +x bin/psql
NAME="good media + DB keys present → PASS";   expect_ok   validate_media_dir "$T/m" "postgres://stub" 25
printf '#!/bin/sh\nprintf "2026/09/ok.png\\n2026/09/MISSING.png\\n"\n' > bin/psql
NAME="DB key missing on disk → REJECT";       expect_fail validate_media_dir "$T/m" "postgres://stub" 25
printf '#!/bin/sh\necho "ERROR: relation Media does not exist" >&2; exit 1\n' > bin/psql
NAME="DB query fails → REJECT (fail-closed)"; expect_fail validate_media_dir "$T/m" "postgres://stub" 25
NAME="DB query fails but MEDIA_DB_CHECK=skip in production → still REJECT"; NODE_ENV=production MEDIA_DB_CHECK=skip expect_fail validate_media_dir "$T/m" "postgres://stub" 25
NAME="DB query fails, MEDIA_DB_CHECK=skip in dev → PASS with warning"; NODE_ENV=development MEDIA_DB_CHECK=skip expect_ok validate_media_dir "$T/m" "postgres://stub" 25
printf '#!/bin/sh\nprintf "2026/09/ok.png\\n"\n' > bin/psql
: > m/2026/09/empty.jpg; NAME="empty media file → REJECT";  expect_fail validate_media_dir "$T/m" "postgres://stub" 50; rm m/2026/09/empty.jpg
echo "not an image" > m/2026/09/fake.jpg; NAME="wrong MIME (.jpg is text) → REJECT"; expect_fail validate_media_dir "$T/m" "postgres://stub" 50; rm m/2026/09/fake.jpg

echo "== sanitize_label"
l=$(sanitize_label "pre restore'); drop table x; --"); NAME="label sanitized → $l"; [[ "$l" =~ ^[A-Za-z0-9._-]+$ && "$l" != *"'"* && "$l" != *";"* ]] && ok "$NAME" || ko "$NAME"
l=$(sanitize_label "$(printf 'a%.0s' {1..80})"); NAME="label max 40 chars"; [[ ${#l} -eq 40 ]] && ok "$NAME" || ko "$NAME"

echo; echo "PASS=$PASS FAIL=$FAIL"; rm -rf "$T"; [[ $FAIL -eq 0 ]]
