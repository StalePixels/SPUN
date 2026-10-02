#!/bin/bash
# Runs spun-splash.scn.in, the test of the GUI's splash, in MAME through
# mane-harness, with dot/BUILD-test/spun from build.sh, against the test server
# in .env (make e2e in src/web once after a reset). It checks the splash's last
# picture in Layer 2 (gui-test.py layer2), the hidden pointer during the splash
# (gui-test.py pointers) and the list after it. With
# SPUN_SNAPSHOTS=DIR it copies snapshots of the splash to DIR as p79-splash-*.png,
# has MAME record the run, and makes DIR/p79-splash.mp4 from the recording, from
# just before the GUI opens until the list shows, at the 4:3 shape MAME shows
# (ffmpeg, or FFMPEG). The recording itself (about 750 MB) is deleted.
# Exits with 1 if the run fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
set -a
. "$here/.env"
set +a

spun=$here/../dot/BUILD-test/spun
[ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }

work=$(mktemp -d)
finish() {
    [ -z "${SPUN_TEST_SERVER_DOWN:-}" ] || eval "$SPUN_TEST_SERVER_DOWN"
    rm -rf "$work"
}
trap finish EXIT
[ -z "${SPUN_TEST_SERVER_UP:-}" ] || eval "$SPUN_TEST_SERVER_UP"

scn=$(python3 "$here/gui-test.py" rows "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" < "$here/spun-splash.scn.in")
scn=${scn//@SPUN@/$spun}
scn=${scn//@PORT@/$SPUN_TEST_PORT}
[ -z "${SPUN_SNAPSHOTS:-}" ] || scn+=$'\nmame -aviwrite splash.avi'
printf '%s\n' "$scn" > "$work/spun-splash.scn"

status=0
(cd "$MANE_HARNESS" && ./run.py "$work/spun-splash.scn" --mame "$(command -v "$MAME")") | tee "$work/run.out" || status=$?
run=$(sed -n 's/^run dir *//p' "$work/run.out")
python3 "$here/gui-test.py" pointers "$work/spun-splash.scn" "$run" || status=1
python3 "$here/gui-test.py" layer2 "$work/spun-splash.scn" "$run" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" /nonexistent || status=1

if [ -n "${SPUN_SNAPSHOTS:-}" ]; then
    mkdir -p "$SPUN_SNAPSHOTS"
    for shot in 0008.8:1 0009.2:2 0009.6:3 0010.3:end; do
        cp "$run/snap/snap-${shot%%:*}.png" "$SPUN_SNAPSHOTS/p79-splash-${shot#*:}.png"
    done
    "${FFMPEG:-ffmpeg}" -loglevel error -y -ss 8 -t 3 -i "$run/snap/splash.avi" -an -c:v libx264 \
        -vf scale=640:480,setsar=1 -pix_fmt yuv420p -movflags +faststart "$SPUN_SNAPSHOTS/p79-splash.mp4"
    rm -f "$run/snap/splash.avi"
fi
exit $status
