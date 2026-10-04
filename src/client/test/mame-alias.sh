#!/bin/bash
# Runs the alias tests of .spun get in MAME through mane-harness, with
# dot/BUILD-test/spun from build.sh, against the test server in .env:
#   spun-alias.scn.in        get by the alias spunalias installs als001 under
#                            its real id; a second get by the alias finds it
#                            installed
#   spun-alias-moved.scn.in  with spunalias moved to als002 in the database,
#                            get by the alias installs als002; get of an
#                            unknown alias, through gui-test.py's proxy, gets
#                            NoApp_ERROR and ends .spun with an error
# Before the runs it adds als001 and als002 (owner the e2e client, each with a
# suggested install directory, so no browser opens) and the alias to the e2e
# database, and their zips to the e2e storage, and removes them after. After
# each run it reads /sys/spun.cat and the installed files from the SD image
# with hdfmonkey.
# Exits with 1 if a run or a check fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../../web" && pwd)
set -a
. "$here/.env"
set +a
storage=$(sed -n 's/^E2E_STORAGE_DIR=//p' "$web/.env.e2e")
owner=$(sed -n 's/^E2E_CLIENT_USERNAME=//p' "$web/.env.e2e")

spun=$here/../dot/BUILD-test/spun
[ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }
[ -n "${HDFMONKEY:-}" ] || { echo "HDFMONKEY is not set in .env" >&2; exit 1; }

alias=spunalias

# add, remove, or point the alias at an app, in the e2e database
catalogue() {
    (cd "$web" && node --input-type=module -e '
import mysql from "mysql2/promise";
process.loadEnvFile(".env.e2e");
const url = process.env.E2E_DATABASE_URL ?? "";
if (!new URL(url).pathname.endsWith("_e2e")) throw new Error("not the e2e database");
const [what, alias, owner, target] = process.argv.slice(1);
const apps = { als001: ["Alias Test A", "/apps/alsa"], als002: ["Alias Test B", "/apps/alsb"] };
const db = await mysql.createConnection(url);
if (what === "point") {
  await db.query("update aliases set app_id = ? where alias = ?", [target, alias]);
} else {
  await db.query("delete from aliases where alias = ?", [alias]);
  await db.query("delete from releases where app_id in (?)", [Object.keys(apps)]);
  await db.query("delete from apps where id in (?)", [Object.keys(apps)]);
}
if (what === "add") {
  for (const [id, [title, dir]] of Object.entries(apps)) {
    await db.query(
      "insert into apps (id, user_id, title, description, install_dir) select ?, id, ?, ?, ? from users where username = ?",
      [id, title, "An app for the alias test of .spun.", dir, owner]);
    await db.query("insert into releases (app_id, serial, version, release_date) values (?, 1, ?, curdate())", [id, "1.0"]);
  }
  await db.query("insert into aliases (alias, app_id) values (?, ?)", [alias, target]);
}
await db.end();' "$1" "$alias" "$owner" "${2:-}")
}

work=$(mktemp -d)
proxy=
finish() {
    [ -z "$proxy" ] || kill "$proxy" 2>/dev/null || true
    rm -f "$storage/public/$owner/als001-0001.zip" "$storage/public/$owner/als002-0001.zip"
    catalogue remove || true
    [ -z "${SPUN_TEST_SERVER_DOWN:-}" ] || eval "$SPUN_TEST_SERVER_DOWN"
    rm -rf "$work"
}
trap finish EXIT
[ -z "${SPUN_TEST_SERVER_UP:-}" ] || eval "$SPUN_TEST_SERVER_UP"
catalogue add als001

mkdir -p "$storage/public/$owner"
for id in als001 als002; do
    python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1], "w").writestr(sys.argv[2].upper() + ".TXT", sys.argv[2] + ", for the alias test of .spun\n")' \
        "$storage/public/$owner/$id-0001.zip" "$id"
done
printf 'als001 0001 1.0 C:/apps/alsa\n' > "$work/als001.cat"

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

# The app's one file is in its directory on the run's image
installed() {
    local id=$1 dir=$2 upper got
    upper=$(printf '%s' "$id" | tr a-z A-Z)
    got=$("$HDFMONKEY" get "$run/sd.img" "$dir/$upper.TXT" "$work/got" > /dev/null 2>&1 && cat "$work/got" || echo missing)
    check "file      $dir/$upper.TXT" "$id, for the alias test of .spun" "$got"
}

scenario() {
    local name=$1
    sed -e "s|@SPUN@|$spun|" -e "s|@CAT@|$work/als001.cat|" -e "s|@ALIAS@|$alias|g" -e "s|@PORT@|$port|" \
        "$here/$name.scn.in" > "$work/$name.scn"
    (cd "$MANE_HARNESS" && ./run.py "$work/$name.scn" --mame "$(command -v "$MAME")") | tee "$work/run.out" || status=1
    run=$(sed -n 's/^run dir *//p' "$work/run.out")
    "$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/spun.cat" > /dev/null 2>&1 || : > "$work/spun.cat"
}

scenario spun-alias
check "spun.cat  alias" "als001 0001 1.0 C:/apps/alsa" "$(cat "$work/spun.cat")"
installed als001 /apps/alsa

catalogue point als002
scenario spun-alias-moved
check "spun.cat  moved" "$(printf 'als001 0001 1.0 C:/apps/alsa\nals002 0001 1.0 C:/apps/alsb')" "$(cat "$work/spun.cat")"
installed als002 /apps/alsb
check "server    unknown alias" "$(printf 'SPINFO nosuchalias 1\n< NoApp_ERROR')" "$(sed -E 's/^[0-9.]* //' "$work/commands.log")"
# The number of the autoexec line with the get of the unknown alias, read from the run's image
"$HDFMONKEY" get "$run/sd.img" /nextzxos/autoexec.bas "$work/autoexec.bas" > /dev/null
line=$(python3 -c '
import struct, sys
prog = open(sys.argv[1], "rb").read()[128:]
at = 0
while at < len(prog):
    size = struct.unpack("<H", prog[at + 2:at + 4])[0]
    if b"nosuchalias" in prog[at + 4:at + 4 + size]:
        print(struct.unpack(">H", prog[at:at + 2])[0])
    at += 4 + size' "$work/autoexec.bas")
if grep -qE "^harness: reset t=.* CPU at \\\$0000 with ROM paged in \(BASIC line PPC ${line:-x}\)" "$run/mame.log"; then
    echo "trap      error of .spun get nosuchalias trapped at line $line MATCH"
else
    echo "trap      error of .spun get nosuchalias trapped at line ${line:-?} DIFFERENT"
    status=1
fi
if grep -E '^harness: reset t=([89]|[1-9][0-9])\.[0-9]* machine reset' "$run/mame.log"; then
    echo "reset     machine reset after boot DIFFERENT"
    status=1
else
    echo "reset     no machine reset after boot MATCH"
fi

exit $status
