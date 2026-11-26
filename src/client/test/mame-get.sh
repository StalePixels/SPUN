#!/bin/bash
# Runs spun-get.scn.in in MAME through pinesy-harness, with the values in .env, twice:
#   spun-get:   dot/BUILD-test/spun with no options (its default server)
#   spun-get-s: dot/BUILD-test-s/spun with -s and -p
# Exits with 1 if either run fails.
set -euo pipefail

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

# The app's title, which .spun prints before the unzip
title=$(python3 - "$here" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "$SPUN_TEST_APP" <<'PY'
import importlib.util, sys
here, host, port, app = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
spec = importlib.util.spec_from_file_location('g', f'{here}/gui-test.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
print(g.info(host, port, app)['title'])
PY
)

scenario() {
    local name=$1 spun=$here/../dot/$2/spun opts=$3
    [ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }
    sed -e "s|@SPUN@|$spun|" -e "s|@OPTS@|$opts|" \
        -e "s|@APP@|$SPUN_TEST_APP|g" -e "s|@FIND@|$SPUN_TEST_FIND|g" \
        "$here/spun-get.scn.in" > "$work/$name.scn.tmp"
    scn=$(cat "$work/$name.scn.tmp")
    printf '%s\n' "${scn//@TITLE@/$title}" > "$work/$name.scn"

    local status=0
    (cd "$PINESY_HARNESS" && ./run.py "$work/$name.scn" --keep-image) | tee "$work/$name.out" || status=$?

    sed -n 's/^run dir *//p' "$work/$name.out" >> "$work/runs.list"
    if [ -n "${HDFMONKEY:-}" ]; then
        local run
        run=$(sed -n 's/^run dir *//p' "$work/$name.out")
        "$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/$name.cat"
        cat "$work/$name.cat"
    fi
    return $status
}

failed=0
scenario spun-get BUILD-test "" || failed=1
scenario spun-get-s BUILD-test-s "-s $SPUN_TEST_SERVER -p $SPUN_TEST_PORT " || failed=1
# The runs keep their images so that this script can read them; it deletes them when every check passed.
if [ "$failed" -eq 0 ] && [ -f "$work/runs.list" ]; then
    while read -r r; do rm -f "$(readlink "$r/sd.img")" "$r/sd.img"; done < "$work/runs.list"
fi
exit $failed
