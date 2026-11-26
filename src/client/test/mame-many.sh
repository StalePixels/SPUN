#!/bin/bash
# Runs spun-many.scn.in in MAME through pinesy-harness, with dot/BUILD-test/spun
# from build.sh, against the test server in .env. many01's zip holds 30 files,
# more than the screen has rows, so the progress lines of the unzip scroll.
# After the run it reads every file from the SD image with hdfmonkey and
# compares it with the zip.
# Before the run it adds the app many01 to the e2e database (owner the e2e
# client, install_dir /apps/many) and its zip to the e2e storage, and removes
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

app=many01
dir=/apps/many
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
    [app, "Many Test", "An app with many files for the unzip progress test of .spun.", dir, owner]);
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

mkdir -p "$(dirname "$zip")" "$work/files"
python3 - "$zip" "$work/files" <<'PY'
import random, sys, zipfile
noise = random.Random(25)
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    for n in range(1, 31):
        data = bytes(noise.getrandbits(8) for _ in range(40960 if n % 5 == 0 else 2048))
        z.writestr(f'FILE{n:02}.BIN', data)
        open(f'{sys.argv[2]}/FILE{n:02}.BIN', 'wb').write(data)
PY

# The lines still on screen at the end: FILE11 to FILE30, each with its final count
screens=
for n in $(seq 11 30); do
    size=2K
    [ $((n % 5)) = 0 ] && size=40K
    screens+="screen 149 FILE$n.BIN $size/$size"$'\n'
done

status=0
name=spun-many
python3 - "$here/$name.scn.in" "$work/$name.scn" "$spun" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "${screens%$'\n'}" <<'PY'
import sys
src, dst, spun, host, port, screens = sys.argv[1:]
text = open(src).read()
for key, value in (('@SPUN@', spun), ('@HOST@', host), ('@PORT@', port), ('@SCREENS@', screens)):
    text = text.replace(key, value)
open(dst, 'w').write(text)
PY
(cd "$PINESY_HARNESS" && ./run.py "$work/$name.scn" --keep-image) | tee "$work/run.out" || status=1
run=$(sed -n 's/^run dir *//p' "$work/run.out")

for file in "$work"/files/*; do
    base=$(basename "$file")
    if "$HDFMONKEY" get "$run/sd.img" "$dir/$base" "$work/got" > /dev/null 2>&1 && cmp -s "$work/got" "$file"; then
        echo "file      $dir/$base the same as in the zip MATCH"
    else
        echo "file      $dir/$base the same as in the zip DIFFERENT"
        status=1
    fi
done
exit $status
