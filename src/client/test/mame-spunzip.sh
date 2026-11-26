#!/bin/bash
# Runs spunzip.scn.in in MAME through pinesy-harness with spunzip/BUILD/spunzip
# (make -C ../spunzip), then reads the files from the SD image with hdfmonkey:
# each must be the same as its payload, or must not be there. The lines for the
# stock .unzip are a control and do not change the exit status.
# Exits with 1 if a check of .spunzip fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
set -a
. "$here/.env"
set +a

spunzip=$here/../spunzip/BUILD/spunzip
[ -f "$spunzip" ] || { echo "No $spunzip: run make in src/client/spunzip first" >&2; exit 1; }
[ -n "${HDFMONKEY:-}" ] || { echo "HDFMONKEY is not set in .env" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# MAC.ZIP has SPZROOT.DOT at its root: .spunzip leaves it in the target
# directory and writes nothing to C:/dot.
# IMPL.ZIP is a stored zip whose headers then name method 6, implode: .spunzip
# refuses it from the method field, before it reads any data.
python3 - "$work" <<'PY'
import os, struct, sys
from zipfile import ZIP_STORED, ZIP_DEFLATED, ZipFile
work = sys.argv[1]
os.makedirs(f'{work}/old')
os.makedirs(f'{work}/new')
data = (bytes(range(256)) * 129)[:33001]
entries = [('A_S.BIN', data, ZIP_STORED), ('B_D.BIN', data[::-1], ZIP_DEFLATED)]
for name, payload, _ in entries:
    open(f'{work}/{name}', 'wb').write(payload)
    open(f'{work}/old/{name}', 'wb').write(b'old ' + name.encode())
for filename, order in [('SFIRST.ZIP', entries), ('DFIRST.ZIP', entries[::-1])]:
    with ZipFile(f'{work}/{filename}', 'w') as archive:
        for name, payload, method in order:
            archive.writestr(name, payload, compress_type=method)
with ZipFile(f'{work}/ASK.ZIP', 'w', ZIP_DEFLATED) as archive:
    for n in range(1, 6):
        open(f'{work}/new/P{n}.TXT', 'wb').write(f'new P{n}\n'.encode())
        open(f'{work}/old/P{n}.TXT', 'wb').write(f'old P{n}\n'.encode())
        archive.writestr(f'P{n}.TXT', f'new P{n}\n')
with ZipFile(f'{work}/JUNK.ZIP', 'w') as archive:
    archive.writestr('sub/', b'')
    archive.writestr('sub/dir/', b'')
    archive.writestr('sub/dir/A_S.BIN', data, compress_type=ZIP_STORED)
    archive.writestr('x/B_D.BIN', data[::-1], compress_type=ZIP_DEFLATED)
mac = [('README.TXT', b'readme\n'), ('SPZROOT.DOT', b'root dot\n'), ('__MACOSX/', b''), ('__MACOSX/._README.TXT', b'resource fork\n'),
       ('._SPARE.TXT', b'apple double\n'), ('.DS_Store', b'finder\n'), ('sub/', b''),
       ('sub/.DS_Store', b'finder in sub\n'), ('sub/KEEP.TXT', b'keep\n')]
with ZipFile(f'{work}/MAC.ZIP', 'w', ZIP_DEFLATED) as archive:
    for name, payload in mac:
        archive.writestr(name, payload)
        if not name.endswith('/'):
            os.makedirs(os.path.dirname(f'{work}/mac/{name}'), exist_ok=True)
            open(f'{work}/mac/{name}', 'wb').write(payload)
with ZipFile(f'{work}/IMPL.ZIP', 'w') as archive:
    archive.writestr('IMPL.TXT', b'imploded\n', compress_type=ZIP_STORED)
zip = bytearray(open(f'{work}/IMPL.ZIP', 'rb').read())
for sig, at in [(b'PK\x03\x04', 8), (b'PK\x01\x02', 10)]:
    i = zip.find(sig)
    struct.pack_into('<H', zip, i + at, 6)
open(f'{work}/IMPL.ZIP', 'wb').write(zip)
PY

sed -e "s|@SPUNZIP@|$spunzip|" -e "s|@WORK@|$work|g" "$here/spunzip.scn.in" > "$work/spunzip.scn"
(cd "$PINESY_HARNESS" && ./run.py "$work/spunzip.scn" --keep-image) | tee "$work/run.out" || true
status=0
run=$(sed -n 's/^run dir *//p' "$work/run.out")

# TOOL PATH LOCAL: PATH on the image is the same as LOCAL, or is not there when LOCAL is -
check() {
    local tool=$1 path=$2 local=$3 result
    if ! "$HDFMONKEY" get "$run/sd.img" "$path" "$work/got" > /dev/null 2>&1; then
        if [ "$local" = - ]; then result="ABSENT OK"; else result=MISSING; fi
    elif [ "$local" = - ]; then
        result="PRESENT (should not be)"
    elif cmp -s "$work/got" "$local"; then
        result=MATCH
    else
        result="DIFFERENT ($(wc -c < "$work/got" | tr -d ' ') bytes)"
    fi
    echo "$tool $path $result"
    case $result in MATCH|"ABSENT OK") ;; *) [ "$tool" != .spunzip ] || status=1 ;; esac
}

# TOOL DIR [-]: both members of SFIRST and DFIRST in DIR, or neither with -
pair() {
    local name
    for name in A_S.BIN B_D.BIN; do
        if [ "${3:-}" = - ]; then check "$1" "$2/$name" -; else check "$1" "$2/$name" "$work/$name"; fi
    done
}

# DIR NAME: no directory NAME in DIR
nodir() {
    local result="ABSENT OK"
    if "$HDFMONKEY" ls "$run/sd.img" "$1" 2>/dev/null | grep -qiw -- "$2"; then result="PRESENT (should not be)"; status=1; fi
    echo ".spunzip $1/$2/ $result"
}

check .spunzip /zt/a/P1.TXT "$work/new/P1.TXT"
check .spunzip /zt/a/P2.TXT "$work/old/P2.TXT"
for n in 3 4 5; do check .spunzip /zt/a/P$n.TXT "$work/new/P$n.TXT"; done
for n in 1 2 3 4 5; do check .spunzip /zt/aq/P$n.TXT "$work/old/P$n.TXT"; done
pair .spunzip /zt/s
pair .spunzip /zt/d
pair .spunzip /zt/qs
pair .spunzip /zt/qd
pair .spunzip /zt/o
pair .spunzip /zt/q
pair .spunzip /zt/j
nodir /zt/j sub
nodir /zt/j x
pair .spunzip /zt/v -
check .spunzip /zt/mn/README.TXT "$work/mac/README.TXT"
check .spunzip /zt/mn/sub/KEEP.TXT "$work/mac/sub/KEEP.TXT"
check .spunzip /zt/mn/SPZROOT.DOT "$work/mac/SPZROOT.DOT"
check .spunzip /dot/SPZROOT -
for name in __MACOSX/._README.TXT ._SPARE.TXT .DS_Store sub/.DS_Store; do check .spunzip "/zt/mn/$name" -; done
nodir /zt/mn __MACOSX
for name in README.TXT __MACOSX/._README.TXT ._SPARE.TXT .DS_Store sub/.DS_Store sub/KEEP.TXT; do
    check .spunzip "/zt/mm/$name" "$work/mac/$name"
done
pair .spunzip /zt/x
pair .spunzip /zt/c
check .spunzip /zt/i/IMPL.TXT -
for line in 40 180; do
    if "$HDFMONKEY" get "$run/sd.img" /zt/err$line "$work/got" > /dev/null 2>&1; then
        echo ".spunzip error at line $line MATCH"
    else
        echo ".spunzip error at line $line MISSING"
        status=1
    fi
done
# Lines after 180 are the stock .unzip's
for name in $("$HDFMONKEY" ls "$run/sd.img" /zt 2>/dev/null | grep -o 'err[0-9]*' || true); do
    line=${name#err}
    if [ "$line" -gt 180 ]; then echo ".unzip error at line $line"
    elif [ "$line" != 40 ] && [ "$line" != 180 ]; then echo ".spunzip error at line $line UNEXPECTED"; status=1; fi
done
for name in README.TXT __MACOSX/._README.TXT ._SPARE.TXT .DS_Store sub/.DS_Store sub/KEEP.TXT; do
    check .unzip "/zt/mu/$name" "$work/mac/$name"
done
pair .unzip /zt/nd
pair .unzip /zt/ns
echo "run dir $run"
exit $status
