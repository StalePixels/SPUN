#!/bin/bash
# Runs spun-gui.scn.in in MAME through mane-harness, with dot/BUILD-test/spun
# from build.sh, against the test server in .env. Needs the e2e users, so run
# make e2e in src/web once after a reset. Before the run it adds the GUI test
# apps to the e2e database (src/web/e2e/gui-catalogue.mts) and removes them
# after it. The GUI reaches the server through gui-test.py's proxy, whose log
# of commands must match the scenario. Exits with 1 if the run fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../../web" && pwd)
set -a
. "$here/.env"
set +a

spun=$here/../dot/BUILD-test/spun
[ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }

work=$(mktemp -d)
proxy=
finish() {
    [ -z "$proxy" ] || kill "$proxy" 2>/dev/null || true
    (cd "$web" && node e2e/gui-catalogue.mts remove) || true
    [ -z "${SPUN_TEST_SERVER_DOWN:-}" ] || eval "$SPUN_TEST_SERVER_DOWN"
    rm -rf "$work"
}
trap finish EXIT
[ -z "${SPUN_TEST_SERVER_UP:-}" ] || eval "$SPUN_TEST_SERVER_UP"
(cd "$web" && node e2e/gui-catalogue.mts add)

port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 "$here/gui-test.py" proxy "$port" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "SPLIST 2" "$work/commands.log" > "$work/proxy.out" 2>&1 &
proxy=$!
for _ in $(seq 50); do grep -q listening "$work/proxy.out" && break; sleep 0.1; done

scn=$(python3 "$here/gui-test.py" rows "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" < "$here/spun-gui.scn.in")
scn=${scn//@SPUN@/$spun}
scn=${scn//@PORT@/$port}
printf '%s\n' "$scn" > "$work/spun-gui.scn"

status=0
(cd "$MANE_HARNESS" && ./run.py "$work/spun-gui.scn" --mame "$(command -v "$MAME")") | tee "$work/run.out" || status=$?
run=$(sed -n 's/^run dir *//p' "$work/run.out")
python3 "$here/gui-test.py" pointers "$work/spun-gui.scn" "$run" || status=1

# Every page came from the server when it was shown, and the search with no
# text sent no SPFIND
want=$(printf '%s\n' "SPLIST 1" "SPLIST 2" "SPLIST 1" "SPFIND 1 zebra" "SPLIST 1" "SPLIST 1")
got=$(sed -n 's/^[0-9.]* \(SP.*\)/\1/p' "$work/commands.log")
echo "commands sent: $(printf '%s' "$got" | tr '\n' ',')"
if [ "$got" != "$want" ]; then
    echo "FAIL: the commands should be: $(printf '%s' "$want" | tr '\n' ',')"
    status=1
fi
exit $status
