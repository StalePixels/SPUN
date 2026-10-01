#!/bin/bash
# Runs spun-get.scn.in in MAME through esp-harness, with the values in .env, twice:
#   spun-get:   dot/BUILD-test/spun with no options (its default server)
#   spun-get-s: dot/BUILD-test-s/spun with -s and -p
set -eu

here=$(cd "$(dirname "$0")" && pwd)
set -a
. "$here/.env"
set +a

work=$(mktemp -d)
finish() {
    [ -z "${SPUN_TEST_SERVER_DOWN:-}" ] || eval "$SPUN_TEST_SERVER_DOWN"
    rm -rf "$work"
}
trap finish EXIT
[ -z "${SPUN_TEST_SERVER_UP:-}" ] || eval "$SPUN_TEST_SERVER_UP"

scenario() {
    local name=$1 spun=$here/../dot/$2/spun opts=$3
    [ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }
    sed -e "s|@SPUN@|$spun|" -e "s|@OPTS@|$opts|" \
        -e "s|@APP@|$SPUN_TEST_APP|g" -e "s|@FIND@|$SPUN_TEST_FIND|g" \
        "$here/spun-get.scn.in" > "$work/$name.scn"

    (cd "$ESP_HARNESS" && ./run.py "$work/$name.scn" --mame "$(command -v "$MAME")") | tee "$work/$name.out"

    if [ -n "${HDFMONKEY:-}" ]; then
        local run
        run=$(sed -n 's/^run dir *//p' "$work/$name.out")
        "$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/$name.cat"
        cat "$work/$name.cat"
    fi
}

scenario spun-get BUILD-test ""
scenario spun-get-s BUILD-test-s "-s $SPUN_TEST_SERVER -p $SPUN_TEST_PORT "
