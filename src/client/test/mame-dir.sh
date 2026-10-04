#!/bin/bash
# Runs the install directory, overwrite and dot command tests of .spun in MAME
# through mane-harness, with dot/BUILD-test/spun from build.sh, against the
# test server in .env:
#   spun-dir-first.scn.in   get of an app with a suggested install directory:
#                           y takes it, .spun creates it and its parents
#   spun-dir-cancel.scn.in  get again over files that exist: Cancel at the first
#                           Overwrite question writes nothing
#   spun-dir-update.scn.in  update of dir001 and the test app: Cancel at
#                           dir001 leaves it as it was, and the update goes on
#   spun-dir-all.scn.in     the same: Once, then All, and no more questions
#   spun-dir-gui.scn.in     the GUI's dialogs for the same: the suggested
#                           directory, then Overwrite with Once and All
# Before the runs it adds the app dir001 to the e2e database (owner the e2e
# client, install_dir /apps/spundir/deep) and its zip to the e2e storage, and
# removes both after. The zip has two .dot files at its root, which must end
# in C:/dot without their extension and not in the app's directory, and one in
# a subdirectory, which stays. After each run it reads the files and
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

spun=$here/../dot/BUILD-test/spun
[ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }
[ -n "${HDFMONKEY:-}" ] || { echo "HDFMONKEY is not set in .env" >&2; exit 1; }

app=dir001
dir=/apps/spundir/deep
zip=$storage/public/$owner/$app-0001.zip

# add or remove dir001 in the e2e database
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
    [app, "Dir Test", "An app for the install directory test of .spun.", dir, owner]);
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

mkdir -p "$(dirname "$zip")"
python3 - "$zip" <<'PY'
import random, sys, zipfile
noise = random.Random(1)
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('DATA/ONE.BIN', bytes(noise.getrandbits(8) for _ in range(3000)))
    z.writestr('DATA/TWO.BIN', bytes(noise.getrandbits(8) for _ in range(3000)))
    z.writestr('DIRTEST.TXT', 'dir001, for the install directory test of .spun\n')
    z.writestr('SPUNDIR.DOT', 'not a real dot command, upper case extension\n')
    z.writestr('spuntiny.dot', 'not a real dot command, lower case extension\n')
    z.writestr('SUB/KEEP.DOT', 'not at the root, so it stays\n')
PY
printf 'old file, from before the run\n' > "$work/old"
printf '%s 0001 1.0 C:%s\n' "$app" "$dir" > "$work/old.cat"
printf '%s 0000 0.9 C:%s\n%s 0000 0.9 C:/APPS/\n' "$app" "$dir" "$SPUN_TEST_APP" > "$work/update.cat"

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

# REMOTE on the run's image has the bytes of zip entry NAME, or of LOCAL with
# "file:LOCAL", or with "none" is not there
holds() {
    local remote=$1 want=$2 got=missing
    if "$HDFMONKEY" get "$run/sd.img" "$remote" "$work/got" > /dev/null 2>&1; then
        case $want in
            none) got=present ;;
            file:*) cmp -s "${want#file:}" "$work/got" && got=$want || got=other ;;
            *) python3 -c 'import sys, zipfile; sys.exit(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]) != open(sys.argv[3], "rb").read())' \
                   "$zip" "$want" "$work/got" && got=$want || got=other ;;
        esac
    elif [ "$want" = none ]; then
        got=none
    fi
    check "file      $remote: $want" "$want" "$got"
}

scenario() {
    local name=$1
    scn=$(sed -e "s|@SPUN@|$spun|" -e "s|@CAT@|$work/old.cat|" -e "s|@OLD@|$work/old|g" \
        -e "s|@UPDCAT@|$work/update.cat|" -e "s|@APP@|$SPUN_TEST_APP|g" \
        "$here/$name.scn.in" | python3 "$here/gui-test.py" rows "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT")
    printf '%s\n' "$scn" > "$work/$name.scn"
    (cd "$MANE_HARNESS" && ./run.py "$work/$name.scn" --mame "$(command -v "$MAME")") | tee "$work/run.out" || status=1
    run=$(sed -n 's/^run dir *//p' "$work/run.out")
    "$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/spun.cat" > /dev/null 2>&1 || : > "$work/spun.cat"
}

installed() {
    check "spun.cat  $1" "$app 0001 1.0 C:$dir" "$(cat "$work/spun.cat")"
    holds "$dir/DATA/ONE.BIN" DATA/ONE.BIN
    holds "$dir/DATA/TWO.BIN" DATA/TWO.BIN
    holds "$dir/DIRTEST.TXT" DIRTEST.TXT
    holds "$dir/SUB/KEEP.DOT" SUB/KEEP.DOT
    holds /dot/SPUNDIR SPUNDIR.DOT
    holds /dot/spuntiny spuntiny.dot
    holds "$dir/SPUNDIR.DOT" none
    holds "$dir/spuntiny.dot" none
}

scenario spun-dir-first
installed first

scenario spun-dir-cancel
check "spun.cat  cancel" "$(cat "$work/old.cat")" "$(cat "$work/spun.cat")"
holds "$dir/DIRTEST.TXT" "file:$work/old"
holds /dot/SPUNDIR "file:$work/old"
holds "$dir/DATA/ONE.BIN" none
holds "$dir/DATA/TWO.BIN" none
holds "$dir/SUB/KEEP.DOT" none
holds /dot/spuntiny none
if grep -E '^harness: reset t=([89]|[1-9][0-9])\.[0-9]* machine reset' "$run/mame.log"; then
    echo "reset     machine reset after boot DIFFERENT"
    status=1
else
    echo "reset     no machine reset after boot MATCH"
fi

scenario spun-dir-update
check "spun.cat  update" "$(printf '%s 0000 0.9 C:%s\n%s 0001 ' "$app" "$dir" "$SPUN_TEST_APP")" \
    "$(head -1 "$work/spun.cat"; sed -n '2s/^\([^ ]* [^ ]* \).*/\1/p' "$work/spun.cat")"
holds "$dir/DIRTEST.TXT" "file:$work/old"
holds "$dir/DATA/ONE.BIN" none
holds /dot/SPUNDIR none

scenario spun-dir-all
installed all

scenario spun-dir-gui
installed gui

exit $status
