#!/bin/bash
# Runs spun-nolayer2.scn.in in MAME through mane-harness: the GUI of
# dot/BUILD-test/spun (from build.sh) must refuse to open when no 80K run of
# free pages is left for Layer 2, and leave nothing allocated. It builds the
# test tool fragment/fragment.c first. .spun connects to the test server in
# .env before it opens the GUI, so that server must run.
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

(cd "$work" && PATH=$Z88DK/bin:$PATH ZCCCFG=$Z88DK/lib/config \
    zcc +zxn -vn -startup=30 -clib=new "$here/fragment/fragment.c" -o fragment -subtype=dot -create-app)

scn=$(sed -e "s|@SPUN@|$spun|" -e "s|@FRAGMENT@|$work/fragment|" "$here/spun-nolayer2.scn.in")
printf '%s\n' "$scn" > "$work/spun-nolayer2.scn"

(cd "$MANE_HARNESS" && ./run.py "$work/spun-nolayer2.scn" --mame "$(command -v "$MAME")")
