#!/bin/bash
# Runs spun-bomb.scn.in in MAME through mane-harness, with dot/BUILD-test/spun
# from build.sh, against the test server in .env. bomb01's zip holds
# BOMB.BIN, deflated, whose central directory says 100 bytes unpacked while
# the data inflates to 8 MB, then README.txt. The unzipper must stop with
# UNZIP_E_CHECK as soon as the output passes the stated size (unzip/inflate.asm,
# FinishBlock), so .spun ends within the run, leaves no BOMB.BIN, and writes
# no line to /sys/spun.cat. An unzipper that writes all 8 MB first is still
# writing when the run ends.
# Before the run it adds the app bomb01 to the e2e database (owner the e2e
# client, install_dir /apps/bomb) and its zip to the e2e storage, and removes
# both after. Exits with 1 if the run or a check fails.
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

app=bomb01
dir=/apps/bomb
zip=$storage/public/$owner/$app-0001.zip

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
    [app, "Bomb Test", "An app for the zip bomb test of .spun.", dir, owner]);
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
python3 - "$zip" "$here/../zip/README.txt" <<'PY'
import struct, sys, zipfile
path, readme = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(path, 'w') as z:
    z.writestr(zipfile.ZipInfo('BOMB.BIN'), b'\0' * (8 << 20), compress_type=zipfile.ZIP_DEFLATED)
    z.write(readme, 'README.txt', compress_type=zipfile.ZIP_STORED)
data = bytearray(open(path, 'rb').read())
# The stated unpacked size of BOMB.BIN, in its local header and its central record
struct.pack_into('<I', data, 22, 100)
central = data.index(b'PK\x01\x02')
struct.pack_into('<I', data, central + 24, 100)
open(path, 'wb').write(data)
PY

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

name=spun-bomb
sed -e "s|@SPUN@|$spun|" -e "s|@HOST@|$SPUN_TEST_SERVER|" -e "s|@PORT@|$SPUN_TEST_PORT|" \
    "$here/$name.scn.in" > "$work/$name.scn"
(cd "$MANE_HARNESS" && ./run.py "$work/$name.scn" --mame "$(command -v "$MAME")") | tee "$work/run.out" || status=1
run=$(sed -n 's/^run dir *//p' "$work/run.out")
"$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/spun.cat" > /dev/null 2>&1 || : > "$work/spun.cat"

ended=$(sed -n 's/^harness: reset t=\([0-9.]*\) CPU at \$0000 with ROM paged in (BASIC line PPC 20)$/\1/p' "$run/mame.log" | head -1)
echo ".spun ended at t=${ended:-never}"
check "ended     with an error" yes "$([ -n "$ended" ] && echo yes || echo no)"
check "spun.cat  no bomb01" "" "$(grep "^$app " "$work/spun.cat" || true)"
if "$HDFMONKEY" get "$run/sd.img" "$dir/BOMB.BIN" "$work/bomb" > /dev/null 2>&1; then got=present; else got=none; fi
check "file      $dir/BOMB.BIN: none" none "$got"
if "$HDFMONKEY" get "$run/sd.img" /tmp/$app-0001.zip "$work/tmpzip" > /dev/null 2>&1; then got=present; else got=none; fi
check "file      /tmp/$app-0001.zip: none" none "$got"

exit $status
