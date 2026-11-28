#!/bin/bash
# Runs the self-repair tests of .spun in MAME through pinesy-harness, with
# dot/BUILD-test-repair/spun from build.sh (SELF_REPAIR=1) as /dot/SPUN,
# against the test server in .env:
#   spun-repair.scn.in          a .spun copied into /dot by hand, with another
#                               app's line in spun.cat and none of its own:
#                               info repairs it first, then goes on
#   spun-repair-restart.scn.in  the same, with a release of another version:
#                               the repair ends .spun with the restart message
#   spun-repair-get.scn.in      get spun with no spun.cat, the first install:
#                               no repair, a normal get
#   spun-repair-zip.scn.in      the zip's spun.bas, built here, with no
#                               spun.cat: it runs its spun.dot with get spun,
#                               straight to the server, then erases it
# Before the runs it adds the app rep001 to the e2e database (owner the e2e
# client, install_dir /apps/wifi/spun, the alias spun, which is the build's
# UPDATE_ID) and its zip to the e2e storage, and removes both after. The zip's
# spun.dot is dot/BUILD-test-s/spun, a working .spun with other bytes. .spun
# reaches the server through gui-test.py's proxy, whose log of commands must
# match. After each run it reads C:/dot/spun, the app directory and
# /sys/spun.cat from the SD image with hdfmonkey.
# Exits with 1 if a run or a check fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../../web" && pwd)
set -a
. "$here/.env"
set +a
storage=$(sed -n 's/^E2E_STORAGE_DIR=//p' "$web/.env.e2e")
owner=$(sed -n 's/^E2E_CLIENT_USERNAME=//p' "$web/.env.e2e")
version=$(cat "$here/../VERSION")

spun=$here/../dot/BUILD-test-repair/spun
bas=$here/../dot/BUILD-test-repair/spun.bas
new=$here/../dot/BUILD-test-s/spun
[ -f "$spun" ] && [ -f "$new" ] || { echo "No $spun or $new: run build.sh first" >&2; exit 1; }
cmp -s "$spun" "$new" && { echo "$spun and $new are the same" >&2; exit 1; }
[ -n "${HDFMONKEY:-}" ] || { echo "HDFMONKEY is not set in .env" >&2; exit 1; }

app=rep001
alias=spun
dir=/apps/wifi/spun
zip=$storage/public/$owner/$app-0001.zip

# add or remove rep001 and its alias in the e2e database, or set its release's version
catalogue() {
    (cd "$web" && node --input-type=module -e '
import mysql from "mysql2/promise";
process.loadEnvFile(".env.e2e");
const url = process.env.E2E_DATABASE_URL ?? "";
if (!new URL(url).pathname.endsWith("_e2e")) throw new Error("not the e2e database");
const [what, app, alias, owner, dir, version] = process.argv.slice(1);
const db = await mysql.createConnection(url);
if (what === "version") {
  await db.query("update releases set version = ? where app_id = ?", [version, app]);
  await db.end();
  process.exit(0);
}
await db.query("delete from aliases where alias = ?", [alias]);
await db.query("delete from releases where app_id = ?", [app]);
await db.query("delete from apps where id = ?", [app]);
if (what === "add") {
  await db.query(
    "insert into apps (id, user_id, title, description, install_dir) select ?, id, ?, ?, ? from users where username = ?",
    [app, "Repair Test", "An app for the self-repair test of .spun.", dir, owner]);
  await db.query("insert into releases (app_id, serial, version, release_date) values (?, 1, ?, curdate())", [app, version]);
  await db.query("insert into aliases (alias, app_id) values (?, ?)", [alias, app]);
}
await db.end();' "$1" "$app" "$alias" "$owner" "$dir" "${2:-}")
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
catalogue add "$version"

mkdir -p "$(dirname "$zip")" "$work/zip"
cp "$new" "$work/zip/spun.dot"
cp "$here/../zip/README.txt" "$work/zip/README.txt"
(cd "$work/zip" && zip -X -q "$zip" spun.dot README.txt)
make -C "$here/../dot" SELF_REPAIR=1 BUILD_DIR=./BUILD-test-repair ./BUILD-test-repair/spun.bas
other="$SPUN_TEST_APP 0001 1.0 C:/apps/test"
printf '%s\n' "$other" > "$work/other.cat"

port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 "$here/gui-test.py" proxy "$port" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "NO SLOW READ" "$work/commands.log" > "$work/proxy.out" 2>&1 &
proxy=$!
for _ in $(seq 50); do grep -q listening "$work/proxy.out" && break; sleep 0.1; done

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
    check "file      $remote: $want" "$want" "$got"
}

scenario() {
    local name=$1
    : > "$work/commands.log"
    sed -e "s|@SPUN@|$spun|" -e "s|@PORT@|$port|" -e "s|@CAT@|$work/other.cat|" -e "s|@BAS@|$bas|" \
        -e "s|@APP@|$SPUN_TEST_APP|" "$here/$name.scn.in" > "$work/$name.scn"
    (cd "$PINESY_HARNESS" && ./run.py "$work/$name.scn" --keep-image) | tee "$work/run.out" || status=1
    run=$(sed -n 's/^run dir *//p' "$work/run.out")
    echo "$run" >> "$work/runs.list"
    got=$(sed -En 's/^[0-9.]* (SP.*|GET .*)/\1/p' "$work/commands.log")
    "$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/spun.cat" > /dev/null 2>&1 || : > "$work/spun.cat"
    echo "spun.cat after the run:"
    cat "$work/spun.cat"
}

info_self="SPINFO $alias 1"
info_app="SPINFO $SPUN_TEST_APP 1"
get_self="GET $owner/$app-0001.zip"

scenario spun-repair
check "commands  repair" "$(printf '%s\n' "$info_self" "$get_self" "$info_app")" "$got"
check "spun.cat  repair" "$(printf '%s\n' "$other" "$app 0001 $version C:$dir")" "$(cat "$work/spun.cat")"
holds /dot/spun "$new"
holds "$dir/spun.dot" none
holds "$dir/README.txt" "$here/../zip/README.txt"

catalogue version 0.0.1
scenario spun-repair-restart
check "commands  restart" "$(printf '%s\n' "$info_self" "$get_self")" "$got"
check "spun.cat  restart" "$(printf '%s\n' "$other" "$app 0001 0.0.1 C:$dir")" "$(cat "$work/spun.cat")"
holds /dot/spun "$new"
holds "$dir/README.txt" "$here/../zip/README.txt"

catalogue version "$version"
scenario spun-repair-get
check "commands  get" "$(printf '%s\n' "$info_self" "$info_self" "$get_self")" "$got"
check "spun.cat  get" "$app 0001 $version C:$dir" "$(cat "$work/spun.cat")"
holds /dot/spun "$new"
holds "$dir/spun.dot" none
holds "$dir/README.txt" "$here/../zip/README.txt"

scenario spun-repair-zip
check "spun.cat  zip" "$app 0001 $version C:$dir" "$(cat "$work/spun.cat")"
holds /apps/zip/spun.dot none
holds /dot/spun "$new"
holds "$dir/README.txt" "$here/../zip/README.txt"

# The runs keep their images so that this script can read them; it deletes them when every check passed.
if [ "$status" -eq 0 ] && [ -f "$work/runs.list" ]; then
    while read -r r; do rm -f "$(readlink "$r/sd.img")" "$r/sd.img"; done < "$work/runs.list"
fi
exit $status
