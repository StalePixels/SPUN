#!/bin/bash
# Runs the self-replace test of .spun in MAME through mane-harness, with
# dot/BUILD-test/spun from build.sh as /dot/SPUN, against the test server in
# .env:
#   spun-self.scn.in  get of self01, whose zip has spun.dot at its root, so its
#                     target is C:/dot/spun, the .spun that is running. .spun
#                     replaces it and finishes; the new one then runs info
# Before the run it adds the app self01 to the e2e database (owner the e2e
# client, install_dir /apps/wifi/spun) and its zip to the e2e storage, and
# removes both after. The zip's spun.dot is dot/BUILD-test-s/spun, a working
# .spun with other bytes. After the run it reads C:/dot/spun, the app
# directory and /sys/spun.cat from the SD image with hdfmonkey.
# Exits with 1 if the run or a check fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../../web" && pwd)
set -a
. "$here/.env"
set +a
storage=$(sed -n 's/^E2E_STORAGE_DIR=//p' "$web/.env.e2e")
owner=$(sed -n 's/^E2E_CLIENT_USERNAME=//p' "$web/.env.e2e")

spun=$here/../dot/BUILD-test/spun
new=$here/../dot/BUILD-test-s/spun
[ -f "$spun" ] && [ -f "$new" ] || { echo "No $spun or $new: run build.sh first" >&2; exit 1; }
cmp -s "$spun" "$new" && { echo "$spun and $new are the same" >&2; exit 1; }
[ -n "${HDFMONKEY:-}" ] || { echo "HDFMONKEY is not set in .env" >&2; exit 1; }

app=self01
dir=/apps/wifi/spun
zip=$storage/public/$owner/$app-0001.zip

# add or remove self01 in the e2e database
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
    [app, "Self Test", "An app for the self-replace test of .spun.", dir, owner]);
  await db.query("insert into releases (app_id, serial, version, release_date) values (?, 1, ?, curdate())", [app, "1.0"]);
}
await db.end();' "$1" "$app" "$owner" "$dir")
}

work=$(mktemp -d)
finish() {
    rm -f "$zip"
    catalogue remove || true
    [ -z "${SPUN_TEST_SERVER_DOWN:-}" ] || eval "$SPUN_TEST_SERVER_DOWN"
    rm -rf "$work"
}
trap finish EXIT
[ -z "${SPUN_TEST_SERVER_UP:-}" ] || eval "$SPUN_TEST_SERVER_UP"
catalogue add

mkdir -p "$(dirname "$zip")" "$work/zip"
cp "$new" "$work/zip/spun.dot"
cp "$here/../zip/README.txt" "$work/zip/README.txt"
(cd "$work/zip" && zip -X -q "$zip" spun.dot README.txt)

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

name=spun-self
sed -e "s|@SPUN@|$spun|" -e "s|@HOST@|$SPUN_TEST_SERVER|" -e "s|@PORT@|$SPUN_TEST_PORT|" \
    -e "s|@OWNER@|$owner|" "$here/$name.scn.in" > "$work/$name.scn"
(cd "$MANE_HARNESS" && ./run.py "$work/$name.scn" --mame "$(command -v "$MAME")") | tee "$work/run.out" || status=1
run=$(sed -n 's/^run dir *//p' "$work/run.out")
"$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/spun.cat" > /dev/null 2>&1 || : > "$work/spun.cat"

check "spun.cat  self" "$app 0001 1.0 C:$dir" "$(cat "$work/spun.cat")"
holds /dot/spun "$new"
holds "$dir/spun.dot" none
holds "$dir/README.txt" "$here/../zip/README.txt"

exit $status
