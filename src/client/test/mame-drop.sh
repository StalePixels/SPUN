#!/bin/bash
# Runs spun-drop.scn.in in MAME through mane-harness, with dot/BUILD-test/spun
# from build.sh, once for each stage at which gui-test.py's drop proxy closes
# the connection to the test server in .env:
#   connect   at once, before .spun has sent anything
#   request   on the first request, SPINFO, with no reply
#   midblock  in the middle of the first block of the zip
#   between   after the first block, when .spun asks for the next
# At each stage .spun must end with an error (back in BASIC within the run,
# not hung), and leave no zip in C:/tmp, no file in the install directory and
# no line in /sys/spun.cat.
# Before the runs it adds the app drop01 to the e2e database (owner the e2e
# client, install_dir /apps/drop) and its zip, 2 blocks and some bytes, to the
# e2e storage, and removes both after.
# SPUN_BIN=FILE runs another build of .spun instead, such as an older one.
# Exits with 1 if a run or a check fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../../web" && pwd)
set -a
. "$here/.env"
set +a
storage=$(sed -n 's/^E2E_STORAGE_DIR=//p' "$web/.env.e2e")
owner=$(sed -n 's/^E2E_CLIENT_USERNAME=//p' "$web/.env.e2e")

spun=${SPUN_BIN:-$here/../dot/BUILD-test/spun}
[ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }
[ -n "${HDFMONKEY:-}" ] || { echo "HDFMONKEY is not set in .env" >&2; exit 1; }

app=drop01
dir=/apps/drop
zip=$storage/public/$owner/$app-0001.zip

# add or remove drop01 in the e2e database
catalogue() {
    (cd "$web" && node --input-type=module -e '
import mysql from "mysql2/promise";
process.loadEnvFile(".env.e2e");
const url = process.env.E2E_DATABASE_URL ?? "";
if (!new URL(url).pathname.endsWith("_e2e")) throw new Error("not the e2e database");
const [what, app, owner, dir] = process.argv.slice(1);
const db = await mysql.createConnection(url);
await db.query("delete from releases where app_id = ?", [app]);
await db.query("delete from apps where id = ?", [app]);
if (what === "add") {
  await db.query(
    "insert into apps (id, user_id, title, description, install_dir) select ?, id, ?, ?, ? from users where username = ?",
    [app, "Drop Test", "An app for the lost connection test of .spun.", dir, owner]);
  await db.query("insert into releases (app_id, serial, version, release_date) values (?, 1, ?, curdate())", [app, "1.0"]);
}
await db.end();' "$1" "$app" "$owner" "$dir")
}

work=$(mktemp -d)
proxy=
finish() {
    [ -z "$proxy" ] || kill "$proxy" 2>/dev/null || true
    rm -f "$zip"
    catalogue remove || true
    [ -z "${SPUN_TEST_SERVER_DOWN:-}" ] || eval "$SPUN_TEST_SERVER_DOWN"
    rm -rf "$work"
}
trap finish EXIT
[ -z "${SPUN_TEST_SERVER_UP:-}" ] || eval "$SPUN_TEST_SERVER_UP"
catalogue add

mkdir -p "$(dirname "$zip")" "$work/zip"
cp "$here/../zip/README.txt" "$work/zip/README.txt"
head -c 10000 /dev/urandom > "$work/zip/DATA.BIN"
(cd "$work/zip" && zip -X -q -0 "$zip" README.txt DATA.BIN)

status=0
check() {
    if [ "$2" = "$3" ]; then
        echo "$1 MATCH"
    else
        echo "$1 DIFFERENT"
        echo "  want: $(printf '%s' "$2" | tr '\n' ',')"
        echo "  got:  $(printf '%s' "$3" | tr '\n' ',')"
        status=1
    fi
}

# REMOTE on the run's image has the bytes of LOCAL, or with "none" is not there
holds() {
    local remote=$1 want=$2 got=missing
    if "$HDFMONKEY" get "$run/sd.img" "$remote" "$work/got" > /dev/null 2>&1; then
        if [ "$want" = none ]; then got=present
        elif cmp -s "$want" "$work/got"; then got=$want
        else got=other; fi
    elif [ "$want" = none ]; then
        got=none
    fi
    check "$stage file $remote: $want" "$want" "$got"
}

port=48140
for stage in connect request midblock between; do
    port=$((port + 1))
    python3 "$here/gui-test.py" drop "$port" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "$stage" "$work/$stage.log" &
    proxy=$!
    sleep 1
    sed -e "s|@SPUN@|$spun|" -e "s|@HOST@|$SPUN_TEST_SERVER|" -e "s|@PORT@|$port|" \
        "$here/spun-drop.scn.in" > "$work/$stage.scn"
    (cd "$MANE_HARNESS" && ./run.py "$work/$stage.scn" --mame "$(command -v "$MAME")") | tee "$work/$stage.out" || status=1
    kill "$proxy" 2>/dev/null || true
    proxy=
    run=$(sed -n 's/^run dir *//p' "$work/$stage.out")
    echo "$stage proxy log:"; sed 's/^/  /' "$work/$stage.log"
    check "$stage dropped" "1" "$(grep -c "dropped $stage" "$work/$stage.log" || true)"
    ended=$(sed -n 's/^harness: reset t=\([0-9.]*\) CPU at \$0000 with ROM paged in (BASIC line PPC 20)$/\1/p' "$run/mame.log" | head -1)
    echo "$stage .spun ended at t=${ended:-never}"
    check "$stage ended with an error" yes "$([ -n "$ended" ] && echo yes || echo no)"
    "$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/spun.cat" > /dev/null 2>&1 || : > "$work/spun.cat"
    holds /tmp/$app-0001.zip none
    check "$stage spun.cat" "" "$(grep "^$app " "$work/spun.cat" || true)"
    holds "$dir/DATA.BIN" none
    holds "$dir/README.txt" none
done

exit $status
