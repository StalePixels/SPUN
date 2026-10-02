#!/bin/bash
# Runs the install and update tests of the .spun GUI in MAME through
# mane-harness, with dot/BUILD-test/spun from build.sh, against the test server
# in .env:
#   spun-install.scn.in  installs gui024 from its app page, to a directory
#                        picked in the NextZXOS browser, with progress
#   spun-update.scn.in   the update box at start: Ignore, then Update
#   spun-error.scn.in    an install that ends .spun with an error
# Needs the e2e users and the test app, so run make e2e in src/web once after
# a reset. Before the runs it adds the GUI test apps (src/web/e2e/gui-catalogue.mts),
# a zip for gui024's newest release (29 blocks, 8 files) and one for gui023
# with a file name NextZXOS cannot create to the e2e storage, and removes them
# after. The GUI reaches the server through gui-test.py's proxy, whose log of
# commands must match. After each run it reads /sys/spun.cat and the installed files from the SD
# image with hdfmonkey, and checks that BASIC's screen holds only what BASIC
# printed (ula-check.py). With SPUN_SNAPSHOTS=DIR it copies the snapshots for
# the report to DIR as p78-*.png.
# Exits with 1 if a run fails.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../../web" && pwd)
set -a
. "$here/.env"
set +a
storage=$(sed -n 's/^E2E_STORAGE_DIR=//p' "$web/.env.e2e")

spun=$here/../dot/BUILD-test/spun
[ -f "$spun" ] || { echo "No $spun: run build.sh first" >&2; exit 1; }
[ -n "${HDFMONKEY:-}" ] || { echo "HDFMONKEY is not set in .env" >&2; exit 1; }

work=$(mktemp -d)
proxy=
zips=()
finish() {
    [ -z "$proxy" ] || kill "$proxy" 2>/dev/null || true
    for zip in "${zips[@]}"; do rm -f "$zip"; rmdir "$(dirname "$zip")" 2>/dev/null || true; done
    (cd "$web" && node e2e/gui-catalogue.mts remove) || true
    [ -z "${SPUN_TEST_SERVER_DOWN:-}" ] || eval "$SPUN_TEST_SERVER_DOWN"
    rm -rf "$work"
}
trap finish EXIT
[ -z "${SPUN_TEST_SERVER_UP:-}" ] || eval "$SPUN_TEST_SERVER_UP"
(cd "$web" && node e2e/gui-catalogue.mts add)

# What the server has now: name=value lines for the shell
facts() {
    python3 - "$here" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "$SPUN_TEST_APP" <<'PY'
import importlib.util, shlex, sys
here, host, port, app = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
spec = importlib.util.spec_from_file_location('g', f'{here}/gui-test.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
for name, appid in (('APP', app), ('GUI', 'gui024'), ('BAD', 'gui023')):
    info = g.info(host, port, appid)
    serial, version, _ = info['releases'][0]
    print(f'{name}_USER={shlex.quote(info["username"])} {name}_TITLE={shlex.quote(info["title"])} '
          f'{name}_SERIAL={serial:04x} {name}_VERSION={shlex.quote(version)} '
          f'{name}_OLD={serial - 1:04x}')
print('STATUS=' + shlex.quote(g.status('SPLIST 1', g.request(host, port, 'SPLIST 1'))))
PY
}
eval "$(facts)"

# gui024's newest release gets a zip that takes several blocks and files, so
# that the progress line shows; gui023's has a name that NextZXOS refuses
gui_zip=$storage/public/$GUI_USER/gui024-$GUI_SERIAL.zip
bad_zip=$storage/public/$BAD_USER/gui023-$BAD_SERIAL.zip
mkdir -p "$(dirname "$gui_zip")" "$(dirname "$bad_zip")"
zips=("$gui_zip" "$bad_zip")
python3 - "$gui_zip" "$bad_zip" <<'PY'
import random, sys, zipfile
noise = random.Random(78)
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('GUI024.TXT', 'gui024, for the install and update tests of the .spun GUI\n')
    for n in range(1, 8):
        z.writestr(f'DATA/PART{n}.BIN', bytes(noise.getrandbits(8) for _ in range(16384)))
with zipfile.ZipFile(sys.argv[2], 'w') as z:
    z.writestr('GOOD.TXT', 'gui023, for the error test of the .spun GUI\n')
    z.writestr('BAD*NAME.TXT', 'NextZXOS cannot create a file with this name\n')
PY
printf '%s %s 0.9 C:/APPS/\ngui024 %s 1.23 C:/APPS/\n' "$SPUN_TEST_APP" "$APP_OLD" "$GUI_OLD" > "$work/old.cat"

port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 "$here/gui-test.py" proxy "$port" "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT" "NO SLOW READ" "$work/commands.log" > "$work/proxy.out" 2>&1 &
proxy=$!
for _ in $(seq 50); do grep -q listening "$work/proxy.out" && break; sleep 0.1; done


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

# Every file of ZIP is in C:/APPS on the run's image, with the same bytes
installed() {
    local zipfile=$1 name
    for name in $(python3 -c 'import sys, zipfile; print(" ".join(n for n in zipfile.ZipFile(sys.argv[1]).namelist() if not n.endswith("/")))' "$zipfile"); do
        if "$HDFMONKEY" get "$run/sd.img" "/APPS/$name" "$work/got" > /dev/null 2>&1 &&
            python3 -c 'import sys, zipfile; sys.exit(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]) != open(sys.argv[3], "rb").read())' \
                "$zipfile" "$name" "$work/got"; then
            echo "file      C:/APPS/$name the same as in $(basename "$zipfile") MATCH"
        else
            echo "file      C:/APPS/$name the same as in $(basename "$zipfile") DIFFERENT"
            status=1
        fi
    done
}

# The screen checks: the text at the rows BASIC printed it, and nothing else
basic_screen() {
    local rows=$1; shift
    local row=0 text
    for text in "$@"; do
        if grep -q "^screen .*\"$text\" at row $row column 0 MATCH" "$run/summary.txt"; then
            echo "basic     \"$text\" at row $row of bank 5 MATCH"
        else
            echo "basic     \"$text\" at row $row of bank 5 DIFFERENT"
            status=1
        fi
        row=$((row + 1))
    done
    python3 "$here/ula-check.py" "$run/dump-ula-end.bin" "$rows" || status=1
}

scenario() {
    local name=$1
    : > "$work/commands.log"
    scn=$(sed -e "s|@APP@|$SPUN_TEST_APP|g" -e "s|@TITLE@|$GUI_TITLE|g" -e "s|@VERSION@|$GUI_VERSION|g" \
        -e "s|@STATUS@|$STATUS|g" "$here/$name.scn.in" | python3 "$here/gui-test.py" rows "$SPUN_TEST_SERVER" "$SPUN_TEST_PORT")
    scn=${scn//@SPUN@/$spun}
    scn=${scn//@PORT@/$port}
    scn=${scn//@CAT@/$work/old.cat}
    printf '%s\n' "$scn" > "$work/$name.scn"

    (cd "$MANE_HARNESS" && ./run.py "$work/$name.scn" --mame "$(command -v "$MAME")") | tee "$work/run.out" || status=$?
    run=$(sed -n 's/^run dir *//p' "$work/run.out")
    python3 "$here/gui-test.py" pointers "$work/$name.scn" "$run" || status=1
    got=$(sed -En 's/^[0-9.]* (SP.*|GET .*)/\1/p' "$work/commands.log")
    "$HDFMONKEY" get "$run/sd.img" /sys/spun.cat "$work/spun.cat" > /dev/null 2>&1 || : > "$work/spun.cat"
    echo "spun.cat after the run:"
    cat "$work/spun.cat"
}

status=0
info_app="SPINFO $SPUN_TEST_APP 1"
info_gui="SPINFO gui024 1"
get_app="GET $APP_USER/$SPUN_TEST_APP-$APP_SERIAL.zip"
get_gui="GET $GUI_USER/gui024-$GUI_SERIAL.zip"
app_zip=$storage/public/$APP_USER/$SPUN_TEST_APP-$APP_SERIAL.zip

# Install: the app page, install_check, the page after the browser, gui_install, the page after it
scenario spun-install
install_run=$run
check "commands  install" "$(printf '%s\n' "SPLIST 1" "$info_gui" "$info_gui" "$info_gui" "$info_gui" "$get_gui" "$info_gui")" "$got"
check "spun.cat  install" "gui024 $GUI_SERIAL $GUI_VERSION C:/APPS/" "$(cat "$work/spun.cat")"
installed "$gui_zip"
basic_screen 3 SPUNBEFORE1 SPUNBEFORE2 SPUNINSTALLDONE
echo "screen    BANKM (bit 3: the shadow screen) at start $(xxd -p "$run/dump-bankm-start.bin"), at the end $(xxd -p "$run/dump-bankm-end.bin")"
echo "screen    NextRegs at start: $(cat "$run/dump-start-regs.txt"); at the end: $(cat "$run/dump-end-regs.txt")"

# Update: the check at start, Ignore sends nothing more than SPLIST; the second
# start checks again, and Update installs both
scenario spun-update
update_run=$run
check "commands  update" "$(printf '%s\n' "$info_app" "$info_gui" "SPLIST 1" "$info_app" "$info_gui" \
    "$info_app" "$get_app" "$info_gui" "$get_gui" "SPLIST 1")" "$got"
check "spun.cat  update" "$(printf '%s\n' "$SPUN_TEST_APP $APP_SERIAL $APP_VERSION C:/APPS/" "gui024 $GUI_SERIAL $GUI_VERSION C:/APPS/")" "$(cat "$work/spun.cat")"
installed "$app_zip"
installed "$gui_zip"
basic_screen 2 SPUNBEFORE1 SPUNUPDATEDONE

# Error: the install ends .spun; BASIC's screen is back before the message
scenario spun-error
error_run=$run
check "spun.cat  error" "" "$(cat "$work/spun.cat")"
basic_screen 3 SPUNBEFORE1 SPUNBEFORE2 "Cannot create a file"
if grep -E '^harness: reset t=([89]|[1-9][0-9])\.[0-9]* machine reset' "$run/mame.log"; then
    echo "reset     machine reset after boot DIFFERENT"
    status=1
else
    echo "reset     no machine reset after boot MATCH"
fi

if [ -n "${SPUN_SNAPSHOTS:-}" ]; then
    mkdir -p "$SPUN_SNAPSHOTS"
    for shot in 0020.5:app 0024.5:browser 0029.5:browser-apps 0032.5:confirm 0038.5:downloading 0046.5:unzipping \
        0051.5:installed 0061.5:basic-after; do
        cp "$install_run/snap/snap-${shot%%:*}.png" "$SPUN_SNAPSHOTS/p78-install-${shot#*:}.png"
    done
    for shot in 0014.5:modal 0019.5:ignored 0039.0:downloading 0046.0:unzipping 0051.0:updated 0064.0:basic-after; do
        cp "$update_run/snap/snap-${shot%%:*}.png" "$SPUN_SNAPSHOTS/p78-update-${shot#*:}.png"
    done
    for shot in 0032.5:confirm 0035.5:basic-after; do
        cp "$error_run/snap/snap-${shot%%:*}.png" "$SPUN_SNAPSHOTS/p78-error-${shot#*:}.png"
    done
    cp "$install_run/montage.png" "$SPUN_SNAPSHOTS/p78-install-montage.png"
    cp "$update_run/montage.png" "$SPUN_SNAPSHOTS/p78-update-montage.png"
    cp "$error_run/montage.png" "$SPUN_SNAPSHOTS/p78-error-montage.png"
fi
exit $status
