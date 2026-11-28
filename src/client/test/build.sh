#!/bin/bash
# Builds the test binaries of .spun:
#   dot/BUILD-test/spun, dot/BUILD-test-posix/spun: SPUN_TEST_SERVER and SPUN_TEST_PORT
#     from .env are the default server.
#   dot/BUILD-test-s/spun: the Makefile's default server, for the test of -s and -p.
#   dot/BUILD-test-repair/spun: as BUILD-test, with the self-repair, for mame-repair.sh.
#     The others have no self-repair, as a build of any NAME but spun.
# ZOPT is empty: the release build's --max-allocs-per-node takes hours.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
set -a
. "$here/.env"
set +a

cd "$here/../dot"
test="SERVER=$SPUN_TEST_SERVER PORT=$SPUN_TEST_PORT"
make $test SELF_REPAIR=0 ZOPT= BUILD_DIR=./BUILD-test binaries
rm -rf BUILD-test-posix
make $test SELF_REPAIR=0 POSIX_DIR=./BUILD-test-posix posix
make SELF_REPAIR=0 ZOPT= BUILD_DIR=./BUILD-test-s binaries
make $test SELF_REPAIR=1 ZOPT= BUILD_DIR=./BUILD-test-repair binaries
