#!/bin/bash
# Runs spun-app.scn.in, the test of the GUI's app page, in MAME through
# mane-harness, with dot/BUILD-test/spun from build.sh, against the test server
# in .env. Needs the e2e users, so run make e2e in src/web once after a reset.
# Before the run it adds the GUI test apps and the screenshots of gui024 and
# gui022 to the e2e
# database and storage (src/web/e2e/gui-catalogue.mts, gui-screenshots.mts)
# and removes them after it. The GUI reaches the server through gui-test.py's
# proxy, whose log of commands must match the scenario. With SPUN_SNAPSHOTS=DIR
# it copies the run's snapshots for the report to DIR as p77-*.png.
# Exits with 1 if the run fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../../web" && pwd)
set -a
. "$here/.env"
set +a
storage=$(sed -n 's/^E2E_STORAGE_DIR=//p' "$web/.env.e2e")

spun=$here/../dot/BUILD-test/spun
[ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }

work=$(mktemp -d)
proxy=
finish() {
    [ -z "$proxy" ] || kill "$proxy" 2>/dev/null || true
    (cd "$web" && pnpm exec tsx e2e/gui-screenshots.mts remove && node e2e/gui-catalogue.mts remove) || true
    [ -z "${SPUN_TEST_SERVER_DOWN:-}" ] || eval "$SPUN_TEST_SERVER_DOWN"
    rm -rf "$work"
}
trap finish EXIT
[ -z "${SPUN_TEST_SERVER_UP:-}" ] || eval "$SPUN_TEST_SERVER_UP"
(cd "$web" && node e2e/gui-catalogue.mts add && pnpm exec tsx e2e/gui-screenshots.mts add)

port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 "$here/gui-test.py" proxy "$port" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "NO SLOW READ" "$work/commands.log" > "$work/proxy.out" 2>&1 &
proxy=$!
for _ in $(seq 50); do grep -q listening "$work/proxy.out" && break; sleep 0.1; done

scn=$(python3 "$here/gui-test.py" rows "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" < "$here/spun-app.scn.in")
scn=${scn//@SPUN@/$spun}
scn=${scn//@PORT@/$port}
printf '%s\n' "$scn" > "$work/spun-app.scn"

status=0
(cd "$MANE_HARNESS" && ./run.py "$work/spun-app.scn" --mame "$(command -v "$MAME")") | tee "$work/run.out" || status=$?
run=$(sed -n 's/^run dir *//p' "$work/run.out")
python3 "$here/gui-test.py" pointers "$work/spun-app.scn" "$run" || status=1
python3 "$here/gui-test.py" layer2 "$work/spun-app.scn" "$run" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "$storage/public" || status=1

# After .spun, NextZXOS has its Layer 2 back as it was: the palette, the
# registers and the RAM of its Layer 2 bank
for part in pal.bin regs.txt ram.bin; do
    if cmp -s "$run/dump-before-$part" "$run/dump-after-$part"; then
        echo "layer2    NextZXOS's $part the same after .spun MATCH"
    else
        echo "layer2    NextZXOS's $part the same after .spun DIFFERENT"
        status=1
    fi
done
cat "$run/dump-before-regs.txt"

# And its tile area of bank 5: the tilemap, and the tile definitions 32-255
# ($5D00-$63FF) up to VARS. From VARS on are BASIC's variables, workspace and
# free memory, which the BASIC program after .spun changes itself
if cmp -s "$run/dump-map-before.bin" "$run/dump-map-after.bin"; then
    echo "bank5     NextZXOS's tilemap area \$6C00-\$7FFF the same after .spun MATCH"
else
    echo "bank5     NextZXOS's tilemap area \$6C00-\$7FFF the same after .spun DIFFERENT"
    status=1
fi
python3 - "$run" <<'PY' || status=1
import sys
run = sys.argv[1]
def read(name):
    return open(f'{run}/dump-{name}.bin', 'rb').read()
def word(sysvars, address):
    return int.from_bytes(sysvars[address - 0x5C4B:address - 0x5C4B + 2], 'little')
before, after = read('tiles-before'), read('tiles-after')
vars_ = min(word(read('sysvars-before'), 0x5C4B), word(read('sysvars-after'), 0x5C4B))
low = max(vars_ - 0x5D00, 0)
same = before[:low] == after[:low]
print(f'bank5     NextZXOS\'s tile definition area $5D00-${vars_ - 1:04X} (up to VARS) the same after .spun '
      f'{"MATCH" if same else "DIFFERENT"}')
sys.exit(0 if same else 1)
PY

# Each page is asked for when it is shown. Thumbnails come only for the slots
# that SPINFO lists, and not again after a changelog; gui023 gets none
thumbs=$(printf 'GET <user>/thumb/gui024/%s\n' 1 2 3 5)
all=$(printf 'GET <user>/thumb/gui022/%s\n' 1 2 3 4 5)
want=$(printf '%s\n' "SPLIST 1" "SPINFO gui024 1" "$thumbs" "SPCLOG gui024 3" "SPINFO gui024 1" \
    "GET <user>/nxi/gui024/1" "SPINFO gui024 1" "$thumbs" "GET <user>/nxi/gui024/2" "SPINFO gui024 1" "$thumbs" \
    "SPCLOG gui024 2" "SPINFO gui024 1" "SPLIST 1" "SPINFO gui023 1" "SPLIST 1" "SPINFO gui022 1" "$all" "SPLIST 1")
got=$(sed -En 's/^[0-9.]* (SP.*|GET .*)/\1/p' "$work/commands.log" | sed 's|^GET [^/]*/|GET <user>/|')
echo "commands sent: $(printf '%s' "$got" | tr '\n' ',')"
if [ "$got" != "$want" ]; then
    echo "FAIL: the commands should be: $(printf '%s' "$want" | tr '\n' ',')"
    status=1
fi

if [ -n "${SPUN_SNAPSHOTS:-}" ]; then
    mkdir -p "$SPUN_SNAPSHOTS"
    for shot in 0023.5:app 0027.0:changelog 0035.5:loading 0041.5:full320 0056.5:full256 0078.5:placeholder 0091.5:allslots; do
        cp "$run/snap/snap-${shot%%:*}.png" "$SPUN_SNAPSHOTS/p77-${shot#*:}.png"
    done
    cp "$run/montage.png" "$SPUN_SNAPSHOTS/p77-montage.png"
fi
exit $status
